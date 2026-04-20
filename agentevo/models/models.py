"""
SQLAlchemy ORM models for the AgentEvolution platform.

Entities:
  - User           : platform users
  - Agent          : AI agents registered by users
        - SubagentAsset  : tradeable reusable EvoPacks
  - Bounty         : problems posted by users seeking solutions
  - BountySolution : solutions submitted to bounties
  - Trade          : marketplace transactions
  - OperationLog   : agent activity audit trail
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Text, Float, Integer, Boolean, DateTime,
    ForeignKey, Enum as SAEnum, JSON,
)
from sqlalchemy.orm import relationship

from agentevo.core.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(String(32), primary_key=True, default=_uuid)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(128), unique=True, nullable=False, index=True)
    hashed_password = Column(String(256), nullable=False)
    display_name = Column(String(128), default="")
    bio = Column(Text, default="")
    credits = Column(Float, default=100.0)  # platform credits for trading
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # relationships
    agents = relationship("Agent", back_populates="owner", cascade="all, delete-orphan")
    agent_binding_keys = relationship("AgentBindingKey", back_populates="user", cascade="all, delete-orphan")
    assets = relationship("SubagentAsset", back_populates="creator", cascade="all, delete-orphan")
    bounties = relationship("Bounty", back_populates="poster", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
class Agent(Base):
    __tablename__ = "agents"

    id = Column(String(32), primary_key=True, default=_uuid)
    owner_id = Column(String(32), ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, default="")
    agent_type = Column(String(64), default="generic")  # e.g. openclaw, custom
    capabilities = Column(JSON, default=list)   # list of capability tags
    api_key = Column(String(128), unique=True, default=lambda: f"ag_{_uuid()}")
    association_type = Column(String(64), default="unbound")
    status = Column(String(32), default="active")  # active, suspended, offline
    last_heartbeat = Column(DateTime, nullable=True)
    bound_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    owner = relationship("User", back_populates="agents")
    operation_logs = relationship("OperationLog", back_populates="agent", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# AgentBindingKey
# ---------------------------------------------------------------------------
class AgentBindingKey(Base):
    __tablename__ = "agent_binding_keys"

    id = Column(String(32), primary_key=True, default=_uuid)
    user_id = Column(String(32), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(128), default="")
    key_hash = Column(String(128), nullable=False, unique=True)
    key_preview = Column(String(32), default="")
    used_by_agent_id = Column(String(32), ForeignKey("agents.id"), nullable=True, index=True)
    used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    user = relationship("User", back_populates="agent_binding_keys")
    used_by_agent = relationship("Agent")


# ---------------------------------------------------------------------------
# SubagentAsset  (the tradeable EvoPack — analogous to Gene/Capsule in EvoMap)
# ---------------------------------------------------------------------------
class SubagentAsset(Base):
    __tablename__ = "subagent_assets"

    id = Column(String(32), primary_key=True, default=_uuid)
    creator_id = Column(String(32), ForeignKey("users.id"), nullable=False, index=True)
    agent_id = Column(String(32), ForeignKey("agents.id"), nullable=True)  # which agent produced it

    # Identity
    name = Column(String(128), nullable=False, index=True)
    version = Column(String(32), default="1.0.0")
    description = Column(Text, default="")
    tags = Column(JSON, default=list)  # searchable tags

    # Content — the actual EvoPack payload
    entry_file = Column(String(256), nullable=True)            # optional executable entry point
    archive_path = Column(String(512), default="")             # path to stored .zip on disk
    file_list = Column(JSON, default=list)                     # filenames inside the archive
    skill_md = Column(Text, default="")                        # SKILL.md content (public preview)
    dependencies = Column(JSON, default=list)                  # pip packages
    tools_used = Column(JSON, default=list)                    # tool skill names

    # Scoring & quality (computed fields)
    quality_score = Column(Float, default=0.0)                 # AI review score 0-1
    composite_score = Column(Float, default=0.0)               # GDI-like composite score

    # Marketplace
    price = Column(Float, default=0.0)                         # 0 = free
    is_listed = Column(Boolean, default=True)                  # visible in marketplace
    license_type = Column(String(64), default="MIT")

    # Statistics
    usage_count = Column(Integer, default=0)
    download_count = Column(Integer, default=0)
    solve_count = Column(Integer, default=0)                   # bounties solved
    avg_rating = Column(Float, default=0.0)
    rating_count = Column(Integer, default=0)

    # Lineage — evolution tracking
    parent_asset_id = Column(String(32), ForeignKey("subagent_assets.id"), nullable=True)
    supersedes_id = Column(String(32), ForeignKey("subagent_assets.id"), nullable=True)
    evolution_note = Column(Text, default="")                  # what was improved

    # Timestamps
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    creator = relationship("User", back_populates="assets")
    parent_asset = relationship("SubagentAsset", remote_side=[id], foreign_keys=[parent_asset_id])


# ---------------------------------------------------------------------------
# Bounty  (problems posted by users)
# ---------------------------------------------------------------------------
class Bounty(Base):
    __tablename__ = "bounties"

    id = Column(String(32), primary_key=True, default=_uuid)
    poster_id = Column(String(32), ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String(256), nullable=False)
    description = Column(Text, nullable=False)
    tags = Column(JSON, default=list)
    reward = Column(Float, default=0.0)           # credits offered
    status = Column(String(32), default="open")    # open, in_progress, solved, closed
    accepted_solution_id = Column(String(32), ForeignKey("bounty_solutions.id"), nullable=True)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    expires_at = Column(DateTime, nullable=True)

    poster = relationship("User", back_populates="bounties")
    solutions = relationship("BountySolution", back_populates="bounty",
                             foreign_keys="BountySolution.bounty_id", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# BountySolution
# ---------------------------------------------------------------------------
class BountySolution(Base):
    __tablename__ = "bounty_solutions"

    id = Column(String(32), primary_key=True, default=_uuid)
    bounty_id = Column(String(32), ForeignKey("bounties.id"), nullable=False, index=True)
    solver_id = Column(String(32), ForeignKey("users.id"), nullable=False, index=True)
    asset_id = Column(String(32), ForeignKey("subagent_assets.id"), nullable=True)  # optional linked EvoPack

    content = Column(Text, nullable=False)       # solution description / answer
    is_accepted = Column(Boolean, default=False)
    rating = Column(Float, nullable=True)        # poster's rating 0-5

    created_at = Column(DateTime, default=_utcnow)

    bounty = relationship("Bounty", back_populates="solutions", foreign_keys=[bounty_id])
    solver = relationship("User")
    asset = relationship("SubagentAsset")


# ---------------------------------------------------------------------------
# Trade  (marketplace transactions)
# ---------------------------------------------------------------------------
class Trade(Base):
    __tablename__ = "trades"

    id = Column(String(32), primary_key=True, default=_uuid)
    asset_id = Column(String(32), ForeignKey("subagent_assets.id"), nullable=False, index=True)
    buyer_id = Column(String(32), ForeignKey("users.id"), nullable=False, index=True)
    seller_id = Column(String(32), ForeignKey("users.id"), nullable=False, index=True)

    price = Column(Float, nullable=False)
    platform_fee = Column(Float, default=0.0)
    status = Column(String(32), default="completed")  # pending, completed, refunded

    created_at = Column(DateTime, default=_utcnow)

    asset = relationship("SubagentAsset")
    buyer = relationship("User", foreign_keys=[buyer_id])
    seller = relationship("User", foreign_keys=[seller_id])


# ---------------------------------------------------------------------------
# ExpertAgent  (agents registered as consultable experts)
# ---------------------------------------------------------------------------
class ExpertAgent(Base):
    __tablename__ = "expert_agents"

    id = Column(String(32), primary_key=True, default=_uuid)
    agent_id = Column(String(32), ForeignKey("agents.id"), nullable=False, index=True)

    name = Column(String(128), nullable=False)
    domain = Column(String(128), nullable=False)          # e.g. "data_analysis", "web_security"
    description = Column(Text, default="")
    is_platform = Column(Boolean, default=False)           # True = platform-managed expert
    is_available = Column(Boolean, default=True)           # accepting consultations?
    tags = Column(JSON, default=list)
    max_concurrent = Column(Integer, default=10)           # max concurrent sessions (platform experts)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    agent = relationship("Agent")


# ---------------------------------------------------------------------------
# ChatSession  (a consultation conversation between student and expert)
# ---------------------------------------------------------------------------
class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(32), primary_key=True, default=_uuid)
    requester_agent_id = Column(String(32), ForeignKey("agents.id"), nullable=False, index=True)
    expert_id = Column(String(32), ForeignKey("expert_agents.id"), nullable=False, index=True)

    topic = Column(String(256), default="")
    learning_objective = Column(Text, default="")
    status = Column(String(32), default="open")            # open, closed
    turn = Column(String(32), default="student")           # whose turn: "student" or "expert"
    session_token = Column(String(64), unique=True, default=lambda: _uuid() + _uuid())  # for WS auth
    message_count = Column(Integer, default=0)
    shared_asset_id = Column(String(32), ForeignKey("subagent_assets.id"), nullable=True)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    requester_agent = relationship("Agent", foreign_keys=[requester_agent_id])
    expert = relationship("ExpertAgent")
    shared_asset = relationship("SubagentAsset")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# ChatMessage  (a single message in a chat session)
# ---------------------------------------------------------------------------
class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String(32), primary_key=True, default=_uuid)
    session_id = Column(String(32), ForeignKey("chat_sessions.id"), nullable=False, index=True)
    sender_role = Column(String(32), nullable=False)       # "student", "expert", or "guidance"
    content = Column(Text, nullable=False)

    created_at = Column(DateTime, default=_utcnow)

    session = relationship("ChatSession", back_populates="messages")


# ---------------------------------------------------------------------------
# OperationLog  (agent activity audit trail)
# ---------------------------------------------------------------------------
class OperationLog(Base):
    __tablename__ = "operation_logs"

    id = Column(String(32), primary_key=True, default=_uuid)
    agent_id = Column(String(32), ForeignKey("agents.id"), nullable=False, index=True)
    user_id = Column(String(32), ForeignKey("users.id"), nullable=False, index=True)

    action = Column(String(64), nullable=False)     # e.g. create_subagent, run_subagent, publish, trade
    target_type = Column(String(64), default="")     # e.g. subagent_asset, bounty
    target_id = Column(String(32), default="")
    details = Column(JSON, default=dict)             # free-form metadata
    status = Column(String(32), default="success")   # success, failure
    error_message = Column(Text, default="")

    created_at = Column(DateTime, default=_utcnow)

    agent = relationship("Agent", back_populates="operation_logs")
    user = relationship("User")
