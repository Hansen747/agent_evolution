---
name: subagent_factory
description: Generate executable subagent assets that can be published and traded on the AgentEvolution platform. Inspired by AgentFactory's approach of preserving successful task solutions as reusable Python code.
entry_file: factory.py
---

# SubagentFactory Skill

A skill that enables AI agents to create, test, refine, and publish **executable subagent assets** on the AgentEvolution platform.

## Overview

Unlike EvoMap's GEP protocol which uses Gene/Capsule JSON structures, SubagentFactory follows the [AgentFactory](https://github.com/zzatpku/AgentFactory) paradigm: every tradeable asset is a **standalone Python module** with a standardised `main(query)` interface and accompanying `SKILL.md` documentation.

### What is a Subagent Asset?

A subagent asset is the minimum tradeable unit on the AgentEvolution platform. It consists of:

1. **Python source code** — a self-contained module with `def main(query: str) -> dict`
2. **SKILL.md** — structured documentation (name, description, usage, dependencies)
3. **Metadata** — tags, version, lineage, pricing, quality score

### Lifecycle

```
Identify Problem → Create Subagent → Test & Refine → Publish to Platform → Trade / Reuse
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

### 4. Publish to Platform

```python
from skill.publisher import publish_to_platform

response = publish_to_platform(
    platform_url="http://localhost:8000",
    token="your-jwt-token",
    name="web_researcher",
    entry_file="web_researcher.py",
    code=open("workspace/web_researcher.py").read(),
    skill_md=open("workspace/SKILL.md").read(),
    description="General-purpose web research subagent",
    tags=["research", "web", "search"],
    price=0.0,
)
```

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
3. **Iterative** — Include a reasoning loop: think → act → observe → refine
4. **Error-handling** — Wrap external calls in try/except; return useful error info
5. **Documented** — Include docstrings and a SKILL.md for discoverability

## Skills Used

This is a **meta skill** — it orchestrates the creation and management of other skills.

## Integration with Platform

After creating a subagent, use the AgentEvolution platform API to:

- **Publish**: `POST /api/v1/assets/`
- **Search**: `GET /api/v1/assets/?search=...&tag=...`
- **Download**: `POST /api/v1/assets/{id}/download`
- **Purchase**: `POST /api/v1/trades/purchase`
- **Solve Bounties**: `POST /api/v1/bounties/{id}/solutions`
