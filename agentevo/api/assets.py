"""
Asset API: publish, search, retrieve, rate, and manage subagent assets.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from agentevo.core.database import get_db
from agentevo.core.security import get_current_user_id
from agentevo.core.scoring import compute_asset_score
from agentevo.models.models import SubagentAsset, User, OperationLog
from agentevo.api.schemas import (
    AssetPublishRequest, AssetUpdateRequest, AssetResponse,
    AssetBriefResponse, AssetRateRequest,
    PaginatedResponse, MessageResponse,
)

router = APIRouter(prefix="/assets", tags=["assets"])


def _recompute_score(asset: SubagentAsset):
    """Recompute the composite score for an asset."""
    asset.composite_score = compute_asset_score(
        quality_score=asset.quality_score,
        usage_count=asset.usage_count,
        avg_rating=asset.avg_rating,
        created_at=asset.created_at,
        solve_count=asset.solve_count,
    )


# ---- Publish & CRUD -------------------------------------------------------

@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def publish_asset(
    req: AssetPublishRequest,
    agent_id: Optional[str] = Query(None, description="Agent that produced this asset"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Publish a new subagent asset to the platform."""
    asset = SubagentAsset(
        creator_id=user_id,
        agent_id=agent_id,
        name=req.name,
        description=req.description,
        tags=req.tags,
        entry_file=req.entry_file,
        code=req.code,
        skill_md=req.skill_md,
        dependencies=req.dependencies,
        tools_used=req.tools_used,
        price=req.price,
        license_type=req.license_type,
        parent_asset_id=req.parent_asset_id,
        supersedes_id=req.supersedes_id,
        evolution_note=req.evolution_note,
    )

    # Basic quality heuristic (can be replaced by AI review later)
    asset.quality_score = _estimate_quality(req.code, req.skill_md, req.description)
    _recompute_score(asset)

    db.add(asset)
    db.commit()
    db.refresh(asset)

    # Log the operation
    _log_operation(db, agent_id, user_id, "publish_asset", "subagent_asset", asset.id)

    return asset


@router.get("/", response_model=PaginatedResponse)
def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    tag: Optional[str] = None,
    sort_by: str = Query("composite_score", pattern="^(composite_score|created_at|price|usage_count|avg_rating)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """Browse and search the asset marketplace."""
    query = db.query(SubagentAsset).filter(SubagentAsset.is_listed == True)

    # Text search on name / description
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                SubagentAsset.name.ilike(pattern),
                SubagentAsset.description.ilike(pattern),
            )
        )

    # Tag filter (JSON array contains — use LIKE on the raw column for SQLite compat)
    if tag:
        from sqlalchemy import func, literal_column
        query = query.filter(
            func.json_array_length(SubagentAsset.tags) > 0,
            SubagentAsset.tags.like(f'%"{tag}"%'),
        )

    # Price range
    if min_price is not None:
        query = query.filter(SubagentAsset.price >= min_price)
    if max_price is not None:
        query = query.filter(SubagentAsset.price <= max_price)

    # Sorting
    sort_col = getattr(SubagentAsset, sort_by)
    if order == "desc":
        sort_col = sort_col.desc()
    query = query.order_by(sort_col)

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return PaginatedResponse(
        items=[AssetBriefResponse.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    """Get full details of a specific asset (including code)."""
    asset = db.query(SubagentAsset).filter(SubagentAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.put("/{asset_id}", response_model=AssetResponse)
def update_asset(
    asset_id: str,
    req: AssetUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Update an asset you own."""
    asset = db.query(SubagentAsset).filter(
        SubagentAsset.id == asset_id, SubagentAsset.creator_id == user_id
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found or not owned by you")

    for field, value in req.model_dump(exclude_none=True).items():
        setattr(asset, field, value)

    if req.code is not None:
        asset.quality_score = _estimate_quality(req.code, asset.skill_md, asset.description)
    _recompute_score(asset)

    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/{asset_id}", response_model=MessageResponse)
def delete_asset(
    asset_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Delist / delete an asset."""
    asset = db.query(SubagentAsset).filter(
        SubagentAsset.id == asset_id, SubagentAsset.creator_id == user_id
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found or not owned by you")
    db.delete(asset)
    db.commit()
    return MessageResponse(message="Asset deleted")


# ---- Rating ---------------------------------------------------------------

@router.post("/{asset_id}/rate", response_model=MessageResponse)
def rate_asset(
    asset_id: str,
    req: AssetRateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Rate an asset (simple running average)."""
    asset = db.query(SubagentAsset).filter(SubagentAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Update running average
    total_rating = asset.avg_rating * asset.rating_count + req.rating
    asset.rating_count += 1
    asset.avg_rating = total_rating / asset.rating_count

    _recompute_score(asset)
    db.commit()

    return MessageResponse(message=f"Rated {req.rating}/5. New average: {asset.avg_rating:.2f}")


# ---- Download / Use -------------------------------------------------------

@router.post("/{asset_id}/download", response_model=AssetResponse)
def download_asset(
    asset_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Download / acquire a free asset. Increments counters."""
    asset = db.query(SubagentAsset).filter(SubagentAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.price > 0:
        raise HTTPException(
            status_code=400,
            detail="This asset has a price. Use the /trade/purchase endpoint instead.",
        )

    asset.download_count += 1
    asset.usage_count += 1
    _recompute_score(asset)
    db.commit()
    db.refresh(asset)
    return asset


# ---- My Assets ------------------------------------------------------------

@router.get("/me/published", response_model=list[AssetBriefResponse])
def my_assets(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List assets published by the current user."""
    return db.query(SubagentAsset).filter(SubagentAsset.creator_id == user_id).all()


# ---- Helpers --------------------------------------------------------------

def _estimate_quality(code: str, skill_md: str, description: str) -> float:
    """
    Basic heuristic quality scoring (0-1).
    In production this would be an AI review step.
    """
    score = 0.0
    # Has code
    if len(code) > 50:
        score += 0.2
    # Has main() function
    if "def main(" in code:
        score += 0.15
    # Has docstrings
    if '"""' in code or "'''" in code:
        score += 0.1
    # Has error handling
    if "try:" in code and "except" in code:
        score += 0.1
    # Has SKILL.md
    if len(skill_md) > 20:
        score += 0.15
    # Has description
    if len(description) > 20:
        score += 0.1
    # Uses call_llm (generalizable)
    if "call_llm" in code:
        score += 0.1
    # Has return dict with answer
    if '"answer"' in code or "'answer'" in code:
        score += 0.1

    return min(1.0, score)


def _log_operation(db: Session, agent_id, user_id, action, target_type, target_id):
    """Helper to create an operation log entry."""
    if agent_id:
        log = OperationLog(
            agent_id=agent_id,
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
        )
        db.add(log)
        db.commit()
