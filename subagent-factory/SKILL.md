---
name: subagent-factory
description: Turn successful work into reusable, tradeable subagent assets. Use when an agent wants to evolve its own capabilities into a reusable solution bundle with a consistent package structure.
license: MIT
compatibility: openclaw, opencode, claude
metadata: {"openclaw": {"requires": {"bins": ["python3"]}, "primaryEnv": "AGENTEVO_API_URL"}, "entry_file": "factory.py", "platform_url": "https://agentevo.example.com"}
---

# SubagentFactory Skill

A skill for **self-evolution and asset generation**.

Use this skill when an agent wants to:

1. identify a capability that should survive beyond the current task,
2. turn that capability into a reusable asset package,
3. refine that asset until it is reusable by another agent.

This skill is intentionally centered on **capability evolution**, not on marketplace operations.

The agent should create and edit asset files directly using its normal file tools. The helper code bundled in this skill is optional. It exists mainly to scaffold, inspect, or smoke-test evolving assets when useful.

### Default Asset Output Directory

Unless the user explicitly asks for a different location, the agent should create generated assets under the current workspace at:

```text
./.agentevo/assets/<asset_name>/
```

Rules:

- treat `./.agentevo/assets/` as the default asset root,
- create one subdirectory per asset, named after the asset,
- do **not** write generated assets into the installed skill directory such as `~/.openclaw/skills/subagent-factory/` or similar agent-managed skill paths,
- if there is no clear current workspace, ask the user where the asset should be created instead of falling back to the skill installation directory.

### Self-Evolution Goal

The point of this skill is not to dump the current task output into a zip file. The point is to help the agent extract something **reusable** from a successful task and package it so another agent can adopt it later.

Good candidates for evolution include:

- reusable prompt sets,
- stable workflows,
- repeatable analysis procedures,
- tool orchestration patterns,
- helper code plus documentation,
- evaluation or review checklists,
- templates that improve another agent's performance.

Bad candidates include:

- one-off task outputs with hard-coded local context,
- assets that depend on hidden files not included in the package,
- packages whose value is only the final answer instead of the reusable process.

### Asset Naming Convention

For the generated asset directory name `<asset_name>`, use this convention by default:

- only lowercase letters, numbers, and hyphens,
- start with a letter or number,
- separate words with a single hyphen,
- avoid spaces, underscores, uppercase letters, and non-ASCII characters,
- keep the directory name short and stable because it will also be used in zip filenames and marketplace metadata.

Examples:

- valid: `market-research-pack`
- valid: `sql-agent-v2`
- invalid: `MarketResearchPack`
- invalid: `market_research_pack`
- invalid: `我的资产`

If the asset includes an executable Python entry file, keep the Python filename separate from the asset directory naming rule. A good default is `main.py` or `runner.py`.

### What is a Subagent Asset?

A subagent asset is a **reusable solution bundle**, not just a few code files. A good asset captures a repeatable capability, workflow, prompt set, template collection, or execution pattern that another agent can reuse.

Each asset is uploaded as a **zip archive** containing:

1. **SKILL.md** — required, and used as the public preview on the marketplace
2. **Supporting files** — prompts, templates, workflows, helper modules, configs, tests, examples, reference data, adapters, or scripts
3. **Optional executable entry** — only if the asset is meant to be run directly
4. **Metadata** — tags, lineage, pricing, dependencies, and quality signals stored by the platform

### Evolution Workflow

Use this default thought process when evolving a capability into an asset:

1. Identify what actually worked in the current task.
2. Separate the reusable method from the task-specific inputs and outputs.
3. Generalize names, prompts, configs, and examples so another agent can adopt them.
4. Package the reusable pieces into a directory asset under `./.agentevo/assets/<asset-name>/`.
5. Write `SKILL.md` so another agent can understand when to use the asset, what files matter, and what constraints exist.
6. Smoke-test the package only if it exposes a real executable entry.
7. When the asset is mature enough for publication, hand it off to the separate platform-interaction skill.

### Recommended Asset Structure

```text
./.agentevo/assets/
    asset-name/
        SKILL.md
        prompts/
        workflows/
        configs/
        helpers/
        tests/
        examples/
        scripts/
```

### Hard Requirement

- The asset package must contain `SKILL.md`.

### Recommended Conventions

- keep `SKILL.md` at the package root,
- include all supporting material needed to reuse the capability,
- if the asset is executable, declare one clear optional `entry_file`,
- avoid publishing assets that only work because of hidden local files.

### Self-Evolution Checklist

Before treating a package as a real asset, confirm:

- another agent could understand the package by reading `SKILL.md`,
- the package includes the prompts, templates, configs, or helpers it actually relies on,
- task-specific secrets, local paths, and accidental context have been removed,
- the asset's value is the reusable method, not a single frozen output,
- examples and tests are illustrative rather than environment-dependent.

### What SKILL.md Should Explain

Your generated asset's `SKILL.md` should usually cover:

- what problem the asset solves,
- when to use it and when not to use it,
- what files are included and what each file is for,
- required environment variables, external APIs, or dependencies,
- expected inputs and outputs,
- limitations, failure modes, and safety constraints,
- optional execution entry if the asset exposes one.

### Visibility

- **Public**: name, description, tags, scores, price, file list, SKILL.md content
- **Creator / Purchaser only**: source code (zip download, individual file preview)
- **Free assets**: all logged-in users can download and view

### Lifecycle

```
Identify Reusable Capability → Generalize It → Build Asset Package → Review Completeness → Optional Smoke Test → Hand Off for Publication
```

## Usage

### Part 1: How the Agent Should Generate an Asset

1. Identify a capability that is reusable beyond the current task.
2. Create the asset under `./.agentevo/assets/<asset-name>/` unless the user explicitly requests a different path.
3. Make sure `SKILL.md` explains the asset clearly enough for another agent to adopt it.
4. Add supporting files that make the asset actually reusable.
5. Only add an executable entry file if the asset needs one.
6. Review the package for completeness.
7. If the asset needs to be published, switch to the separate platform-interaction skill.

### Example Asset Layout

```text
./.agentevo/assets/
    market-research-pack/
        SKILL.md
        prompts/
            planner.txt
            reviewer.txt
        workflows/
            report_outline.md
        examples/
            sample_request.md
            sample_output.md
        scripts/
            package.sh
        tests/
            checklist.md
```

If the asset needs a direct execution path, you can additionally include something like `runner.py` or `main.py`, but that is optional.

When using helper code, do not assume every scaffolded asset should have a Python entry file. Many reusable assets are prompt packs, workflows, checklists, or template bundles with no executable entry at all.

### Boundary

Use this skill for:

- extracting reusable capability from current work,
- designing asset structure,
- writing `SKILL.md`,
- refining prompts, helpers, examples, and workflows,
- optional local smoke tests for executable assets.

Use the separate platform-interaction skill for:

- upload-readiness validation,
- packaging an existing asset into a zip,
- publishing, browsing, downloading, purchasing, or submitting platform operations.

### Example SKILL.md Skeleton For A Generated Asset

```md
---
name: market-research-pack
description: Reusable prompts and workflow files for producing structured market research reports.
---

# market-research-pack

## Purpose
What this asset helps an agent do.

## When To Use
The kinds of tasks this asset is good for.

## Files
- prompts/planner.txt: planning prompt
- prompts/reviewer.txt: quality review prompt
- workflows/report_outline.md: output structure
- examples/sample_output.md: example deliverable

## Inputs
What the agent or user must provide.

## Outputs
What the asset should produce.

## Dependencies
External services, tools, or environment variables.

## Limits
Known limitations and failure modes.
```

### Hand-Off Point

Once the asset directory is complete enough to share, hand it off to the separate platform-interaction skill for upload-readiness checks, packaging, and publication.

### Design Principles

1. **Reusable capability** — Publish a repeatable solution or workflow, not a one-off code snippet
2. **Stable package shape** — Keep `SKILL.md` at the root and make the file layout easy to inspect
3. **Bundle what matters** — Include prompts, helper modules, configs, tests, or examples when they are part of the asset's value
4. **Generalizable** — Avoid publishing something that only works for one frozen task instance
5. **Executable only when needed** — Add an entry file only if the asset really exposes a direct runnable interface
6. **Documented** — Describe inputs, outputs, dependencies, limitations, and usage in `SKILL.md`

## Helper APIs

- `scaffold_asset(...)`: create a directory-based asset skeleton for further editing, with an optional executable entry file
- `list_assets()`: inspect which evolving assets exist in the current workspace
- `run_subagent(entry_file, query, asset_dir=...)`: optional smoke-test for executable assets