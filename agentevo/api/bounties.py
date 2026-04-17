"""
Bounty API: post problems, submit solutions, accept solutions.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from agentevo.core.database import get_db
from agentevo.core.ownership import grant_asset_ownership
from agentevo.core.security import ActorContext, get_current_actor_context
from agentevo.core.scoring import compute_asset_score
from agentevo.models.models import Bounty, BountySolution, SubagentAsset, User
from agentevo.api.schemas import (
    BountyCreateRequest, BountyUpdateRequest, BountyResponse,
    SolutionSubmitRequest, SolutionResponse,
    PaginatedResponse, MessageResponse,
)

router = APIRouter(prefix="/bounties", tags=["bounties"])

EDITABLE_BOUNTY_STATUSES = {"open", "in_progress", "closed"}


# ---- Bounty CRUD ----------------------------------------------------------

@router.post("/", response_model=BountyResponse, status_code=status.HTTP_201_CREATED)
def create_bounty(
    req: BountyCreateRequest,
    actor: ActorContext = Depends(get_current_actor_context),
    db: Session = Depends(get_db),
):
    """Post a new problem / bounty."""
    user_id = actor.user_id
    # Check user has enough credits for the reward
    if req.reward > 0:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.credits < req.reward:
            raise HTTPException(status_code=400, detail="Insufficient credits for reward")
        # Escrow the reward
        user.credits -= req.reward

    bounty = Bounty(
        poster_id=user_id,
        title=req.title,
        description=req.description,
        tags=req.tags,
        reward=req.reward,
        expires_at=req.expires_at,
    )
    db.add(bounty)
    db.commit()
    db.refresh(bounty)

    return _bounty_response(bounty, db)


@router.get("/", response_model=PaginatedResponse)
def list_bounties(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    tag: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    """Browse open bounties."""
    query = db.query(Bounty)

    if status_filter:
        query = query.filter(Bounty.status == status_filter)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(Bounty.title.ilike(pattern), Bounty.description.ilike(pattern))
        )

    if tag:
        query = query.filter(Bounty.tags.cast(str).contains(f'"{tag}"'))

    total = query.count()
    items = (
        query.order_by(Bounty.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PaginatedResponse(
        items=[_bounty_response(b, db) for b in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{bounty_id}", response_model=BountyResponse)
def get_bounty(bounty_id: str, db: Session = Depends(get_db)):
    """Get a specific bounty."""
    bounty = db.query(Bounty).filter(Bounty.id == bounty_id).first()
    if not bounty:
        raise HTTPException(status_code=404, detail="Bounty not found")
    return _bounty_response(bounty, db)


@router.patch("/{bounty_id}", response_model=BountyResponse)
def update_bounty(
    bounty_id: str,
    req: BountyUpdateRequest,
    actor: ActorContext = Depends(get_current_actor_context),
    db: Session = Depends(get_db),
):
    """Update or close a bounty posted by the current user or its bound agent."""
    user_id = actor.user_id
    bounty = db.query(Bounty).filter(Bounty.id == bounty_id).first()
    if not bounty:
        raise HTTPException(status_code=404, detail="Bounty not found")
    if bounty.poster_id != user_id:
        raise HTTPException(status_code=403, detail="Only the bounty poster can update this bounty")
    if bounty.status == "solved":
        raise HTTPException(status_code=400, detail="Solved bounties cannot be modified")
    if bounty.status == "closed":
        raise HTTPException(status_code=400, detail="Closed bounties cannot be modified")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.status is not None:
        if req.status not in EDITABLE_BOUNTY_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported bounty status")
        if req.status == "closed" and req.reward is not None and req.reward != bounty.reward:
            raise HTTPException(status_code=400, detail="Close the bounty in a separate request after adjusting reward")
        if req.status == "closed":
            if bounty.reward > 0:
                user.credits += bounty.reward
            bounty.status = "closed"
            db.commit()
            db.refresh(bounty)
            return _bounty_response(bounty, db)
        bounty.status = req.status

    if req.reward is not None and req.reward != bounty.reward:
        reward_delta = req.reward - bounty.reward
        if reward_delta > 0:
            if user.credits < reward_delta:
                raise HTTPException(status_code=400, detail="Insufficient credits for reward increase")
            user.credits -= reward_delta
        else:
            user.credits += abs(reward_delta)
        bounty.reward = req.reward

    if req.title is not None:
        bounty.title = req.title
    if req.description is not None:
        bounty.description = req.description
    if req.tags is not None:
        bounty.tags = req.tags
    if req.expires_at is not None:
        bounty.expires_at = req.expires_at

    db.commit()
    db.refresh(bounty)
    return _bounty_response(bounty, db)


# ---- Solutions ------------------------------------------------------------

@router.post("/{bounty_id}/solutions", response_model=SolutionResponse, status_code=status.HTTP_201_CREATED)
def submit_solution(
    bounty_id: str,
    req: SolutionSubmitRequest,
    actor: ActorContext = Depends(get_current_actor_context),
    db: Session = Depends(get_db),
):
    """Submit a solution to a bounty."""
    user_id = actor.user_id
    bounty = db.query(Bounty).filter(Bounty.id == bounty_id).first()
    if not bounty:
        raise HTTPException(status_code=404, detail="Bounty not found")
    if bounty.status not in ("open", "in_progress"):
        raise HTTPException(status_code=400, detail="Bounty is no longer accepting solutions")

    # Prevent poster from solving their own bounty
    if bounty.poster_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot solve your own bounty")

    if not req.asset_id:
        raise HTTPException(
            status_code=422,
            detail="Bounty solutions must reference an EvoPack via asset_id",
        )

    normalized_content = (req.content or "").strip()

    asset = db.query(SubagentAsset).filter(SubagentAsset.id == req.asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Linked EvoPack not found")

    if not normalized_content:
        normalized_content = f"Submitted linked EvoPack {req.asset_id} as the solution."

    solution = BountySolution(
        bounty_id=bounty_id,
        solver_id=user_id,
        asset_id=req.asset_id,
        content=normalized_content,
    )
    db.add(solution)

    # Update bounty status
    if bounty.status == "open":
        bounty.status = "in_progress"

    db.commit()
    db.refresh(solution)
    return solution


@router.get("/{bounty_id}/solutions", response_model=list[SolutionResponse])
def list_solutions(
    bounty_id: str,
    db: Session = Depends(get_db),
):
    """List all solutions for a bounty."""
    bounty = db.query(Bounty).filter(Bounty.id == bounty_id).first()
    if not bounty:
        raise HTTPException(status_code=404, detail="Bounty not found")
    return db.query(BountySolution).filter(BountySolution.bounty_id == bounty_id).all()


@router.post("/{bounty_id}/solutions/{solution_id}/accept", response_model=MessageResponse)
def accept_solution(
    bounty_id: str,
    solution_id: str,
    actor: ActorContext = Depends(get_current_actor_context),
    db: Session = Depends(get_db),
):
    """Accept a solution (only the bounty poster can do this)."""
    user_id = actor.user_id
    bounty = db.query(Bounty).filter(Bounty.id == bounty_id).first()
    if not bounty:
        raise HTTPException(status_code=404, detail="Bounty not found")
    if bounty.poster_id != user_id:
        raise HTTPException(status_code=403, detail="Only the bounty poster can accept solutions")
    if bounty.status == "solved":
        raise HTTPException(status_code=400, detail="Bounty already solved")

    solution = db.query(BountySolution).filter(
        BountySolution.id == solution_id, BountySolution.bounty_id == bounty_id
    ).first()
    if not solution:
        raise HTTPException(status_code=404, detail="Solution not found")

    # Mark accepted
    solution.is_accepted = True
    bounty.accepted_solution_id = solution.id
    bounty.status = "solved"

    # Transfer reward to solver
    if bounty.reward > 0:
        solver = db.query(User).filter(User.id == solution.solver_id).first()
        if solver:
            solver.credits += bounty.reward

    # Update linked EvoPack solve count
    if solution.asset_id:
        asset = db.query(SubagentAsset).filter(SubagentAsset.id == solution.asset_id).first()
        if asset:
            asset.solve_count += 1
            grant_asset_ownership(db, asset, user_id, status="accepted_solution")
            asset.composite_score = compute_asset_score(
                quality_score=asset.quality_score,
                usage_count=asset.usage_count,
                avg_rating=asset.avg_rating,
                created_at=asset.created_at,
                solve_count=asset.solve_count,
            )

    db.commit()
    return MessageResponse(message="Solution accepted. Reward transferred to solver.")


@router.post("/{bounty_id}/solutions/{solution_id}/rate", response_model=MessageResponse)
def rate_solution(
    bounty_id: str,
    solution_id: str,
    rating: float = Query(..., ge=0, le=5),
    actor: ActorContext = Depends(get_current_actor_context),
    db: Session = Depends(get_db),
):
    """Rate a solution (poster only)."""
    user_id = actor.user_id
    bounty = db.query(Bounty).filter(Bounty.id == bounty_id).first()
    if not bounty or bounty.poster_id != user_id:
        raise HTTPException(status_code=403, detail="Only the poster can rate solutions")

    solution = db.query(BountySolution).filter(
        BountySolution.id == solution_id, BountySolution.bounty_id == bounty_id
    ).first()
    if not solution:
        raise HTTPException(status_code=404, detail="Solution not found")

    solution.rating = rating
    db.commit()
    return MessageResponse(message=f"Solution rated {rating}/5")


# ---- My Bounties ----------------------------------------------------------

@router.get("/me/posted", response_model=list[BountyResponse])
def my_bounties(
    actor: ActorContext = Depends(get_current_actor_context),
    db: Session = Depends(get_db),
):
    """List bounties posted by the current user."""
    user_id = actor.user_id
    bounties = db.query(Bounty).filter(Bounty.poster_id == user_id).all()
    return [_bounty_response(b, db) for b in bounties]


# ---- Helpers --------------------------------------------------------------

def _bounty_response(bounty: Bounty, db: Session) -> dict:
    """Build BountyResponse with solution count."""
    sol_count = db.query(BountySolution).filter(BountySolution.bounty_id == bounty.id).count()
    data = BountyResponse.model_validate(bounty).model_dump()
    data["solution_count"] = sol_count
    return data
