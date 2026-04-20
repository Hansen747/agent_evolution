"""
WebSocket channel for agent-to-platform persistent connections.

Protocol (JSON over WS):

  -- Connection --
  Agent connects:  GET /ws/agent/channel?key={api_key}
  Server confirms: {"type": "connected", "agent_id": "...", "agent_name": "..."}

  -- Heartbeat --
  Client sends:    {"type": "ping"}
  Server replies:  {"type": "pong"}

  -- Session lifecycle --
  Agent→Platform:  {"type": "create_session", "expert_id": "...", "topic": "...",
                    "learning_objective": "...", "message": "..."}
  Platform→Student:{"type": "session_created", "session_id": "...", ...}
  Platform→Expert: {"type": "new_session", "session_id": "...", "your_role": "expert",
                    "topic": "...", "learning_objective": "...",
                    "student": {"name": "...", "description": "..."},
                    "message": "..."}

  -- Messaging (turn-based) --
  Agent→Platform:  {"type": "message", "session_id": "...", "content": "..."}
  Platform→Other:  {"type": "message", "session_id": "...", "sender_role": "...",
                    "content": "...", "message_id": "...", "created_at": "..."}

  -- User guidance (side-channel, doesn't flip turn) --
  REST/WS→Platform:{"type": "guidance", "session_id": "...", "content": "..."}
  Platform→Student:{"type": "guidance", "session_id": "...", "content": "...", "message_id": "..."}

  -- EvoPack sharing (expert shares teaching result) --
  Expert→Platform: {"type": "share_evopack", "session_id": "...", "asset_id": "..."}
  Platform→Student:{"type": "evopack_shared", "session_id": "...", "asset_id": "...",
                    "asset_name": "..."}

  -- Session close --
  Agent→Platform:  {"type": "close_session", "session_id": "..."}
  Platform→Both:   {"type": "session_closed", "session_id": "..."}
"""

import json
import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session as DBSession

from agentevo.core.database import SessionLocal
from agentevo.models.models import Agent, ExpertAgent, ChatSession, ChatMessage, SubagentAsset

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Agent Connection Manager
# ---------------------------------------------------------------------------

class AgentConnectionManager:
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
# Helpers
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


def _get_student_agent_id(session: ChatSession) -> str:
    return session.requester_agent_id


def _get_expert_agent_id(session: ChatSession, db: DBSession) -> Optional[str]:
    expert = db.query(ExpertAgent).filter(ExpertAgent.id == session.expert_id).first()
    return expert.agent_id if expert else None


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
    learning_objective = payload.get("learning_objective", "").strip()
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

    expert_agent = db.query(Agent).filter(Agent.id == expert.agent_id).first()

    session = ChatSession(
        requester_agent_id=agent.id,
        expert_id=expert.id,
        topic=topic,
        learning_objective=learning_objective,
        turn="expert" if message_content else "student",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

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

    # Confirm to student
    await websocket.send_json({
        "type": "session_created",
        "session_id": session.id,
        "your_role": "student",
        "expert_id": expert.id,
        "topic": topic,
        "learning_objective": learning_objective,
        "expert": {
            "name": expert.name,
            "domain": expert.domain,
            "description": expert.description,
        },
    })

    # Notify expert with rich context
    await agent_manager.send(expert.agent_id, {
        "type": "new_session",
        "session_id": session.id,
        "your_role": "expert",
        "topic": topic,
        "learning_objective": learning_objective,
        "student": {
            "name": agent.name,
            "description": agent.description,
        },
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

    # Turn control
    if session.turn != sender_role:
        await websocket.send_json({
            "type": "error",
            "detail": f"Not your turn. Waiting for {session.turn} to respond.",
        })
        return

    msg = ChatMessage(
        session_id=session.id,
        sender_role=sender_role,
        content=content,
    )
    db.add(msg)
    session.message_count += 1
    session.turn = "expert" if sender_role == "student" else "student"
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

    counterpart_id = _get_counterpart_agent_id(session, sender_role, db)
    if counterpart_id:
        await agent_manager.send(counterpart_id, outgoing)

    # Also push to frontend observers via the session broadcast
    await _broadcast_to_observers(session.id, outgoing)


async def _handle_guidance(
    agent: Agent, payload: dict, websocket: WebSocket, db: DBSession
):
    """User sends guidance to their student agent (side-channel, doesn't flip turn)."""
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

    msg = ChatMessage(
        session_id=session.id,
        sender_role="guidance",
        content=content,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    guidance_msg = {
        "type": "guidance",
        "session_id": session.id,
        "content": content,
        "message_id": msg.id,
        "created_at": msg.created_at.isoformat(),
    }

    # Send to the student agent only
    student_id = _get_student_agent_id(session)
    await agent_manager.send(student_id, guidance_msg)

    # Also push to frontend observers
    await _broadcast_to_observers(session.id, guidance_msg)


async def _handle_share_evopack(
    agent: Agent, payload: dict, websocket: WebSocket, db: DBSession
):
    """Expert shares a teaching EvoPack with the student at end of session."""
    session_id = payload.get("session_id", "").strip()
    asset_id = payload.get("asset_id", "").strip()

    if not session_id or not asset_id:
        await websocket.send_json({"type": "error", "detail": "Missing session_id or asset_id"})
        return

    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        await websocket.send_json({"type": "error", "detail": "Session not found"})
        return

    sender_role = _get_sender_role(session, agent.id, db)
    if sender_role != "expert":
        await websocket.send_json({"type": "error", "detail": "Only the expert can share an EvoPack"})
        return

    asset = db.query(SubagentAsset).filter(SubagentAsset.id == asset_id).first()
    if not asset:
        await websocket.send_json({"type": "error", "detail": "Asset not found"})
        return

    session.shared_asset_id = asset_id
    db.commit()

    shared_msg = {
        "type": "evopack_shared",
        "session_id": session.id,
        "asset_id": asset.id,
        "asset_name": asset.name,
    }

    # Notify student
    student_id = _get_student_agent_id(session)
    await agent_manager.send(student_id, shared_msg)

    # Confirm to expert
    await websocket.send_json(shared_msg)

    # Notify observers
    await _broadcast_to_observers(session.id, shared_msg)


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

    await _broadcast_to_observers(session.id, closed_msg)


# ---------------------------------------------------------------------------
# Frontend observer WebSocket (read-only session subscription)
# ---------------------------------------------------------------------------

class ObserverManager:
    """Manages frontend WebSocket connections that observe session messages (read-only)."""

    def __init__(self):
        self.observers: Dict[str, list[WebSocket]] = {}

    async def subscribe(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.observers.setdefault(session_id, []).append(websocket)

    def unsubscribe(self, session_id: str, websocket: WebSocket):
        if session_id in self.observers:
            self.observers[session_id] = [
                ws for ws in self.observers[session_id] if ws is not websocket
            ]

    async def broadcast(self, session_id: str, message: dict):
        for ws in self.observers.get(session_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                pass


observer_manager = ObserverManager()


async def _broadcast_to_observers(session_id: str, message: dict):
    await observer_manager.broadcast(session_id, message)


@router.websocket("/ws/session/{session_id}/observe")
async def observe_session(websocket: WebSocket, session_id: str, token: str = ""):
    """
    Read-only WebSocket for frontend users to observe a session in real-time.

    Query params:
      - token: user JWT or session_token for auth
    """
    db = SessionLocal()
    try:
        session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not session:
            await websocket.close(code=4004, reason="Session not found")
            return

        # Simple auth: accept if session_token matches
        if token != session.session_token:
            await websocket.close(code=4003, reason="Invalid token")
            return

        await observer_manager.subscribe(session_id, websocket)

        try:
            while True:
                data = await websocket.receive_text()
                # Observers can send guidance messages
                try:
                    payload = json.loads(data)
                    if payload.get("type") == "guidance":
                        content = payload.get("content", "").strip()
                        if content and session.status == "open":
                            msg = ChatMessage(
                                session_id=session.id,
                                sender_role="guidance",
                                content=content,
                            )
                            db.add(msg)
                            db.commit()
                            db.refresh(msg)

                            guidance_msg = {
                                "type": "guidance",
                                "session_id": session.id,
                                "content": content,
                                "message_id": msg.id,
                                "created_at": msg.created_at.isoformat(),
                            }

                            student_id = _get_student_agent_id(session)
                            await agent_manager.send(student_id, guidance_msg)
                            await _broadcast_to_observers(session.id, guidance_msg)
                except json.JSONDecodeError:
                    pass
        except WebSocketDisconnect:
            pass
    finally:
        observer_manager.unsubscribe(session_id, websocket)
        db.close()


# ---------------------------------------------------------------------------
# Agent channel WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/agent/channel")
async def agent_channel(websocket: WebSocket, key: str = ""):
    """
    Persistent WebSocket channel for agents.

    Query params:
      - key: the agent's API key (ag_xxxx)
    """
    db = SessionLocal()
    agent = None
    try:
        if not key:
            await websocket.close(code=4003, reason="Missing API key")
            return

        agent = db.query(Agent).filter(Agent.api_key == key).first()
        if not agent:
            await websocket.close(code=4003, reason="Invalid API key")
            return

        await agent_manager.connect(agent.id, websocket)

        agent.status = "online"
        agent.last_heartbeat = datetime.now(timezone.utc)
        db.commit()

        await websocket.send_json({
            "type": "connected",
            "agent_id": agent.id,
            "agent_name": agent.name,
        })

        logger.info(f"Agent connected: {agent.name} ({agent.id})")

        try:
            while True:
                data = await websocket.receive_text()

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
                elif msg_type == "guidance":
                    await _handle_guidance(agent, payload, websocket, db)
                elif msg_type == "share_evopack":
                    await _handle_share_evopack(agent, payload, websocket, db)
                elif msg_type == "close_session":
                    await _handle_close_session(agent, payload, websocket, db)
                else:
                    await websocket.send_json({"type": "error", "detail": f"Unknown message type: {msg_type}"})

        except WebSocketDisconnect:
            pass

    finally:
        if agent:
            agent_manager.disconnect(agent.id)
            agent.status = "offline"
            db.commit()
            logger.info(f"Agent disconnected: {agent.name} ({agent.id})")
        db.close()
