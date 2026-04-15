"""
WebSocket endpoint for platform expert consultations.

Architecture:
  Student Agent ←— WS —→ Platform (this endpoint)
                              ↓ internal dispatch
                         Platform Expert Agent (internal service)

The student connects via WebSocket. The platform authenticates, persists
messages, dispatches to the expert agent process, and pushes the expert's
reply back through the same WS connection.  The expert never has its own
WS — it's an internal service invoked by the platform.

Protocol (JSON over WS):
  Client sends:   {"content": "..."}
  Server pushes:  {"type": "message", "sender_role": "student"|"expert",
                   "content": "...", "message_id": "...", "created_at": "..."}
  Control msgs:   {"type": "error", "detail": "..."}
                  {"type": "session_closed"}
"""

import json
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session as DBSession

from agentevo.core.database import SessionLocal
from agentevo.models.models import ChatSession, ChatMessage, ExpertAgent

router = APIRouter()


# ---------------------------------------------------------------------------
# Connection manager — tracks student WS connections only
# ---------------------------------------------------------------------------

class ConnectionManager:
    """Manages active student WebSocket connections, keyed by session_id."""

    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}   # session_id -> WebSocket

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.connections[session_id] = websocket

    def disconnect(self, session_id: str):
        self.connections.pop(session_id, None)

    async def send(self, session_id: str, message: dict):
        ws = self.connections.get(session_id)
        if ws:
            await ws.send_json(message)

    def is_connected(self, session_id: str) -> bool:
        return session_id in self.connections


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Platform expert dispatch — extensible hook for real expert agent processes
# ---------------------------------------------------------------------------

async def dispatch_to_platform_expert(
    expert: ExpertAgent,
    session: ChatSession,
    student_message: str,
    history: list[dict],
) -> str:
    """
    Route the student's message to the platform expert agent and return its
    reply.

    This is the integration point for real expert agent processes.  Currently
    returns a placeholder — replace with actual expert agent invocation
    (e.g. sub-process call, internal API, LLM-with-tools pipeline, etc.).

    Args:
        expert:          The ExpertAgent record.
        session:         The ChatSession record.
        student_message: The latest message from the student.
        history:         Prior messages as [{"role": "student"|"expert", "content": ...}, ...].

    Returns:
        The expert agent's reply text.
    """
    # TODO: integrate with real platform expert agent processes
    return (
        f"[Platform Expert '{expert.name}' ({expert.domain})] "
        f"Received your message. Expert agent integration is pending — "
        f"this is a placeholder reply."
    )


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

def _get_db() -> DBSession:
    return SessionLocal()


@router.websocket("/ws/chat/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str, token: str = ""):
    """
    WebSocket endpoint for student agents to chat with platform experts.

    Query params:
      - token: session_token obtained when creating the ChatSession
    """
    db = _get_db()
    try:
        # --- authenticate ---
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.session_token == token,
            ChatSession.status == "open",
        ).first()
        if not session:
            await websocket.close(code=4003, reason="Invalid session or token")
            return

        expert = db.query(ExpertAgent).filter(ExpertAgent.id == session.expert_id).first()
        if not expert or not expert.is_platform:
            await websocket.close(code=4004, reason="WebSocket is only for platform expert sessions")
            return

        # --- connect ---
        await manager.connect(session_id, websocket)

        try:
            while True:
                data = await websocket.receive_text()

                # parse
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                    continue

                content = payload.get("content", "").strip()
                if not content:
                    await websocket.send_json({"type": "error", "detail": "Empty message"})
                    continue

                # persist student message
                student_msg = ChatMessage(
                    session_id=session_id,
                    sender_role="student",
                    content=content,
                )
                db.add(student_msg)
                session.message_count += 1
                db.commit()
                db.refresh(student_msg)

                # echo student message back as confirmation
                await websocket.send_json({
                    "type": "message",
                    "message_id": student_msg.id,
                    "sender_role": "student",
                    "content": content,
                    "created_at": student_msg.created_at.isoformat(),
                })

                # build conversation history for expert
                history_rows = (
                    db.query(ChatMessage)
                    .filter(ChatMessage.session_id == session_id)
                    .order_by(ChatMessage.created_at.asc())
                    .all()
                )
                history = [
                    {"role": m.sender_role, "content": m.content}
                    for m in history_rows
                ]

                # dispatch to platform expert agent
                expert_reply = await dispatch_to_platform_expert(
                    expert=expert,
                    session=session,
                    student_message=content,
                    history=history,
                )

                # persist expert reply
                expert_msg = ChatMessage(
                    session_id=session_id,
                    sender_role="expert",
                    content=expert_reply,
                )
                db.add(expert_msg)
                session.message_count += 1
                db.commit()
                db.refresh(expert_msg)

                # push expert reply to student
                await websocket.send_json({
                    "type": "message",
                    "message_id": expert_msg.id,
                    "sender_role": "expert",
                    "content": expert_reply,
                    "created_at": expert_msg.created_at.isoformat(),
                })

        except WebSocketDisconnect:
            manager.disconnect(session_id)

    finally:
        db.close()
