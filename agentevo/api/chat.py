"""
Chat API: expert discovery, session management, message relay.

Two communication modes:
  - Platform experts: WebSocket real-time (see ws_chat.py)
  - Community experts: REST-based message relay (this module)
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from agentevo.core.database import get_db
from agentevo.core.security import get_current_user_id
from agentevo.models.models import (
    ExpertAgent, Agent, ChatSession, ChatMessage,
)
from agentevo.api.schemas import (
    ExpertRegisterRequest, ExpertUpdateRequest, ExpertResponse,
    ChatSessionCreateRequest, ChatSessionResponse,
    ChatMessageSendRequest, ChatMessageResponse,
    PaginatedResponse, MessageResponse,
)

router = APIRouter(tags=["chat"])


# =====================================================================
# Expert Discovery
# =====================================================================

@router.post("/experts/", response_model=ExpertResponse, status_code=status.HTTP_201_CREATED)
def register_expert(
    req: ExpertRegisterRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Register one of your agents as a community expert."""
    agent = db.query(Agent).filter(
        Agent.id == req.agent_id, Agent.owner_id == user_id
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or not owned by you")

    existing = db.query(ExpertAgent).filter(ExpertAgent.agent_id == req.agent_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="This agent is already registered as an expert")

    expert = ExpertAgent(
        agent_id=req.agent_id,
        name=req.name,
        domain=req.domain,
        description=req.description,
        is_platform=False,
        tags=req.tags,
        max_concurrent=req.max_concurrent,
    )
    db.add(expert)
    db.commit()
    db.refresh(expert)
    return expert


@router.get("/experts/", response_model=PaginatedResponse)
def list_experts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    domain: Optional[str] = None,
    search: Optional[str] = None,
    is_platform: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """Browse available expert agents."""
    query = db.query(ExpertAgent).join(Agent, ExpertAgent.agent_id == Agent.id).filter(ExpertAgent.is_available == True)

    if domain:
        query = query.filter(ExpertAgent.domain == domain)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                ExpertAgent.name.ilike(pattern),
                ExpertAgent.description.ilike(pattern),
                ExpertAgent.domain.ilike(pattern),
            )
        )
    if is_platform is not None:
        query = query.filter(ExpertAgent.is_platform == is_platform)

    total = query.count()
    items = (
        query.order_by(ExpertAgent.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PaginatedResponse(
        items=[ExpertResponse.model_validate(e) for e in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/experts/me", response_model=list[ExpertResponse])
def list_my_experts(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all expert profiles registered for the current user's agents."""
    user_agent_ids = [
        agent.id for agent in db.query(Agent).filter(Agent.owner_id == user_id).all()
    ]
    if not user_agent_ids:
        return []

    experts = (
        db.query(ExpertAgent)
        .filter(ExpertAgent.agent_id.in_(user_agent_ids))
        .order_by(ExpertAgent.created_at.desc())
        .all()
    )
    return [ExpertResponse.model_validate(expert) for expert in experts]


@router.get("/experts/{expert_id}", response_model=ExpertResponse)
def get_expert(expert_id: str, db: Session = Depends(get_db)):
    """Get expert details."""
    expert = db.query(ExpertAgent).filter(ExpertAgent.id == expert_id).first()
    if not expert:
        raise HTTPException(status_code=404, detail="Expert not found")
    return expert


@router.put("/experts/{expert_id}", response_model=ExpertResponse)
def update_expert(
    expert_id: str,
    req: ExpertUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Update your expert registration."""
    expert = db.query(ExpertAgent).filter(ExpertAgent.id == expert_id).first()
    if not expert:
        raise HTTPException(status_code=404, detail="Expert not found")

    # Verify ownership
    agent = db.query(Agent).filter(
        Agent.id == expert.agent_id, Agent.owner_id == user_id
    ).first()
    if not agent:
        raise HTTPException(status_code=403, detail="Not your expert")

    if req.name is not None:
        expert.name = req.name
    if req.domain is not None:
        expert.domain = req.domain
    if req.description is not None:
        expert.description = req.description
    if req.is_available is not None:
        expert.is_available = req.is_available
    if req.tags is not None:
        expert.tags = req.tags
    if req.max_concurrent is not None:
        expert.max_concurrent = req.max_concurrent

    db.commit()
    db.refresh(expert)
    return expert


@router.delete("/experts/{expert_id}", response_model=MessageResponse)
def delete_expert(
    expert_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Unregister an expert."""
    expert = db.query(ExpertAgent).filter(ExpertAgent.id == expert_id).first()
    if not expert:
        raise HTTPException(status_code=404, detail="Expert not found")

    agent = db.query(Agent).filter(
        Agent.id == expert.agent_id, Agent.owner_id == user_id
    ).first()
    if not agent and not expert.is_platform:
        raise HTTPException(status_code=403, detail="Not your expert")

    db.delete(expert)
    db.commit()
    return MessageResponse(message="Expert unregistered")


# =====================================================================
# Chat Session Management
# =====================================================================

@router.post("/chat/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    req: ChatSessionCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Create a consultation session with an expert."""
    from agentevo.api.ws_agent_channel import agent_manager

    # Verify the requesting agent belongs to the user
    agent = db.query(Agent).filter(
        Agent.id == req.agent_id, Agent.owner_id == user_id
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or not owned by you")

    # Verify expert exists and is available
    expert = db.query(ExpertAgent).filter(ExpertAgent.id == req.expert_id).first()
    if not expert:
        raise HTTPException(status_code=404, detail="Expert not found")
    if not expert.is_available:
        raise HTTPException(status_code=400, detail="Expert is not available")

    # Check concurrent session limit for platform experts
    if expert.is_platform:
        active_count = db.query(ChatSession).filter(
            ChatSession.expert_id == expert.id,
            ChatSession.status == "open",
        ).count()
        if active_count >= expert.max_concurrent:
            raise HTTPException(status_code=429, detail="Expert has reached max concurrent sessions")

    session = ChatSession(
        requester_agent_id=req.agent_id,
        expert_id=req.expert_id,
        topic=req.topic,
        learning_objective=req.learning_objective,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Notify student agent via WebSocket
    await agent_manager.send(agent.id, {
        "type": "session_created",
        "session_id": session.id,
        "your_role": "student",
        "expert_id": expert.id,
        "topic": req.topic or "",
        "learning_objective": req.learning_objective or "",
        "expert": {
            "name": expert.name,
            "domain": expert.domain,
            "description": expert.description,
        },
    })

    # Notify expert agent via WebSocket
    await agent_manager.send(expert.agent_id, {
        "type": "new_session",
        "session_id": session.id,
        "your_role": "expert",
        "topic": req.topic or "",
        "learning_objective": req.learning_objective or "",
        "student": {
            "name": agent.name,
            "description": agent.description or "",
        },
        "message": None,
    })

    user_agent_ids = _get_user_agent_ids(user_id, db)
    return _session_to_response(session, expert, user_agent_ids, db)


@router.get("/chat/sessions", response_model=PaginatedResponse)
def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: str = Query("all", pattern="^(all|student|expert)$"),
    status_filter: Optional[str] = Query(None, alias="status"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List chat sessions where the current user's agents are involved."""
    # Get all agent IDs belonging to this user
    user_agent_ids = [
        a.id for a in db.query(Agent).filter(Agent.owner_id == user_id).all()
    ]
    if not user_agent_ids:
        return PaginatedResponse(items=[], total=0, page=page, page_size=page_size)

    # Get expert IDs linked to user's agents
    user_expert_ids = [
        e.id for e in db.query(ExpertAgent).filter(
            ExpertAgent.agent_id.in_(user_agent_ids)
        ).all()
    ]

    query = db.query(ChatSession)
    if role == "student":
        query = query.filter(ChatSession.requester_agent_id.in_(user_agent_ids))
    elif role == "expert":
        query = query.filter(ChatSession.expert_id.in_(user_expert_ids))
    else:
        query = query.filter(
            or_(
                ChatSession.requester_agent_id.in_(user_agent_ids),
                ChatSession.expert_id.in_(user_expert_ids) if user_expert_ids else False,
            )
        )

    if status_filter:
        query = query.filter(ChatSession.status == status_filter)

    total = query.count()
    sessions = (
        query.order_by(ChatSession.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for s in sessions:
        expert = db.query(ExpertAgent).filter(ExpertAgent.id == s.expert_id).first()
        items.append(_session_to_response(s, expert, user_agent_ids, db))

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/chat/sessions/{session_id}", response_model=ChatSessionResponse)
def get_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get session details."""
    session = _get_session_with_auth(session_id, user_id, db)
    expert = db.query(ExpertAgent).filter(ExpertAgent.id == session.expert_id).first()
    user_agent_ids = _get_user_agent_ids(user_id, db)
    return _session_to_response(session, expert, user_agent_ids, db)


@router.post("/chat/sessions/{session_id}/close", response_model=MessageResponse)
async def close_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Close a chat session."""
    from agentevo.api.ws_agent_channel import agent_manager, _broadcast_to_observers, _get_student_agent_id, _get_expert_agent_id

    session = _get_session_with_auth(session_id, user_id, db)
    session.status = "closed"
    db.commit()

    closed_msg = {"type": "session_closed", "session_id": session.id}
    await agent_manager.send(_get_student_agent_id(session), closed_msg)
    expert_id = _get_expert_agent_id(session, db)
    if expert_id:
        await agent_manager.send(expert_id, closed_msg)
    await _broadcast_to_observers(session.id, closed_msg)

    return MessageResponse(message="Session closed")


# =====================================================================
# Chat Messages (REST relay for community experts)
# =====================================================================

@router.post(
    "/chat/sessions/{session_id}/messages",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    session_id: str,
    req: ChatMessageSendRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Send a message in a chat session (REST relay for community experts)."""
    session = _get_session_with_auth(session_id, user_id, db)

    if session.status != "open":
        raise HTTPException(status_code=400, detail="Session is closed")

    msg = ChatMessage(
        session_id=session.id,
        sender_role=req.sender_role,
        content=req.content,
    )
    db.add(msg)
    session.message_count += 1
    db.commit()
    db.refresh(msg)
    return msg


@router.get("/chat/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
def list_messages(
    session_id: str,
    after: Optional[str] = Query(None, description="Return messages created after this message ID"),
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get messages in a session. Filters out guidance messages meant for the other side."""
    session = _get_session_with_auth(session_id, user_id, db)

    user_agent_ids = _get_user_agent_ids(user_id, db)
    expert = db.query(ExpertAgent).filter(ExpertAgent.id == session.expert_id).first()
    expert_agent_id = expert.agent_id if expert else None
    my_role = "student" if session.requester_agent_id in user_agent_ids else "expert" if expert_agent_id in user_agent_ids else "student"
    other_role = "expert" if my_role == "student" else "student"

    query = db.query(ChatMessage).filter(
        ChatMessage.session_id == session.id,
        ChatMessage.sender_role != f"guidance:{other_role}",
    )

    if after:
        ref_msg = db.query(ChatMessage).filter(ChatMessage.id == after).first()
        if ref_msg:
            query = query.filter(ChatMessage.created_at > ref_msg.created_at)

    messages = query.order_by(ChatMessage.created_at.asc()).limit(limit).all()
    return messages


# =====================================================================
# Expert-side: incoming sessions & messages
# =====================================================================

@router.get("/chat/incoming", response_model=PaginatedResponse)
def incoming_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Expert-side: list incoming consultation sessions for your expert agents."""
    user_agent_ids = [
        a.id for a in db.query(Agent).filter(Agent.owner_id == user_id).all()
    ]
    expert_ids = [
        e.id for e in db.query(ExpertAgent).filter(
            ExpertAgent.agent_id.in_(user_agent_ids)
        ).all()
    ]
    if not expert_ids:
        return PaginatedResponse(items=[], total=0, page=page, page_size=page_size)

    query = db.query(ChatSession).filter(ChatSession.expert_id.in_(expert_ids))
    if status_filter:
        query = query.filter(ChatSession.status == status_filter)

    total = query.count()
    sessions = (
        query.order_by(ChatSession.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for s in sessions:
        expert = db.query(ExpertAgent).filter(ExpertAgent.id == s.expert_id).first()
        items.append(_session_to_response(s, expert, user_agent_ids, db))

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


# =====================================================================
# Helpers
# =====================================================================

def _get_user_agent_ids(user_id: str, db: Session) -> list[str]:
    return [a.id for a in db.query(Agent).filter(Agent.owner_id == user_id).all()]


def _get_session_with_auth(session_id: str, user_id: str, db: Session) -> ChatSession:
    """Fetch a session and verify the user has access (as student or expert owner)."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user_agent_ids = _get_user_agent_ids(user_id, db)
    expert = db.query(ExpertAgent).filter(ExpertAgent.id == session.expert_id).first()
    expert_agent_id = expert.agent_id if expert else None

    is_requester = session.requester_agent_id in user_agent_ids
    is_expert_owner = expert_agent_id in user_agent_ids

    if not is_requester and not is_expert_owner:
        raise HTTPException(status_code=403, detail="Not authorized to access this session")

    return session


def _session_to_response(
    session: ChatSession,
    expert: Optional[ExpertAgent],
    user_agent_ids: list[str],
    db: Session,
) -> ChatSessionResponse:
    expert_agent_id = expert.agent_id if expert else None
    is_student = session.requester_agent_id in user_agent_ids
    is_expert_owner = expert_agent_id in user_agent_ids
    my_role = "student" if is_student else "expert" if is_expert_owner else "student"

    requester_agent = db.query(Agent).filter(Agent.id == session.requester_agent_id).first()
    expert_agent = db.query(Agent).filter(Agent.id == expert_agent_id).first() if expert_agent_id else None

    if my_role == "student":
        my_agent_name = requester_agent.name if requester_agent else ""
        peer_agent_name = expert.name if expert else ""
    else:
        my_agent_name = expert.name if expert else ""
        peer_agent_name = requester_agent.name if requester_agent else ""

    return ChatSessionResponse(
        id=session.id,
        requester_agent_id=session.requester_agent_id,
        expert_id=session.expert_id,
        topic=session.topic,
        learning_objective=session.learning_objective or "",
        status=session.status,
        turn=session.turn or "student",
        session_token=session.session_token,
        message_count=session.message_count,
        is_platform_expert=expert.is_platform if expert else False,
        shared_asset_id=session.shared_asset_id,
        my_role=my_role,
        my_agent_name=my_agent_name,
        peer_agent_name=peer_agent_name,
        expert_domain=expert.domain if expert else "",
        created_at=session.created_at,
        updated_at=session.updated_at,
    )
