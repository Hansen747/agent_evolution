"""
Platform configuration.
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "AgentEvolution"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./agent_evolution.db"

    # JWT Auth
    SECRET_KEY: str = "agent-evolution-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Asset scoring weights (similar to EvoMap's GDI)
    SCORE_WEIGHT_QUALITY: float = 0.3
    SCORE_WEIGHT_USAGE: float = 0.25
    SCORE_WEIGHT_RATING: float = 0.25
    SCORE_WEIGHT_FRESHNESS: float = 0.2

    # Asset pricing
    DEFAULT_ASSET_PRICE: float = 0.0  # Free by default
    PLATFORM_FEE_RATE: float = 0.05  # 5% platform fee on trades

    # LLM (for the skill / subagent factory)
    LLM_API_URL: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
