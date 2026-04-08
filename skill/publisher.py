"""
Publisher — Upload subagent assets from the local factory to the AgentEvolution platform.

This module bridges the SubagentFactory (local subagent creation) with the
platform API (remote marketplace).
"""

import json
from typing import Any, Dict, List, Optional

import requests


DEFAULT_PLATFORM_URL = "http://localhost:8000"
API_PREFIX = "/api/v1"


class PlatformPublisher:
    """
    Client for publishing subagent assets to the AgentEvolution platform.

    Usage:
        publisher = PlatformPublisher(platform_url, token)
        result = publisher.publish(name, code, skill_md, ...)
    """

    def __init__(self, platform_url: str = DEFAULT_PLATFORM_URL, token: str = ""):
        self.base_url = platform_url.rstrip("/") + API_PREFIX
        self.token = token
        self.session = requests.Session()
        if token:
            self.session.headers["Authorization"] = f"Bearer {token}"

    # ---- Auth helpers -----------------------------------------------------

    def register(self, username: str, email: str, password: str) -> Dict[str, Any]:
        """Register a new user on the platform."""
        resp = self.session.post(
            f"{self.base_url}/auth/register",
            json={"username": username, "email": email, "password": password},
        )
        data = resp.json()
        if resp.status_code == 201:
            self.token = data.get("access_token", "")
            self.session.headers["Authorization"] = f"Bearer {self.token}"
        return data

    def login(self, username: str, password: str) -> Dict[str, Any]:
        """Login and obtain a JWT token."""
        resp = self.session.post(
            f"{self.base_url}/auth/login",
            json={"username": username, "password": password},
        )
        data = resp.json()
        if resp.status_code == 200:
            self.token = data.get("access_token", "")
            self.session.headers["Authorization"] = f"Bearer {self.token}"
        return data

    # ---- Agent registration ------------------------------------------------

    def register_agent(
        self,
        name: str,
        description: str = "",
        agent_type: str = "generic",
        capabilities: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Register a new agent on the platform."""
        resp = self.session.post(
            f"{self.base_url}/agents/",
            json={
                "name": name,
                "description": description,
                "agent_type": agent_type,
                "capabilities": capabilities or [],
            },
        )
        return resp.json()

    # ---- Asset publishing --------------------------------------------------

    def publish(
        self,
        name: str,
        code: str,
        entry_file: str = "subagent.py",
        skill_md: str = "",
        description: str = "",
        tags: Optional[List[str]] = None,
        dependencies: Optional[List[str]] = None,
        tools_used: Optional[List[str]] = None,
        price: float = 0.0,
        license_type: str = "MIT",
        agent_id: Optional[str] = None,
        parent_asset_id: Optional[str] = None,
        supersedes_id: Optional[str] = None,
        evolution_note: str = "",
    ) -> Dict[str, Any]:
        """
        Publish a subagent asset to the platform marketplace.

        Args:
            name:           Asset name
            code:           Python source code
            entry_file:     Entry filename
            skill_md:       SKILL.md content
            description:    Human-readable description
            tags:           Searchable tags
            dependencies:   pip package dependencies
            tools_used:     Tool skill names used by this subagent
            price:          Price in credits (0 = free)
            license_type:   License (default MIT)
            agent_id:       Agent that produced this asset (query param)
            parent_asset_id: ID of parent asset (for evolution tracking)
            supersedes_id:  ID of asset this one replaces
            evolution_note: What was improved

        Returns:
            The created asset response from the API.
        """
        params = {}
        if agent_id:
            params["agent_id"] = agent_id

        payload = {
            "name": name,
            "description": description,
            "tags": tags or [],
            "entry_file": entry_file,
            "code": code,
            "skill_md": skill_md,
            "dependencies": dependencies or [],
            "tools_used": tools_used or [],
            "price": price,
            "license_type": license_type,
            "parent_asset_id": parent_asset_id,
            "supersedes_id": supersedes_id,
            "evolution_note": evolution_note,
        }

        resp = self.session.post(
            f"{self.base_url}/assets/",
            params=params,
            json=payload,
        )
        return resp.json()

    # ---- Marketplace browsing ---------------------------------------------

    def search_assets(
        self,
        search: str = "",
        tag: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """Search the asset marketplace."""
        params = {"page": page, "page_size": page_size}
        if search:
            params["search"] = search
        if tag:
            params["tag"] = tag

        resp = self.session.get(f"{self.base_url}/assets/", params=params)
        return resp.json()

    def get_asset(self, asset_id: str) -> Dict[str, Any]:
        """Get full details of an asset."""
        resp = self.session.get(f"{self.base_url}/assets/{asset_id}")
        return resp.json()

    def download_asset(self, asset_id: str) -> Dict[str, Any]:
        """Download a free asset."""
        resp = self.session.post(f"{self.base_url}/assets/{asset_id}/download")
        return resp.json()

    def purchase_asset(self, asset_id: str) -> Dict[str, Any]:
        """Purchase a priced asset."""
        resp = self.session.post(
            f"{self.base_url}/trades/purchase",
            json={"asset_id": asset_id},
        )
        return resp.json()

    # ---- Bounties ---------------------------------------------------------

    def create_bounty(
        self,
        title: str,
        description: str,
        tags: Optional[List[str]] = None,
        reward: float = 0.0,
    ) -> Dict[str, Any]:
        """Post a new bounty/problem."""
        resp = self.session.post(
            f"{self.base_url}/bounties/",
            json={
                "title": title,
                "description": description,
                "tags": tags or [],
                "reward": reward,
            },
        )
        return resp.json()

    def submit_solution(
        self,
        bounty_id: str,
        content: str,
        asset_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Submit a solution to a bounty."""
        resp = self.session.post(
            f"{self.base_url}/bounties/{bounty_id}/solutions",
            json={"content": content, "asset_id": asset_id},
        )
        return resp.json()

    def list_bounties(
        self,
        search: str = "",
        status: str = "",
        page: int = 1,
    ) -> Dict[str, Any]:
        """Browse bounties."""
        params = {"page": page}
        if search:
            params["search"] = search
        if status:
            params["status"] = status

        resp = self.session.get(f"{self.base_url}/bounties/", params=params)
        return resp.json()

    # ---- Operation logs ---------------------------------------------------

    def log_operation(
        self,
        agent_id: str,
        action: str,
        target_type: str = "",
        target_id: str = "",
        details: Optional[dict] = None,
        status: str = "success",
        error_message: str = "",
    ) -> Dict[str, Any]:
        """Record an agent operation."""
        resp = self.session.post(
            f"{self.base_url}/agents/logs",
            json={
                "agent_id": agent_id,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "details": details or {},
                "status": status,
                "error_message": error_message,
            },
        )
        return resp.json()


# ---- Convenience function ------------------------------------------------

def publish_to_platform(
    platform_url: str = DEFAULT_PLATFORM_URL,
    token: str = "",
    **kwargs,
) -> Dict[str, Any]:
    """
    One-shot convenience function to publish a subagent asset.

    Args:
        platform_url: Platform API URL
        token:        JWT auth token
        **kwargs:     All arguments forwarded to PlatformPublisher.publish()

    Returns:
        API response dict
    """
    publisher = PlatformPublisher(platform_url=platform_url, token=token)
    return publisher.publish(**kwargs)
