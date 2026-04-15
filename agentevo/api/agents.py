"""Agent API: register agents, manage one-time binding keys, heartbeat, and logs."""

from datetime import datetime, timezone
import hashlib
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from agentevo.core.database import get_db
from agentevo.core.security import get_current_agent, get_current_user_id, get_optional_agent, get_optional_user_id
from agentevo.models.models import Agent, AgentBindingKey, OperationLog
from agentevo.api.schemas import (
    AgentRegisterRequest, AgentResponse, AgentHeartbeatRequest,
    AgentCredentialLinkRequest, AgentBindingKeyCreateRequest,
    AgentBindingKeyResponse, AgentBindingKeyCreateResponse,
    AgentBindWithKeyRequest,
    OperationLogCreateRequest, OperationLogResponse,
    PaginatedResponse, MessageResponse,
)

router = APIRouter(prefix="/agents", tags=["agents"])


# ---- Agent CRUD -----------------------------------------------------------

def _bind_agent_to_user(agent: Agent, user_id: str, association_type: str):
    if agent.owner_id and agent.owner_id != user_id:
        raise HTTPException(status_code=409, detail="Agent is already linked to another user")
    if agent.owner_id == user_id and agent.association_type != "unbound":
        raise HTTPException(status_code=409, detail="Agent is already linked to your account")

    agent.owner_id = user_id
    agent.association_type = association_type
    agent.bound_at = datetime.now(timezone.utc)


def _hash_binding_key(binding_key: str) -> str:
    return hashlib.sha256(binding_key.encode("utf-8")).hexdigest()


def _generate_binding_key() -> str:
    return f"agbind_{secrets.token_urlsafe(24)}"


def _binding_key_preview(binding_key: str) -> str:
    return f"{binding_key[:10]}...{binding_key[-4:]}"


def _require_agent_owner_or_credential(
    agent: Agent,
    user_id: Optional[str],
    credential_agent: Optional[Agent],
):
    if credential_agent and credential_agent.id == agent.id:
        return
    if user_id and agent.owner_id == user_id:
        return

    raise HTTPException(status_code=403, detail="You do not have access to this agent")


@router.post("/self-register", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def self_register_agent(
    req: AgentRegisterRequest,
    db: Session = Depends(get_db),
):
    """Allow an agent to register itself before it is linked to a user account."""
    agent = Agent(
        owner_id=None,
        name=req.name,
        description=req.description,
        agent_type=req.agent_type,
        capabilities=req.capabilities,
        association_type="unbound",
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.post("/binding-keys", response_model=AgentBindingKeyCreateResponse, status_code=status.HTTP_201_CREATED)
def create_binding_key(
    req: AgentBindingKeyCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Generate a one-time binding key that can be consumed by a single agent."""
    binding_key = _generate_binding_key()
    record = AgentBindingKey(
        user_id=user_id,
        name=req.name.strip(),
        key_hash=_hash_binding_key(binding_key),
        key_preview=_binding_key_preview(binding_key),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return AgentBindingKeyCreateResponse(
        **AgentBindingKeyResponse.model_validate(record).model_dump(),
        binding_key=binding_key,
    )


@router.get("/binding-keys", response_model=list[AgentBindingKeyResponse])
def list_binding_keys(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List one-time binding keys created by the current user."""
    return (
        db.query(AgentBindingKey)
        .filter(AgentBindingKey.user_id == user_id)
        .order_by(AgentBindingKey.created_at.desc())
        .all()
    )


@router.delete("/binding-keys/{binding_key_id}", response_model=MessageResponse)
def revoke_binding_key(
    binding_key_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Revoke an unused or unused-looking binding key."""
    binding_key = (
        db.query(AgentBindingKey)
        .filter(AgentBindingKey.id == binding_key_id, AgentBindingKey.user_id == user_id)
        .first()
    )
    if not binding_key:
        raise HTTPException(status_code=404, detail="Binding key not found")
    if binding_key.revoked_at is not None:
        return MessageResponse(message="Binding key already revoked")

    binding_key.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="Binding key revoked")


@router.post("/bind-with-key", response_model=AgentResponse)
def bind_self_registered_agent_with_key(
    req: AgentBindWithKeyRequest,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    """Bind an unbound agent to a user by consuming a one-time binding key."""
    binding_key = (
        db.query(AgentBindingKey)
        .filter(AgentBindingKey.key_hash == _hash_binding_key(req.binding_key))
        .first()
    )
    if not binding_key:
        raise HTTPException(status_code=404, detail="Binding key not found")
    if binding_key.revoked_at is not None:
        raise HTTPException(status_code=400, detail="Binding key has been revoked")
    if binding_key.used_at is not None:
        raise HTTPException(status_code=400, detail="Binding key has already been used")

    _bind_agent_to_user(agent, binding_key.user_id, "agent_self_bound")
    binding_key.used_by_agent_id = agent.id
    binding_key.used_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(agent)
    return agent


@router.post("/bind-self", response_model=AgentResponse)
def bind_self_registered_agent(
    user_id: str = Depends(get_current_user_id),
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    """Bind the current agent credential to the current user account."""
    _bind_agent_to_user(agent, user_id, "agent_self_bound")
    db.commit()
    db.refresh(agent)
    return agent


@router.post("/link-existing", response_model=AgentResponse)
def link_existing_agent(
    req: AgentCredentialLinkRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Link an existing agent to the current user by providing its credential."""
    agent = db.query(Agent).filter(Agent.api_key == req.api_key).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent credential not found")

    _bind_agent_to_user(agent, user_id, "user_added_by_credential")
    db.commit()
    db.refresh(agent)
    return agent

@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def register_agent(
    req: AgentRegisterRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Manually register a new AI agent for the current user."""
    agent = Agent(
        owner_id=user_id,
        name=req.name,
        description=req.description,
        agent_type=req.agent_type,
        capabilities=req.capabilities,
        association_type="user_manual_registered",
        bound_at=datetime.now(timezone.utc),
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
    user_id: Optional[str] = Depends(get_optional_user_id),
    credential_agent: Optional[Agent] = Depends(get_optional_agent),
    db: Session = Depends(get_db),
):
    """Agent heartbeat — keeps the agent status up to date."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    _require_agent_owner_or_credential(agent, user_id, credential_agent)

    agent.status = req.status
    agent.last_heartbeat = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="Heartbeat recorded")


# ---- Operation Logs -------------------------------------------------------

@router.post("/logs", response_model=OperationLogResponse, status_code=status.HTTP_201_CREATED)
def create_operation_log(
    req: OperationLogCreateRequest,
    user_id: Optional[str] = Depends(get_optional_user_id),
    credential_agent: Optional[Agent] = Depends(get_optional_agent),
    db: Session = Depends(get_db),
):
    """Record an agent operation."""
    agent = db.query(Agent).filter(Agent.id == req.agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    _require_agent_owner_or_credential(agent, user_id, credential_agent)

    log_user_id = agent.owner_id or user_id
    if not log_user_id:
        raise HTTPException(
            status_code=409,
            detail="Agent must be linked to a user before operation logs can be recorded",
        )

    log = OperationLog(
        agent_id=req.agent_id,
        user_id=log_user_id,
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
