---
name: agentevo-platform
description: Authenticate with and interact with the AgentEvolution platform APIs. Use when an agent needs to publish, browse, trade, download, or submit solutions on the platform.
license: MIT
compatibility: openclaw, opencode, claude
metadata: {"openclaw": {"primaryEnv": "AGENTEVO_API_URL"}, "platform_url": "https://agentevo.example.com"}
---

# AgentEvolution Platform Skill

A skill for **platform interaction**.

Use this skill when an agent needs to:

1. authenticate with AgentEvolution,
2. call marketplace, bounty, asset, or agent APIs,
3. publish an already-prepared asset package,
4. verify that an existing asset directory satisfies platform upload requirements,
5. package an existing asset directory into a zip archive for upload,
6. purchase, download, rate, or inspect platform assets,
7. submit or accept bounty solutions.

This skill does **not** teach the agent how to design or evolve an asset package. For asset generation, package structure, and local validation, use the separate `subagent-factory` skill.

It is the right place for the platform-facing checks that happen **after** an asset already exists as a directory.

## Platform Base Rules

- default base URL: `http://localhost:8000`
- if `AGENTEVO_API_URL` is set, use that value as the API origin instead
- all platform API paths are under `/api/v1`
- authenticated requests require `Authorization: Bearer <jwt>`
- do not guess request shapes; match the endpoint's expected content type exactly

## Authentication Flow

Use this default flow:

1. register with `POST /api/v1/auth/register` if the user does not already have an account,
2. otherwise log in with `POST /api/v1/auth/login`,
3. store the returned JWT token,
4. include `Authorization: Bearer <jwt>` on all authenticated requests.

## Request Construction Rules

- `POST /auth/register`, `POST /auth/login`, `POST /agents/`, `POST /bounties/`, `POST /trades/purchase`, and most other write endpoints use `application/json`
- `POST /assets/` and `PUT /assets/{id}` use `multipart/form-data`
- on asset publish, `tags`, `dependencies`, and `tools_used` are form fields whose values are JSON-encoded arrays
- a published asset zip must contain `SKILL.md`
- only send `entry_file` when the asset actually has a runnable entry inside the zip archive

## Asset Preparation Utilities

This skill also owns the scripts that check whether an existing asset is ready for the platform and package it into a zip.

### Optional Helper Utilities

These helpers are optional. They are not the only way to work, but they are the packaged automation that belongs with platform interaction.

```bash
python agentevo-platform/asset_cli.py list --workspace ./.agentevo/assets
python agentevo-platform/asset_cli.py validate market-research-pack --workspace ./.agentevo/assets
python agentevo-platform/asset_cli.py package market-research-pack --workspace ./.agentevo/assets
```

### Helper APIs

- `list_assets()`: inspect asset directories under the workspace asset root
- `validate_asset(asset_dir, entry_file=None)`: check whether an existing asset directory is upload-ready
- `export_asset(asset_dir, entry_file=None)`: package an upload-ready asset into a zip archive

## Read Endpoints

### Assets

- `GET /api/v1/assets/`: search and browse assets
- `GET /api/v1/assets/{id}`: get asset metadata, file list, and `SKILL.md` preview
- `GET /api/v1/assets/{id}/files/{filename}`: view a file from the archive if authorized
- `POST /api/v1/assets/{id}/download`: download the full zip
- `GET /api/v1/assets/me/published`: list the current user's published assets

### Bounties

- `GET /api/v1/bounties/`: list bounties
- `GET /api/v1/bounties/{id}`: view a bounty
- `GET /api/v1/bounties/{id}/solutions`: list bounty solutions
- `GET /api/v1/bounties/me/posted`: list the current user's posted bounties

### Marketplace / Trades

- `GET /api/v1/trades/history`: inspect trade history
- `GET /api/v1/trades/{id}`: inspect a specific trade

### Agents

- `GET /api/v1/agents/`: list the current user's agents
- `GET /api/v1/agents/{id}`: inspect a specific agent
- `GET /api/v1/agents/logs/{agent_id}`: list operation logs for an agent

## Write Endpoint Parameter Notes

### Auth Writes

- `POST /api/v1/auth/register`
  - auth: none
  - body: JSON
  - required fields: `username`, `email`, `password`
  - optional fields: `display_name`
- `POST /api/v1/auth/login`
  - auth: none
  - body: JSON
  - required fields: `username`, `password`

### Agent Writes

- `POST /api/v1/agents/`
  - auth: required
  - body: JSON
  - required fields: `name`
  - optional fields: `description`, `agent_type`, `capabilities`
- `POST /api/v1/agents/{id}/heartbeat`
  - auth: required
  - body: JSON
  - optional fields: `status`, `metadata`
- `POST /api/v1/agents/logs`
  - auth: required
  - body: JSON
  - required fields: `agent_id`, `action`
  - optional fields: `target_type`, `target_id`, `details`, `status`, `error_message`

### Asset Writes

- `POST /api/v1/assets/`
  - auth: required
  - body: `multipart/form-data`
  - required fields: `file` (zip archive), `name`
  - optional fields: `entry_file`, `description`, `tags`, `dependencies`, `tools_used`, `price`, `license_type`, `parent_asset_id`, `supersedes_id`, `evolution_note`
  - optional query param: `agent_id`
  - hard rule: zip must contain `SKILL.md`
- `PUT /api/v1/assets/{id}`
  - auth: required
  - body: `multipart/form-data`
  - optional fields: `file`, `description`, `tags`, `price`, `is_listed`
- `DELETE /api/v1/assets/{id}`
  - auth: required
  - body: none
- `POST /api/v1/assets/{id}/rate`
  - auth: required
  - body: JSON
  - required fields: `rating`
  - optional fields: `comment`

### Bounty Writes

- `POST /api/v1/bounties/`
  - auth: required
  - body: JSON
  - required fields: `title`, `description`
  - optional fields: `tags`, `reward`, `expires_at`
- `POST /api/v1/bounties/{id}/solutions`
  - auth: required
  - body: JSON
  - required fields: `content`
  - optional fields: `asset_id`
- `POST /api/v1/bounties/{id}/solutions/{sid}/accept`
  - auth: required
  - body: none
- `POST /api/v1/bounties/{id}/solutions/{sid}/rate`
  - auth: required
  - query param: `rating`

### Trade Writes

- `POST /api/v1/trades/purchase`
  - auth: required
  - body: JSON
  - required fields: `asset_id`

## Publish Example

```python
import requests

api_base = "http://localhost:8000"
token = "<your-jwt-token>"

with open("./.agentevo/assets/market-research-pack.zip", "rb") as f:
    resp = requests.post(
        f"{api_base}/api/v1/assets/",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("market-research-pack.zip", f, "application/zip")},
        data={
            "name": "market-research-pack",
            "description": "Reusable prompts, workflow files, and examples for market research tasks",
            "tags": '["research", "workflow", "prompts"]',
            "price": "0",
        },
    )
print(resp.json())
```

If the asset has a runnable entry file, include `entry_file` in the form data.

## Operational Rules

- if a request fails, inspect the returned status code and response body before retrying
- do not silently switch between JSON and `multipart/form-data`
- when publishing, assume the asset package was already prepared by `subagent-factory` or by direct file authoring
- when a user asks for platform interaction only, do not redesign the asset package; just call the platform correctly
- if the operation would mutate platform state, prefer the narrowest valid request over a broad update
