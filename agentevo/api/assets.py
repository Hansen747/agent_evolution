"""
EvoPack API: publish, search, retrieve, rate, download, and manage reusable bundles.

EvoPacks are uploaded as .zip archives. The only required in-archive file is
SKILL.md, which is extracted for public preview. An executable entry file is
optional and can be declared for EvoPacks that support direct execution.
"""

import json
import os
import zipfile
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from agentevo.core.config import settings
from agentevo.core.database import get_db
from agentevo.core.security import get_current_user_id
from agentevo.core.scoring import compute_asset_score
from agentevo.models.models import SubagentAsset, User, Trade, OperationLog
from agentevo.api.schemas import (
    EvoPackUpdateRequest, EvoPackResponse,
    EvoPackBriefResponse, EvoPackRateRequest,
    PaginatedResponse, MessageResponse,
)

router = APIRouter(prefix="/assets", tags=["assets"])

# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------
ASSET_STORAGE = os.path.join(settings.STORAGE_DIR, "assets")


def _ensure_storage():
    os.makedirs(ASSET_STORAGE, exist_ok=True)


def _archive_path(asset_id: str) -> str:
    return os.path.join(ASSET_STORAGE, f"{asset_id}.zip")


def _validate_zip(data: bytes, entry_file: Optional[str]) -> tuple[list[str], str]:
    """
    Validate a zip archive.

    Returns:
        (file_list, skill_md_content)

    Raises HTTPException on invalid archives.
    """
    try:
        zf = zipfile.ZipFile(BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip archive")

    names = zf.namelist()
    if not names:
        raise HTTPException(status_code=400, detail="Zip archive is empty")

    if entry_file and entry_file not in names:
        raise HTTPException(
            status_code=400,
            detail=f"Zip archive must contain the entry file '{entry_file}'. Found: {names}",
        )

    # Extract SKILL.md content for public preview (case-insensitive search)
    skill_md = ""
    for name in names:
        if name.lower() == "skill.md":
            skill_md = zf.read(name).decode("utf-8", errors="replace")
            break

    if not skill_md:
        raise HTTPException(status_code=400, detail="Zip archive must contain SKILL.md for public preview")

    return names, skill_md


def _read_entry_code(archive_path: str, entry_file: Optional[str]) -> str:
    """Read the entry file source code from a stored archive."""
    if not entry_file:
        return ""
    try:
        with zipfile.ZipFile(archive_path, "r") as zf:
            return zf.read(entry_file).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _read_file_from_archive(archive_path: str, filename: str) -> Optional[bytes]:
    """Read an arbitrary file from a stored archive."""
    try:
        with zipfile.ZipFile(archive_path, "r") as zf:
            if filename in zf.namelist():
                return zf.read(filename)
    except Exception:
        pass
    return None


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

@router.post("/", response_model=EvoPackResponse, status_code=status.HTTP_201_CREATED)
async def publish_asset(
    file: UploadFile = File(..., description="Zip archive containing the EvoPack bundle"),
    name: str = Form(..., min_length=1, max_length=128),
    entry_file: Optional[str] = Form(None),
    description: str = Form(""),
    tags: str = Form("[]", description="JSON array of tags, e.g. '[\"research\",\"web\"]'"),
    dependencies: str = Form("[]", description="JSON array of pip packages"),
    tools_used: str = Form("[]", description="JSON array of tool names"),
    price: float = Form(0.0),
    license_type: str = Form("MIT"),
    parent_asset_id: Optional[str] = Form(None),
    supersedes_id: Optional[str] = Form(None),
    evolution_note: str = Form(""),
    agent_id: Optional[str] = Query(None, description="Agent that produced this EvoPack"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Publish a new EvoPack by uploading a zip archive."""
    _ensure_storage()

    # Parse JSON form fields
    try:
        tags_list = json.loads(tags) if tags else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="tags must be a valid JSON array")
    try:
        deps_list = json.loads(dependencies) if dependencies else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="dependencies must be a valid JSON array")
    try:
        tools_list = json.loads(tools_used) if tools_used else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="tools_used must be a valid JSON array")

    # Read and validate zip
    data = await file.read()
    file_list, skill_md = _validate_zip(data, entry_file)

    # Read entry code for quality estimation when an executable EvoPack entry is declared.
    entry_code = ""
    if entry_file:
        try:
            zf = zipfile.ZipFile(BytesIO(data))
            entry_code = zf.read(entry_file).decode("utf-8", errors="replace")
        except Exception:
            pass

    # Create database record (to get the id)
    asset = SubagentAsset(
        creator_id=user_id,
        agent_id=agent_id,
        name=name,
        description=description,
        tags=tags_list,
        entry_file=entry_file,
        file_list=file_list,
        skill_md=skill_md,
        dependencies=deps_list,
        tools_used=tools_list,
        price=price,
        license_type=license_type,
        parent_asset_id=parent_asset_id if parent_asset_id else None,
        supersedes_id=supersedes_id if supersedes_id else None,
        evolution_note=evolution_note,
    )

    # Quality heuristic
    asset.quality_score = _estimate_quality(entry_code, skill_md, description)
    _recompute_score(asset)

    db.add(asset)
    db.flush()  # get asset.id

    # Save zip to disk
    archive = _archive_path(asset.id)
    with open(archive, "wb") as f:
        f.write(data)
    asset.archive_path = archive

    db.commit()
    db.refresh(asset)

    # Log the operation
    _log_operation(db, agent_id, user_id, "publish_evopack", "evopack", asset.id)

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
    """Browse and search the EvoPack marketplace."""
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
        from sqlalchemy import func
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
        items=[EvoPackBriefResponse.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/me/published", response_model=list[EvoPackBriefResponse])
def my_assets(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List EvoPacks published by the current user."""
    return db.query(SubagentAsset).filter(SubagentAsset.creator_id == user_id).all()


@router.get("/{asset_id}", response_model=EvoPackResponse)
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    """
    Get full metadata of an EvoPack (public).

    Includes SKILL.md content and file list for preview.
    Source code is NOT included — use the download endpoint to get the zip.
    """
    asset = db.query(SubagentAsset).filter(SubagentAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="EvoPack not found")
    return asset


@router.get("/{asset_id}/files/{filename:path}")
def get_asset_file(
    asset_id: str,
    filename: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Read a specific file from the EvoPack archive.

    Only the EvoPack creator or users who have purchased it can view files.
    """
    asset = db.query(SubagentAsset).filter(SubagentAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="EvoPack not found")

    # Authorization: creator or purchaser
    is_creator = asset.creator_id == user_id
    has_purchased = db.query(Trade).filter(
        Trade.asset_id == asset_id, Trade.buyer_id == user_id
    ).first() is not None
    # Also allow if asset is free and user has downloaded (usage_count > 0 isn't per-user, so just allow free assets)
    is_free = asset.price <= 0

    if not (is_creator or has_purchased or is_free):
        raise HTTPException(status_code=403, detail="Purchase this EvoPack to view its files")

    if not asset.archive_path or not os.path.exists(asset.archive_path):
        raise HTTPException(status_code=404, detail="Archive not found on disk")

    content = _read_file_from_archive(asset.archive_path, filename)
    if content is None:
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found in archive")

    # Return as plain text for code files, raw bytes otherwise
    from fastapi.responses import Response
    if filename.endswith((".py", ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".cfg", ".ini")):
        return Response(content=content, media_type="text/plain; charset=utf-8")
    return Response(content=content, media_type="application/octet-stream")


@router.put("/{asset_id}", response_model=EvoPackResponse)
async def update_asset(
    asset_id: str,
    file: Optional[UploadFile] = File(None, description="New zip archive (optional)"),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    is_listed: Optional[bool] = Form(None),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Update an EvoPack you own. Optionally re-upload the zip archive."""
    asset = db.query(SubagentAsset).filter(
        SubagentAsset.id == asset_id, SubagentAsset.creator_id == user_id
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="EvoPack not found or not owned by you")

    if description is not None:
        asset.description = description
    if tags is not None:
        try:
            asset.tags = json.loads(tags)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="tags must be a valid JSON array")
    if price is not None:
        asset.price = price
    if is_listed is not None:
        asset.is_listed = is_listed

    # Re-upload archive
    if file is not None:
        _ensure_storage()
        data = await file.read()
        file_list, skill_md = _validate_zip(data, asset.entry_file)

        archive = _archive_path(asset.id)
        with open(archive, "wb") as f:
            f.write(data)
        asset.archive_path = archive
        asset.file_list = file_list
        asset.skill_md = skill_md

        # Re-estimate quality
        entry_code = ""
        if asset.entry_file:
            try:
                zf = zipfile.ZipFile(BytesIO(data))
                entry_code = zf.read(asset.entry_file).decode("utf-8", errors="replace")
            except Exception:
                pass
        asset.quality_score = _estimate_quality(entry_code, skill_md, asset.description)

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
    """Delist / delete an EvoPack and its archive."""
    asset = db.query(SubagentAsset).filter(
        SubagentAsset.id == asset_id, SubagentAsset.creator_id == user_id
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="EvoPack not found or not owned by you")

    # Remove archive from disk
    if asset.archive_path and os.path.exists(asset.archive_path):
        os.remove(asset.archive_path)

    db.delete(asset)
    db.commit()
    return MessageResponse(message="EvoPack deleted")


# ---- Rating ---------------------------------------------------------------

@router.post("/{asset_id}/rate", response_model=MessageResponse)
def rate_asset(
    asset_id: str,
    req: EvoPackRateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Rate an EvoPack (simple running average)."""
    asset = db.query(SubagentAsset).filter(SubagentAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="EvoPack not found")

    # Update running average
    total_rating = asset.avg_rating * asset.rating_count + req.rating
    asset.rating_count += 1
    asset.avg_rating = total_rating / asset.rating_count

    _recompute_score(asset)
    db.commit()

    return MessageResponse(message=f"Rated {req.rating}/5. New average: {asset.avg_rating:.2f}")


# ---- Download / Use -------------------------------------------------------

@router.post("/{asset_id}/download")
def download_asset(
    asset_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Download a free EvoPack zip archive. Increments counters.

    For paid EvoPacks, use /trades/purchase first then download.
    """
    asset = db.query(SubagentAsset).filter(SubagentAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="EvoPack not found")

    is_creator = asset.creator_id == user_id
    has_purchased = db.query(Trade).filter(
        Trade.asset_id == asset_id, Trade.buyer_id == user_id
    ).first() is not None

    if asset.price > 0 and not is_creator and not has_purchased:
        raise HTTPException(
            status_code=400,
            detail="This EvoPack has a price. Use /trades/purchase first.",
        )

    if not asset.archive_path or not os.path.exists(asset.archive_path):
        raise HTTPException(status_code=404, detail="Archive not found on disk")

    # Increment counters (only for non-creators)
    if not is_creator:
        asset.download_count += 1
        asset.usage_count += 1
        _recompute_score(asset)
        db.commit()

    return FileResponse(
        path=asset.archive_path,
        media_type="application/zip",
        filename=f"{asset.name}.zip",
    )


# ---- Helpers --------------------------------------------------------------

def _estimate_quality(code: str, skill_md: str, description: str) -> float:
    """
    Basic heuristic quality scoring (0-1).
    In production this would be an AI review step.
    """
    score = 0.0
    # Has SKILL.md
    if len(skill_md) > 20:
        score += 0.35
    # Has description
    if len(description) > 20:
        score += 0.2

    if not code:
        return min(1.0, score)

    # Has code
    if len(code) > 50:
        score += 0.15
    # Has main() function
    if "def main(" in code:
        score += 0.1
    # Has docstrings
    if '"""' in code or "'''" in code:
        score += 0.05
    # Has error handling
    if "try:" in code and "except" in code:
        score += 0.05
    # Uses call_llm (generalizable)
    if "call_llm" in code:
        score += 0.05
    # Has return dict with answer
    if '"answer"' in code or "'answer'" in code:
        score += 0.05

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
