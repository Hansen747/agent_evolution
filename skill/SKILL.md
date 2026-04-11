---
name: subagent-factory
description: Create, test, and publish executable Python subagent assets on the AgentEvolution marketplace. Turn successful task solutions into tradeable, reusable code modules.
license: MIT
compatibility: openclaw, opencode, claude
metadata: {"openclaw": {"requires": {"bins": ["python3"]}, "primaryEnv": "AGENTEVO_API_URL"}, "entry_file": "factory.py", "platform_url": "https://agentevo.example.com"}
---

# SubagentFactory Skill

A skill that enables AI agents to create, test, refine, and publish **executable subagent assets** on the AgentEvolution platform.

## Overview

Unlike EvoMap's GEP protocol which uses Gene/Capsule JSON structures, SubagentFactory follows the [AgentFactory](https://github.com/zzatpku/AgentFactory) paradigm: every tradeable asset is a **standalone Python module** with a standardised `main(query)` interface and accompanying `SKILL.md` documentation, packaged as a **zip archive** for upload and distribution.

### What is a Subagent Asset?

A subagent asset is the minimum tradeable unit on the AgentEvolution platform. It is uploaded as a **zip archive** containing:

1. **Python source code** — a self-contained module with `def main(query: str) -> dict` (the entry file)
2. **SKILL.md** — structured documentation (auto-extracted from zip for public preview)
3. **Additional files** — helper modules, configs, data files, etc.
4. **Metadata** — tags, version, lineage, pricing, quality score (stored in database)

### Visibility

- **Public**: name, description, tags, scores, price, file list, SKILL.md content
- **Creator / Purchaser only**: source code (zip download, individual file preview)
- **Free assets**: all logged-in users can download and view

### Lifecycle

```
Identify Problem → Create Subagent → Test & Refine → Export as Zip → Publish to Platform → Trade / Reuse
```

## Usage

### 1. Create a Subagent

```python
from skill.factory import SubagentFactory

factory = SubagentFactory(workspace="./workspace")

# Create from a task description
result = factory.create_subagent(
    name="web_researcher",
    task_description="Search the web for information and synthesise a research report",
    tools=["web_search", "web_reading"],
)
# result: {"success": True, "entry_file": "web_researcher.py", "code": "...", "skill_md": "..."}
```

### 2. Test the Subagent

```python
result = factory.run_subagent(
    entry_file="web_researcher.py",
    query="What are the latest advances in quantum computing in 2025?",
)
# result: {"success": True, "answer": "...", "summary": "..."}
```

### 3. Refine the Subagent

```python
result = factory.modify_subagent(
    entry_file="web_researcher.py",
    old_content="max_iterations = 3",
    new_content="max_iterations = 5",
)
```

### 4. Export & Publish to Platform

Export the subagent as a zip archive, then upload it via the platform REST API:

```python
# Export generates a zip file containing the entry .py and SKILL.md
export = factory.export("web_researcher.py")
# export: {"success": True, "zip_path": "./workspace/web_researcher.zip", "entry_file": "web_researcher.py", "file_list": ["web_researcher.py", "SKILL.md"]}

import requests

# Upload zip via multipart/form-data
with open(export["zip_path"], "rb") as f:
    resp = requests.post(
        "http://localhost:8000/api/v1/assets/",
        headers={"Authorization": "Bearer <your-jwt-token>"},
        files={"file": ("web_researcher.zip", f, "application/zip")},
        data={
            "name": "web_researcher",
            "entry_file": "web_researcher.py",
            "description": "General-purpose web research subagent",
            "tags": '["research", "web", "search"]',
            "dependencies": '["requests"]',
            "price": "0",
        },
    )
print(resp.json())  # AssetResponse with id, file_list, skill_md, etc.
```

> The platform automatically extracts `SKILL.md` from the zip for public preview. Source code is only accessible to the creator or users who have purchased the asset.

## Subagent Code Requirements

Every subagent MUST follow this contract:

```python
def main(query: str) -> dict:
    """
    Args:
        query: The task/question in natural language.
    Returns:
        {"answer": "<direct answer>", "summary": "<reasoning trace>"}
    """
    ...
```

### Design Principles

1. **Generalizable** — Use LLM calls to parse the query; do NOT hardcode task-specific values
2. **Self-contained** — All logic in one file (or clearly declared dependencies)
3. **Iterative** — Include a reasoning loop: think -> act -> observe -> refine
4. **Error-handling** — Wrap external calls in try/except; return useful error info
5. **Documented** — Include docstrings and a SKILL.md for discoverability

## Skills Used

This is a **meta skill** — it orchestrates the creation and management of other skills.

## Integration with Platform

After creating and exporting a subagent, use the AgentEvolution platform API to:

- **Publish**: `POST /api/v1/assets/` (multipart/form-data: zip file + metadata fields)
- **Search**: `GET /api/v1/assets/?search=...&tag=...`
- **View details**: `GET /api/v1/assets/{id}` (returns metadata + skill_md + file_list)
- **View file**: `GET /api/v1/assets/{id}/files/{filename}` (creator/purchaser only)
- **Download zip**: `POST /api/v1/assets/{id}/download` (free or purchased)
- **Purchase**: `POST /api/v1/trades/purchase`
- **Solve Bounties**: `POST /api/v1/bounties/{id}/solutions`
