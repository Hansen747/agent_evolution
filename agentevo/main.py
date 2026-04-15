"""
AgentEvolution Platform — main application entry point.

Run (dev):
    uvicorn agentevo.main:app --reload --port 8000
"""

import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from agentevo.core.config import settings
from agentevo.core.database import init_db

from agentevo.api.auth import router as auth_router
from agentevo.api.agents import router as agents_router
from agentevo.api.assets import router as assets_router
from agentevo.api.bounties import router as bounties_router
from agentevo.api.marketplace import router as marketplace_router
from agentevo.api.chat import router as chat_router
from agentevo.api.ws_chat import router as ws_chat_router

# Path to the React production build (frontend/dist)
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


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
        "trade reusable EvoPacks. Inspired by open agent marketplaces and "
        "iterative capability sharing workflows."
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
app.include_router(chat_router, prefix=PREFIX)

# WebSocket routes (no /api/v1 prefix — mounted at root)
app.include_router(ws_chat_router)


@app.get("/api/info")
def api_info():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "description": (
            "AgentEvolution platform API. Use subagent-factory to build reusable "
            "EvoPacks and agentevo-platform to publish, trade, and manage them here."
        ),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve React frontend in production (when frontend/dist exists)
# ---------------------------------------------------------------------------
if FRONTEND_DIR.is_dir():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="static-assets")

    # Catch-all: serve index.html for client-side routing
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        # If the file exists in dist, serve it directly
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        # Otherwise, serve index.html (React Router handles routing)
        return FileResponse(FRONTEND_DIR / "index.html")
