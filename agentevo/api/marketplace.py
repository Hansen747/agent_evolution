"""
Marketplace / Trade API: purchase EvoPacks, trade history.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from agentevo.core.database import get_db
from agentevo.core.security import get_current_user_id
from agentevo.core.config import settings
from agentevo.core.scoring import compute_asset_score
from agentevo.models.models import Trade, SubagentAsset, User, OperationLog
from agentevo.api.schemas import (
    TradePurchaseRequest, TradeResponse,
    PaginatedResponse, MessageResponse,
)

router = APIRouter(prefix="/trades", tags=["marketplace"])


@router.post("/purchase", response_model=TradeResponse, status_code=status.HTTP_201_CREATED)
def purchase_asset(
    req: TradePurchaseRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Purchase a priced EvoPack."""
    asset = db.query(SubagentAsset).filter(SubagentAsset.id == req.asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="EvoPack not found")
    if not asset.is_listed:
        raise HTTPException(status_code=400, detail="EvoPack is not listed for sale")
    if asset.price <= 0:
        raise HTTPException(
            status_code=400,
            detail="This EvoPack is free. Use /assets/{id}/download instead.",
        )
    if asset.creator_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot purchase your own EvoPack")

    # Check buyer credits
    buyer = db.query(User).filter(User.id == user_id).first()
    if not buyer or buyer.credits < asset.price:
        raise HTTPException(status_code=400, detail="Insufficient credits")

    # Calculate fees
    platform_fee = round(asset.price * settings.PLATFORM_FEE_RATE, 2)
    seller_receives = asset.price - platform_fee

    # Transfer credits
    buyer.credits -= asset.price
    seller = db.query(User).filter(User.id == asset.creator_id).first()
    if seller:
        seller.credits += seller_receives

    # Update asset stats
    asset.download_count += 1
    asset.usage_count += 1
    asset.composite_score = compute_asset_score(
        quality_score=asset.quality_score,
        usage_count=asset.usage_count,
        avg_rating=asset.avg_rating,
        created_at=asset.created_at,
        solve_count=asset.solve_count,
    )

    # Create trade record
    trade = Trade(
        asset_id=asset.id,
        buyer_id=user_id,
        seller_id=asset.creator_id,
        price=asset.price,
        platform_fee=platform_fee,
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)

    return trade


@router.get("/history", response_model=PaginatedResponse)
def trade_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: str = Query("all", pattern="^(all|buyer|seller)$"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get trade history for the current user."""
    query = db.query(Trade)
    if role == "buyer":
        query = query.filter(Trade.buyer_id == user_id)
    elif role == "seller":
        query = query.filter(Trade.seller_id == user_id)
    else:
        from sqlalchemy import or_
        query = query.filter(or_(Trade.buyer_id == user_id, Trade.seller_id == user_id))

    total = query.count()
    items = (
        query.order_by(Trade.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PaginatedResponse(
        items=[TradeResponse.model_validate(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{trade_id}", response_model=TradeResponse)
def get_trade(
    trade_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get details of a specific trade."""
    from sqlalchemy import or_
    trade = db.query(Trade).filter(
        Trade.id == trade_id,
        or_(Trade.buyer_id == user_id, Trade.seller_id == user_id),
    ).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade
