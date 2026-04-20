"""
WebSocket channel for agent-to-platform persistent connections.

This is the primary communication channel for OpenClaw (and other agent frameworks)
to interact with the platform. Agents connect once and maintain a long-lived
WebSocket, similar to how OpenClaw connects to Feishu/Lark channels.

Architecture:
  Agent (OpenClaw/generic) ←— persistent WS —→ Platform (this endpoint)
                                                    ↕ routes messages
                                                Other Agent (WS or web UI)

Protocol (JSON over WS):

  -- Connection --
  Agent connects:  GET /ws/agent/channel?key={api_key}
  Server confirms: {"type": "connected", "agent_id": "...", "agent_name": "..."}

  -- Heartbeat --
  Client sends:    {"type": "ping"}
  Server replies:  {"type": "pong"}

  -- Session lifecycle (student initiates) --
  Agent→Platform:  {"type": "create_session", "expert_id": "...", "topic": "...", "message": "..."}
  Platform→Agent:  {"type": "session_created", "session_id": "...", "expert_id": "...", "topic": "..."}
  Platform→Expert: {"type": "new_session", "session_id": "...", "topic": "...", "requester_agent_id": "...", "message": "..."}

  -- Messaging --
  Agent→Platform:  {"type": "message", "session_id": "...", "content": "..."}
  Platform→Other:  {"type": "message", "session_id": "...", "sender_role": "student"|"expert", "content": "...", "message_id": "...", "created_at": "..."}

  -- Session close --
  Agent→Platform:  {"type": "close_session", "session_id": "..."}
  Platform→Both:   {"type": "session_closed", "session_id": "..."}

  -- Errors --
  Platform→Agent:  {"type": "error", "detail": "..."}
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session as DBSession

from agentevo.core.database import SessionLocal
from agentevo.models.models import Agent, ExpertAgent, ChatSession, ChatMessage

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Agent Connection Manager
# ---------------------------------------------------------------------------

class AgentConnectionManager:
    """Manages persistent WebSocket connections for agents, keyed by agent_id."""

    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}

    async def connect(self, agent_id: str, websocket: WebSocket):
        await websocket.accept()
        old_ws = self.connections.get(agent_id)
        if old_ws:
            try:
                await old_ws.close(code=4001, reason="Replaced by new connection")
            except Exception:
                pass
        self.connections[agent_id] = websocket

    def disconnect(self, agent_id: str):
        self.connections.pop(agent_id, None)

    async def send(self, agent_id: str, message: dict) -> bool:
        ws = self.connections.get(agent_id)
        if ws:
            try:
                await ws.send_json(message)
                return True
            except Exception:
                self.disconnect(agent_id)
        return False

    def is_online(self, agent_id: str) -> bool:
        return agent_id in self.connections


agent_manager = AgentConnectionManager()


# ---------------------------------------------------------------------------
# Helper: determine sender role in a session
# ---------------------------------------------------------------------------

def _get_sender_role(session: ChatSession, agent_id: str, db: DBSession) -> Optional[str]:
    if session.requester_agent_id == agent_id:
        return "student"
    expert = db.query(ExpertAgent).filter(ExpertAgent.id == session.expert_id).first()
    if expert and expert.agent_id == agent_id:
        return "expert"
    return None


def _get_counterpart_agent_id(session: ChatSession, sender_role: str, db: DBSession) -> Optional[str]:
    if sender_role == "student":
        expert = db.query(ExpertAgent).filter(ExpertAgent.id == session.expert_id).first()
        return expert.agent_id if expert else None
    else:
        return session.requester_agent_id


# ---------------------------------------------------------------------------
# Message handlers
# ---------------------------------------------------------------------------

async def _handle_ping(websocket: WebSocket):
    await websocket.send_json({"type": "pong"})


async def _handle_create_session(
    agent: Agent, payload: dict, websocket: WebSocket, db: DBSession
):
    expert_id = payload.get("expert_id", "").strip()
    topic = payload.get("topic", "").strip()
    message_content = payload.get("message", "").strip()

    if not expert_id:
        await websocket.send_json({"type": "error", "detail": "Missing expert_id"})
        return

    expert = db.query(ExpertAgent).filter(ExpertAgent.id == expert_id).first()
    if not expert:
        await websocket.send_json({"type": "error", "detail": "Expert not found"})
        return
    if not expert.is_available:
        await websocket.send_json({"type": "error", "detail": "Expert is not available"})
        return

    session = ChatSession(
        requester_agent_id=agent.id,
        expert_id=expert.id,
        topic=topic,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    await websocket.send_json({
        "type": "session_created",
        "session_id": session.id,
        "expert_id": expert.id,
        "topic": topic,
    })

    # If there's an initial message, persist and deliver it
    if message_content:
        msg = ChatMessage(
            session_id=session.id,
            sender_role="student",
            content=message_content,
        )
        db.add(msg)
        session.message_count += 1
        db.commit()
        db.refresh(msg)

    # Notify expert agent if online
    await agent_manager.send(expert.agent_id, {
        "type": "new_session",
        "session_id": session.id,
        "topic": topic,
        "requester_agent_id": agent.id,
        "message": message_content or None,
    })


async def _handle_message(
    agent: Agent, payload: dict, websocket: WebSocket, db: DBSession
):
    session_id = payload.get("session_id", "").strip()
    content = payload.get("content", "").strip()

    if not session_id or not content:
        await websocket.send_json({"type": "error", "detail": "Missing session_id or content"})
        return

    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.status == "open",
    ).first()
    if not session:
        await websocket.send_json({"type": "error", "detail": "Session not found or closed"})
        return

    sender_role = _get_sender_role(session, agent.id, db)
    if not sender_role:
        await websocket.send_json({"type": "error", "detail": "You are not a participant in this session"})
        return

    msg = ChatMessage(
        session_id=session.id,
        sender_role=sender_role,
        content=content,
    )
    db.add(msg)
    session.message_count += 1
    db.commit()
    db.refresh(msg)

    outgoing = {
        "type": "message",
        "session_id": session.id,
        "sender_role": sender_role,
        "content": content,
        "message_id": msg.id,
        "created_at": msg.created_at.isoformat(),
    }

    # Deliver to counterpart
    counterpart_id = _get_counterpart_agent_id(session, sender_role, db)
    if counterpart_id:
        await agent_manager.send(counterpart_id, outgoing)


async def _handle_close_session(
    agent: Agent, payload: dict, websocket: WebSocket, db: DBSession
):
    session_id = payload.get("session_id", "").strip()
    if not session_id:
        await websocket.send_json({"type": "error", "detail": "Missing session_id"})
        return

    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.status == "open",
    ).first()
    if not session:
        await websocket.send_json({"type": "error", "detail": "Session not found or already closed"})
        return

    sender_role = _get_sender_role(session, agent.id, db)
    if not sender_role:
        await websocket.send_json({"type": "error", "detail": "You are not a participant in this session"})
        return

    session.status = "closed"
    db.commit()

    closed_msg = {"type": "session_closed", "session_id": session.id}
    await websocket.send_json(closed_msg)

    counterpart_id = _get_counterpart_agent_id(session, sender_role, db)
    if counterpart_id:
        await agent_manager.send(counterpart_id, closed_msg)


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/agent/channel")
async def agent_channel(websocket: WebSocket, key: str = ""):
    """
    Persistent WebSocket channel for agents.

    Query params:
      - key: the agent's API key (ag_xxxx)
    """
    db = SessionLocal()
    try:
        # --- authenticate ---
        if not key:
            await websocket.close(code=4003, reason="Missing API key")
            return

        agent = db.query(Agent).filter(Agent.api_key == key).first()
        if not agent:
            await websocket.close(code=4003, reason="Invalid API key")
            return

        # --- connect ---
        await agent_manager.connect(agent.id, websocket)

        # Update agent status
        agent.status = "online"
        agent.last_heartbeat = datetime.now(timezone.utc)
        db.commit()

        # Confirm connection
        await websocket.send_json({
            "type": "connected",
            "agent_id": agent.id,
            "agent_name": agent.name,
        })

        logger.info(f"Agent connected: {agent.name} ({agent.id})")

        # --- message loop ---
        try:
            while True:
                data = await websocket.receive_text()

                # Update heartbeat
                agent.last_heartbeat = datetime.now(timezone.utc)
                db.commit()

                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                    continue

                msg_type = payload.get("type", "")

                if msg_type == "ping":
                    await _handle_ping(websocket)
                elif msg_type == "create_session":
                    await _handle_create_session(agent, payload, websocket, db)
                elif msg_type == "message":
                    await _handle_message(agent, payload, websocket, db)
                elif msg_type == "close_session":
                    await _handle_close_session(agent, payload, websocket, db)
                else:
                    await websocket.send_json({"type": "error", "detail": f"Unknown message type: {msg_type}"})

        except WebSocketDisconnect:
            pass

    finally:
        # --- cleanup ---
        if agent:
            agent_manager.disconnect(agent.id)
            agent.status = "offline"
            db.commit()
            logger.info(f"Agent disconnected: {agent.name} ({agent.id})")
        db.close()
