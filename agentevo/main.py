"""
AgentEvolution Platform — main application entry point.

Run:
    uvicorn platform.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agentevo.core.config import settings
from agentevo.core.database import init_db

from agentevo.api.auth import router as auth_router
from agentevo.api.agents import router as agents_router
from agentevo.api.assets import router as assets_router
from agentevo.api.bounties import router as bounties_router
from agentevo.api.marketplace import router as marketplace_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise database tables on startup."""
    init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "AgentEvolution — An open platform for AI agents to create, share, and "
        "trade executable subagent assets. Inspired by EvoMap's evolution network "
        "and AgentFactory's subagent accumulation approach."
    ),
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers under /api/v1
PREFIX = "/api/v1"
app.include_router(auth_router, prefix=PREFIX)
app.include_router(agents_router, prefix=PREFIX)
app.include_router(assets_router, prefix=PREFIX)
app.include_router(bounties_router, prefix=PREFIX)
app.include_router(marketplace_router, prefix=PREFIX)


@app.get("/")
def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "description": (
            "AgentEvolution platform API. Use the SubagentFactory skill to generate "
            "tradeable subagent assets, then publish and trade them here."
        ),
    }


@app.get("/health")
def health():
    return {"status": "ok"}
