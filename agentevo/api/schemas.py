"""
Pydantic schemas shared across API endpoints.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    display_name: str = ""


class UserLoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str


class UserProfile(BaseModel):
    id: str
    username: str
    email: str
    display_name: str
    bio: str
    credits: float
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
class AgentRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    agent_type: str = "generic"
    capabilities: List[str] = []


class AgentResponse(BaseModel):
    id: str
    owner_id: str
    name: str
    description: str
    agent_type: str
    capabilities: list
    api_key: str
    status: str
    last_heartbeat: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AgentHeartbeatRequest(BaseModel):
    status: str = "active"
    metadata: dict = {}


# ---------------------------------------------------------------------------
# SubagentAsset
# ---------------------------------------------------------------------------
class AssetUpdateRequest(BaseModel):
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    price: Optional[float] = None
    is_listed: Optional[bool] = None


class AssetResponse(BaseModel):
    id: str
    creator_id: str
    agent_id: Optional[str] = None
    name: str
    version: str
    description: str
    tags: list
    entry_file: Optional[str] = None
    file_list: list
    skill_md: str
    dependencies: list
    tools_used: list
    quality_score: float
    composite_score: float
    price: float
    is_listed: bool
    license_type: str
    usage_count: int
    download_count: int
    solve_count: int
    avg_rating: float
    rating_count: int
    parent_asset_id: Optional[str] = None
    supersedes_id: Optional[str] = None
    evolution_note: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssetBriefResponse(BaseModel):
    """Lightweight asset listing without full details."""
    id: str
    creator_id: str
    name: str
    version: str
    description: str
    tags: list
    entry_file: Optional[str] = None
    quality_score: float
    composite_score: float
    price: float
    usage_count: int
    avg_rating: float
    rating_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class AssetRateRequest(BaseModel):
    rating: float = Field(..., ge=0, le=5)
    comment: str = ""


# ---------------------------------------------------------------------------
# Bounty
# ---------------------------------------------------------------------------
class BountyCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str
    tags: List[str] = []
    reward: float = 0.0
    expires_at: Optional[datetime] = None


class BountyResponse(BaseModel):
    id: str
    poster_id: str
    title: str
    description: str
    tags: list
    reward: float
    status: str
    accepted_solution_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    expires_at: Optional[datetime] = None
    solution_count: int = 0

    class Config:
        from_attributes = True


class SolutionSubmitRequest(BaseModel):
    content: str
    asset_id: Optional[str] = None  # optionally link a subagent asset


class SolutionResponse(BaseModel):
    id: str
    bounty_id: str
    solver_id: str
    asset_id: Optional[str] = None
    content: str
    is_accepted: bool
    rating: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Trade
# ---------------------------------------------------------------------------
class TradePurchaseRequest(BaseModel):
    asset_id: str


class TradeResponse(BaseModel):
    id: str
    asset_id: str
    buyer_id: str
    seller_id: str
    price: float
    platform_fee: float
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# OperationLog
# ---------------------------------------------------------------------------
class OperationLogCreateRequest(BaseModel):
    agent_id: str
    action: str
    target_type: str = ""
    target_id: str = ""
    details: dict = {}
    status: str = "success"
    error_message: str = ""


class OperationLogResponse(BaseModel):
    id: str
    agent_id: str
    user_id: str
    action: str
    target_type: str
    target_id: str
    details: dict
    status: str
    error_message: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Generic
# ---------------------------------------------------------------------------
class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int


class MessageResponse(BaseModel):
    message: str
