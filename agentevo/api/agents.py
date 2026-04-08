"""
Agent API: register agents, heartbeat, list agents, operation logs.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from agentevo.core.database import get_db
from agentevo.core.security import get_current_user_id
from agentevo.models.models import Agent, OperationLog
from agentevo.api.schemas import (
    AgentRegisterRequest, AgentResponse, AgentHeartbeatRequest,
    OperationLogCreateRequest, OperationLogResponse,
    PaginatedResponse, MessageResponse,
)

router = APIRouter(prefix="/agents", tags=["agents"])


# ---- Agent CRUD -----------------------------------------------------------

@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def register_agent(
    req: AgentRegisterRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Register a new AI agent for the current user."""
    agent = Agent(
        owner_id=user_id,
        name=req.name,
        description=req.description,
        agent_type=req.agent_type,
        capabilities=req.capabilities,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.get("/", response_model=list[AgentResponse])
def list_agents(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all agents owned by the current user."""
    return db.query(Agent).filter(Agent.owner_id == user_id).all()


@router.get("/{agent_id}", response_model=AgentResponse)
def get_agent(
    agent_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get a specific agent."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.owner_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.delete("/{agent_id}", response_model=MessageResponse)
def delete_agent(
    agent_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Delete an agent."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.owner_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.delete(agent)
    db.commit()
    return MessageResponse(message="Agent deleted")


# ---- Heartbeat ------------------------------------------------------------

@router.post("/{agent_id}/heartbeat", response_model=MessageResponse)
def heartbeat(
    agent_id: str,
    req: AgentHeartbeatRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Agent heartbeat — keeps the agent status up to date."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.owner_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.status = req.status
    agent.last_heartbeat = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="Heartbeat recorded")


# ---- Operation Logs -------------------------------------------------------

@router.post("/logs", response_model=OperationLogResponse, status_code=status.HTTP_201_CREATED)
def create_operation_log(
    req: OperationLogCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Record an agent operation."""
    # Verify agent ownership
    agent = db.query(Agent).filter(Agent.id == req.agent_id, Agent.owner_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or not owned by you")

    log = OperationLog(
        agent_id=req.agent_id,
        user_id=user_id,
        action=req.action,
        target_type=req.target_type,
        target_id=req.target_id,
        details=req.details,
        status=req.status,
        error_message=req.error_message,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/logs/{agent_id}", response_model=PaginatedResponse)
def list_operation_logs(
    agent_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List operation logs for a specific agent."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.owner_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    query = db.query(OperationLog).filter(OperationLog.agent_id == agent_id)
    if action:
        query = query.filter(OperationLog.action == action)

    total = query.count()
    logs = (
        query.order_by(OperationLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PaginatedResponse(
        items=[OperationLogResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
    )
