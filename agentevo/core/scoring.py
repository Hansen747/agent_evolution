"""
Asset scoring engine.

Inspired by EvoMap's GDI (Global Desirability Index), this module computes
a composite score for subagent assets based on quality, usage, community
rating, and freshness.
"""

import math
from datetime import datetime, timezone
from agentevo.core.config import settings


def compute_asset_score(
    quality_score: float,       # 0-1, from AI review / structural analysis
    usage_count: int,           # total times this asset has been used / purchased
    avg_rating: float,          # 0-5, community rating
    created_at: datetime,       # when the asset was published
    solve_count: int = 0,       # how many bounties it has solved
) -> float:
    """
    Compute a composite score (0-100) for an asset.

    Components:
      - quality:   structural completeness, code quality, documentation
      - usage:     log-scaled usage count
      - rating:    normalised community rating
      - freshness: exponential decay from creation time
    """
    # Coerce None to safe defaults
    quality_score = quality_score or 0.0
    usage_count = usage_count or 0
    avg_rating = avg_rating or 0.0
    solve_count = solve_count or 0

    # Normalise components to 0-1
    norm_quality = max(0.0, min(1.0, quality_score))

    # Log-scale usage (1 usage = 0, 100 = ~0.5, 10000 = ~1.0)
    norm_usage = min(1.0, math.log10(max(1, usage_count + 1)) / 4.0)

    # Rating normalised from 0-5 to 0-1
    norm_rating = max(0.0, min(1.0, avg_rating / 5.0))

    # Freshness: half-life of 30 days
    if created_at is None:
        created_at = datetime.now(timezone.utc)
    age_days = (datetime.now(timezone.utc) - created_at.replace(tzinfo=timezone.utc)).total_seconds() / 86400
    norm_freshness = math.exp(-0.023 * max(0, age_days))  # ~0.5 at 30 days

    # Bonus for solving bounties
    solve_bonus = min(0.1, solve_count * 0.02)

    score = (
        settings.SCORE_WEIGHT_QUALITY * norm_quality
        + settings.SCORE_WEIGHT_USAGE * norm_usage
        + settings.SCORE_WEIGHT_RATING * norm_rating
        + settings.SCORE_WEIGHT_FRESHNESS * norm_freshness
        + solve_bonus
    ) * 100

    return round(min(100.0, max(0.0, score)), 2)
