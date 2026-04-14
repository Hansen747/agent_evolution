"""
Platform configuration.
"""

from pathlib import Path

from pydantic_settings import BaseSettings


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "AgentEvolution"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = f"sqlite:///{(PROJECT_ROOT / 'agent_evolution.db').as_posix()}"

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

    # Storage
    STORAGE_DIR: str = str(PROJECT_ROOT / "storage")  # root directory for uploaded asset archives

    # LLM (for the skill / subagent factory)
    LLM_API_URL: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4"

    class Config:
        env_file = str(PROJECT_ROOT / ".env")
        env_file_encoding = "utf-8"


settings = Settings()
