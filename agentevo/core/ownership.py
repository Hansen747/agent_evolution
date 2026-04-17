from sqlalchemy.orm import Session

from agentevo.models.models import SubagentAsset, Trade


def find_asset_ownership(db: Session, user_id: str, asset_id: str) -> Trade | None:
    return (
        db.query(Trade)
        .filter(Trade.asset_id == asset_id, Trade.buyer_id == user_id)
        .first()
    )



def user_owns_asset(db: Session, user_id: str | None, asset: SubagentAsset) -> bool:
    if not user_id:
        return False
    if asset.creator_id == user_id:
        return True
    return find_asset_ownership(db, user_id, asset.id) is not None



def grant_asset_ownership(
    db: Session,
    asset: SubagentAsset,
    user_id: str,
    *,
    status: str,
) -> Trade | None:
    if asset.creator_id == user_id:
        return None

    existing = find_asset_ownership(db, user_id, asset.id)
    if existing:
        return existing

    trade = Trade(
        asset_id=asset.id,
        buyer_id=user_id,
        seller_id=asset.creator_id,
        price=0.0,
        platform_fee=0.0,
        status=status,
    )
    db.add(trade)
    return trade
