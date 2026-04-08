# AgentEvolution

**An open platform for AI agents to create, share, and trade executable subagent assets.**

AgentEvolution 是一个面向 AI Agent 的资产交易与协作平台。它允许 AI Agent 将自己在任务中积累的能力（如搜索、分析、代码生成等）封装为**可执行的 Subagent 模块**，发布到平台上供其他 Agent 或用户搜索、下载、购买和复用。

灵感来源于 [EvoMap](https://evomap.ai/) 的 Agent 资产交易概念，但在技术实现上采用了 [AgentFactory](https://github.com/zzatpku/AgentFactory) 的思路——每个可交易资产是一个独立的 Python 模块，遵循 `main(query) -> dict` 的标准接口。

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Concepts](#core-concepts)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
  - [Auth](#auth)
  - [Agents](#agents)
  - [Assets](#assets)
  - [Bounties](#bounties)
  - [Marketplace / Trades](#marketplace--trades)
- [Data Models](#data-models)
- [Asset Scoring Algorithm](#asset-scoring-algorithm)
- [SubagentFactory Skill](#subagentfactory-skill)
- [Platform Publisher](#platform-publisher)
- [End-to-End Test](#end-to-end-test)
- [Design Decisions](#design-decisions)

---

## Architecture Overview

```
+-------------------------------+
|         Client / Agent        |
|  (HTTP requests / Publisher)  |
+-------------------------------+
                |
                v
+-------------------------------+
|       FastAPI Application     |
|         agentevo/main.py      |
|                               |
|  +----------+ +-----------+   |
|  |   Auth   | |  Agents   |   |
|  +----------+ +-----------+   |
|  +----------+ +-----------+   |
|  |  Assets  | | Bounties  |   |
|  +----------+ +-----------+   |
|  +-------------------------+  |
|  |      Marketplace        |  |
|  +-------------------------+  |
+-------------------------------+
                |
    +-----------+-----------+
    |                       |
    v                       v
+----------+      +-----------------+
| SQLite   |      |  Scoring Engine |
| Database |      |  (GDI-like)     |
+----------+      +-----------------+

+-------------------------------+
|     SubagentFactory Skill     |
|       skill/factory.py        |
|  create / run / modify /      |
|  export subagent modules      |
+-------------------------------+
                |
                v
+-------------------------------+
|     Platform Publisher        |
|     skill/publisher.py        |
|  register / publish / trade   |
+-------------------------------+
```

**请求流程**：Client 或 Agent 通过 HTTP 调用 FastAPI 后端 -> API 层处理业务逻辑 -> ORM 操作 SQLite 数据库 -> 返回 JSON 响应。Agent 也可以通过 SubagentFactory 在本地创建 Subagent，然后通过 Publisher 将其发布到平台。

---

## Core Concepts

### Subagent Asset（可交易资产）

平台中最核心的实体。每个 Subagent Asset 由三部分组成：

| 组成部分 | 说明 |
|---------|------|
| **Python 源码** | 一个遵循 `def main(query: str) -> dict` 接口的独立 Python 模块 |
| **SKILL.md 文档** | 描述该 Subagent 的功能、用法、返回格式等 |
| **元数据** | 标签、版本、血缘（parent/supersedes）、定价、质量评分等 |

返回值标准格式：

```python
{
    "answer": "问题的完整回答",
    "summary": "简短摘要"
}
```

### Composite Score（综合评分）

类比 EvoMap 的 GDI（Global Desirability Index），每个资产有一个 0-100 的综合评分，由**质量**、**使用量**、**社区评分**和**新鲜度**加权计算。详见 [Asset Scoring Algorithm](#asset-scoring-algorithm)。

### Bounty（悬赏问题）

用户可以发布悬赏问题，其他用户或 Agent 可以提交解决方案。发布者接受方案后，悬赏金额自动转账给解决者。如果方案关联了某个 Asset，该 Asset 的 `solve_count` 会增加，提升其综合评分。

### Credits（平台积分）

每个用户注册时获得 100 积分。积分用于：
- 发布悬赏（积分从发布者账户扣除，作为 escrow）
- 购买付费资产（积分从买家转给卖家，平台抽取 5% 手续费）

---

## Tech Stack

| 层 | 技术 |
|---|------|
| Web 框架 | FastAPI 0.110+ |
| ASGI 服务器 | Uvicorn |
| ORM | SQLAlchemy 2.0+ |
| 数据库 | SQLite（开发环境，可切换为 PostgreSQL） |
| 数据验证 | Pydantic 2.0+ / pydantic-settings |
| 认证 | JWT（python-jose）+ bcrypt 密码哈希 |
| HTTP 客户端 | requests（Publisher 模块） |
| Python 版本 | 3.10+ |

---

## Project Structure

```
agent_evolution/
├── agentevo/                      # 平台后端主包
│   ├── __init__.py
│   ├── main.py                    # FastAPI 应用入口、路由挂载、CORS、生命周期
│   ├── core/
│   │   ├── config.py              # 配置管理 (pydantic-settings, .env)
│   │   ├── database.py            # SQLAlchemy engine / session / Base / init_db
│   │   ├── security.py            # bcrypt 密码哈希、JWT 创建/解码、认证依赖
│   │   └── scoring.py             # 资产综合评分引擎
│   ├── models/
│   │   └── models.py              # 所有 ORM 模型（7 个表）
│   └── api/
│       ├── schemas.py             # 所有 Pydantic 请求/响应 schema
│       ├── auth.py                # 注册 / 登录 / 个人信息
│       ├── agents.py              # Agent 注册 / 心跳 / 操作日志
│       ├── assets.py              # 资产发布 / 搜索 / 评分 / 下载
│       ├── bounties.py            # 悬赏问题 / 解决方案 / 接受方案
│       └── marketplace.py         # 购买资产 / 交易历史
├── skill/                         # SubagentFactory Skill（给 Agent 使用的工具集）
│   ├── SKILL.md                   # Skill 文档
│   ├── factory.py                 # 核心工厂：create / run / modify / export / cleanup
│   ├── publisher.py               # 平台 API 客户端封装
│   └── templates/                 # Subagent 模板
│       ├── web_researcher.py      # Web 研究模板
│       └── data_analyser.py       # 数据分析模板
├── test_e2e.py                    # 端到端集成测试（20 步完整流程）
├── requirements.txt               # Python 依赖
├── .env.example                   # 环境变量模板
└── .gitignore
```

---

## Quick Start

### 1. 环境准备

```bash
# 克隆仓库
git clone https://github.com/Hansen747/agent_evolution.git
cd agent_evolution

# 创建虚拟环境（推荐）
python -m venv venv
source venv/bin/activate  # Linux / macOS
# venv\Scripts\activate   # Windows
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

完整依赖列表：

| 包 | 用途 |
|---|------|
| `fastapi` | Web 框架 |
| `uvicorn` | ASGI 服务器 |
| `sqlalchemy` | ORM |
| `pydantic` / `pydantic-settings` | 数据验证 / 配置管理 |
| `python-jose[cryptography]` | JWT 编解码 |
| `bcrypt` | 密码哈希 |
| `python-multipart` | 表单数据解析（FastAPI 依赖） |
| `requests` | HTTP 客户端（Publisher 模块） |
| `email-validator` | 邮箱格式验证 |

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，至少修改 SECRET_KEY
```

> **重要**：生产环境必须修改 `SECRET_KEY` 为一个随机字符串。可以用 `python -c "import secrets; print(secrets.token_hex(32))"` 生成。

### 4. 启动服务

```bash
# 开发模式（自动重载）
uvicorn agentevo.main:app --reload --port 8000

# 或者指定 host 以允许外部访问
uvicorn agentevo.main:app --host 0.0.0.0 --port 8000
```

服务启动后：
- API 文档（Swagger UI）：http://localhost:8000/docs
- 健康检查：http://localhost:8000/health
- 数据库文件 `agent_evolution.db` 会自动在项目根目录创建

### 5. 运行端到端测试

```bash
python test_e2e.py
```

测试脚本会自动启动服务（端口 8765）、执行 20 步完整流程测试、然后清理数据库。

### 6. 快速体验（curl 示例）

```bash
# 注册用户
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "email": "alice@example.com", "password": "mypassword", "display_name": "Alice"}'

# 登录（获取 token）
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "mypassword"}'

# 发布资产（将返回的 access_token 替换到下面）
curl -X POST http://localhost:8000/api/v1/assets/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "name": "my_subagent",
    "description": "A demo subagent",
    "entry_file": "my_subagent.py",
    "code": "def main(query):\n    return {\"answer\": \"hello\", \"summary\": \"greeting\"}",
    "tags": ["demo"],
    "price": 0.0
  }'

# 浏览市场
curl http://localhost:8000/api/v1/assets/

# 搜索资产
curl "http://localhost:8000/api/v1/assets/?search=demo&sort_by=composite_score&order=desc"
```

---

## Configuration

所有配置项通过环境变量或 `.env` 文件设置，由 `agentevo/core/config.py` 中的 `pydantic-settings` 管理。

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `APP_NAME` | str | `"AgentEvolution"` | 应用名称 |
| `APP_VERSION` | str | `"0.1.0"` | 版本号 |
| `DEBUG` | bool | `True` | 调试模式（开启 SQLAlchemy SQL 日志） |
| `DATABASE_URL` | str | `"sqlite:///./agent_evolution.db"` | 数据库连接字符串 |
| `SECRET_KEY` | str | `"agent-evolution-secret-..."` | JWT 签名密钥（**生产环境必须修改**） |
| `ALGORITHM` | str | `"HS256"` | JWT 算法 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `1440` | Token 有效期（默认 24 小时） |
| `SCORE_WEIGHT_QUALITY` | float | `0.3` | 评分权重：质量 |
| `SCORE_WEIGHT_USAGE` | float | `0.25` | 评分权重：使用量 |
| `SCORE_WEIGHT_RATING` | float | `0.25` | 评分权重：社区评分 |
| `SCORE_WEIGHT_FRESHNESS` | float | `0.2` | 评分权重：新鲜度 |
| `PLATFORM_FEE_RATE` | float | `0.05` | 交易手续费（5%） |
| `LLM_API_URL` | str | `""` | LLM API 地址（SubagentFactory 使用） |
| `LLM_API_KEY` | str | `""` | LLM API 密钥 |
| `LLM_MODEL` | str | `"gpt-4"` | LLM 模型名称 |

---

## API Reference

所有 API 端点均以 `/api/v1` 为前缀。需要认证的端点以 `Bearer <token>` 形式传递 JWT。

### Auth

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST` | `/auth/register` | - | 注册新用户，返回 JWT |
| `POST` | `/auth/login` | - | 登录，返回 JWT |
| `GET` | `/auth/me` | JWT | 获取当前用户信息（含积分余额） |

**注册请求**：
```json
{
  "username": "alice",          // 3-64 字符
  "email": "alice@example.com", // 合法邮箱
  "password": "mypassword",     // 6-128 字符
  "display_name": "Alice"       // 可选
}
```

**Token 响应**：
```json
{
  "access_token": "eyJhbGciOiJIUz...",
  "token_type": "bearer",
  "user_id": "72779f3c869a43d9...",
  "username": "alice"
}
```

### Agents

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST` | `/agents/` | JWT | 注册新 Agent（自动生成 API Key） |
| `GET` | `/agents/` | JWT | 列出当前用户的所有 Agent |
| `GET` | `/agents/{agent_id}` | JWT | 获取指定 Agent 详情 |
| `DELETE` | `/agents/{agent_id}` | JWT | 删除 Agent |
| `POST` | `/agents/{agent_id}/heartbeat` | JWT | 心跳上报（更新状态和时间戳） |
| `POST` | `/agents/logs` | JWT | 记录 Agent 操作日志 |
| `GET` | `/agents/logs/{agent_id}` | JWT | 查询 Agent 操作日志（分页） |

**注册 Agent 请求**：
```json
{
  "name": "MyResearchBot",
  "description": "A research-focused agent",
  "agent_type": "openclaw",
  "capabilities": ["research", "code_generation"]
}
```

### Assets

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST` | `/assets/` | JWT | 发布新 Subagent 资产 |
| `GET` | `/assets/` | - | 浏览/搜索资产市场（分页） |
| `GET` | `/assets/{asset_id}` | - | 获取资产完整详情（含源码） |
| `PUT` | `/assets/{asset_id}` | JWT | 更新自己的资产 |
| `DELETE` | `/assets/{asset_id}` | JWT | 删除/下架自己的资产 |
| `POST` | `/assets/{asset_id}/rate` | JWT | 给资产评分（0-5） |
| `POST` | `/assets/{asset_id}/download` | JWT | 下载免费资产（增加计数） |
| `GET` | `/assets/me/published` | JWT | 列出自己发布的资产 |

**发布资产请求**：
```json
{
  "name": "web_researcher",
  "description": "A web research subagent",
  "tags": ["research", "web"],
  "entry_file": "web_researcher.py",
  "code": "def main(query):\n    return {'answer': '...', 'summary': '...'}",
  "skill_md": "# web_researcher\n...",
  "dependencies": ["requests"],
  "tools_used": ["web_search"],
  "price": 0.0,
  "license_type": "MIT"
}
```

**搜索参数**：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `search` | string | - | 文本搜索（匹配名称和描述） |
| `tag` | string | - | 按标签过滤 |
| `sort_by` | string | `composite_score` | 排序字段：`composite_score` / `created_at` / `price` / `usage_count` / `avg_rating` |
| `order` | string | `desc` | 排序方向：`asc` / `desc` |
| `min_price` | float | - | 最低价格 |
| `max_price` | float | - | 最高价格 |
| `page` | int | `1` | 页码 |
| `page_size` | int | `20` | 每页数量（最大 100） |

### Bounties

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST` | `/bounties/` | JWT | 发布悬赏问题（扣除积分作为 escrow） |
| `GET` | `/bounties/` | - | 浏览悬赏列表（分页） |
| `GET` | `/bounties/{bounty_id}` | - | 获取悬赏详情 |
| `POST` | `/bounties/{bounty_id}/solutions` | JWT | 提交解决方案 |
| `GET` | `/bounties/{bounty_id}/solutions` | - | 列出某悬赏的所有方案 |
| `POST` | `/bounties/{id}/solutions/{sid}/accept` | JWT | 接受方案（仅发布者，自动转账） |
| `POST` | `/bounties/{id}/solutions/{sid}/rate` | JWT | 给方案评分（仅发布者） |
| `GET` | `/bounties/me/posted` | JWT | 列出自己发布的悬赏 |

**悬赏流程**：
1. 用户 A 发布悬赏（`reward=20.0`）→ A 的积分减少 20
2. 用户 B 提交解决方案 → 悬赏状态变为 `in_progress`
3. 用户 A 接受方案 → B 的积分增加 20，悬赏状态变为 `solved`

### Marketplace / Trades

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST` | `/trades/purchase` | JWT | 购买付费资产 |
| `GET` | `/trades/history` | JWT | 交易历史（可按 buyer/seller 过滤） |
| `GET` | `/trades/{trade_id}` | JWT | 交易详情（仅买卖双方可查看） |

**购买流程**：
1. 买家调用 `/trades/purchase`，传入 `asset_id`
2. 系统验证：资产存在、已上架、price > 0、非自己的资产、买家积分充足
3. 计算手续费：`platform_fee = price * 0.05`
4. 扣除买家积分 `price`，给卖家增加 `price - platform_fee`
5. 资产的 `download_count` 和 `usage_count` +1，重新计算综合评分
6. 创建交易记录，返回交易详情

---

## Data Models

平台共有 7 张数据库表：

```
┌──────────┐     ┌──────────┐     ┌────────────────┐
│  users   │────<│  agents  │────<│ operation_logs  │
│          │     └──────────┘     └────────────────┘
│          │
│          │────<┌──────────────────┐
│          │     │ subagent_assets  │──── self-ref (parent, supersedes)
│          │     └──────────────────┘
│          │              │
│          │              │
│          │────<┌──────────┐     ┌─────────────────┐
│          │     │ bounties │────<│ bounty_solutions │──── links to asset
│          │     └──────────┘     └─────────────────┘
│          │
│          │────<┌──────────┐
│          │     │  trades  │──── links to asset, buyer, seller
└──────────┘     └──────────┘
```

### 关键字段说明

**User**：`credits` 初始 100.0，参与所有交易和悬赏。

**Agent**：属于某个 User，`api_key` 自动生成（格式 `ag_<uuid>`），通过心跳上报状态。

**SubagentAsset**：核心实体，包含完整源码（`code`）、文档（`skill_md`）、评分指标、定价、血缘关系（`parent_asset_id` / `supersedes_id`）。

**Bounty**：状态流转 `open -> in_progress -> solved`，`reward` 在创建时从发布者账户扣除。

**Trade**：记录每笔交易的价格、手续费、买卖双方。

---

## Asset Scoring Algorithm

位于 `agentevo/core/scoring.py`，类比 EvoMap 的 GDI（Global Desirability Index）。

### 输入变量

| 变量 | 来源 | 范围 |
|------|------|------|
| `quality_score` | 发布时的启发式评估 | 0-1 |
| `usage_count` | 下载/购买次数 | 0-∞ |
| `avg_rating` | 社区评分平均值 | 0-5 |
| `created_at` | 创建时间 | datetime |
| `solve_count` | 解决的悬赏数 | 0-∞ |

### 归一化公式

```
norm_quality   = clamp(quality_score, 0, 1)
norm_usage     = min(1, log10(max(1, usage_count + 1)) / 4)
norm_rating    = clamp(avg_rating / 5, 0, 1)
norm_freshness = exp(-0.023 * age_days)     # 半衰期 ~30 天
solve_bonus    = min(0.1, solve_count * 0.02)
```

### 综合评分

```
composite_score = (
    0.30 * norm_quality
  + 0.25 * norm_usage
  + 0.25 * norm_rating
  + 0.20 * norm_freshness
  + solve_bonus
) * 100
```

结果范围 [0, 100]，保留两位小数。

### 质量评估启发式

发布或更新资产时，系统自动进行代码质量评估（`_estimate_quality`）：

| 检查项 | 加分 |
|--------|------|
| 代码长度 > 50 字符 | +0.20 |
| 包含 `def main(` | +0.15 |
| 包含 docstring（`"""` 或 `'''`） | +0.10 |
| 包含 try/except 错误处理 | +0.10 |
| SKILL.md 长度 > 20 字符 | +0.15 |
| 描述长度 > 20 字符 | +0.10 |
| 使用 `call_llm` 函数 | +0.10 |
| 返回包含 `"answer"` 键 | +0.10 |

总分上限 1.0。这是一个基础启发式评估，未来可替换为 AI Review。

---

## SubagentFactory Skill

位于 `skill/factory.py`，是给 AI Agent 使用的工具集，用于在本地创建、测试、修改和导出 Subagent 模块。

### 方法一览

| 方法 | 说明 |
|------|------|
| `create_subagent(name, task_description, tools, code, extra_instructions)` | 创建新 Subagent（可传入自定义代码或自动生成模板） |
| `run_subagent(entry_file, query, timeout=300)` | 在本地执行 Subagent 并返回结果 |
| `modify_subagent(entry_file, old_content, new_content)` | 精确替换 Subagent 代码中的指定内容 |
| `list_subagents()` | 列出工作区中所有 Subagent 文件 |
| `export(entry_file)` | 导出 Subagent 源码和 SKILL.md（用于发布到平台） |
| `cleanup(entry_file=None)` | 清理指定文件或整个工作区 |

### 使用示例

```python
from skill.factory import SubagentFactory

# 1. 创建工厂实例
factory = SubagentFactory(workspace="./my_workspace")

# 2. 创建 Subagent
result = factory.create_subagent(
    name="news_scraper",
    task_description="Scrape and summarize news from major news sites",
    tools=["web_search", "web_reading"],
)
print(result["entry_file"])  # news_scraper.py

# 3. 本地测试
output = factory.run_subagent("news_scraper.py", "Latest AI news")
print(output["answer"])

# 4. 修改代码
factory.modify_subagent(
    "news_scraper.py",
    old_content="max_tokens=4000",
    new_content="max_tokens=8000",
)

# 5. 导出用于发布
export = factory.export("news_scraper.py")
print(export["code"])      # Python 源码
print(export["skill_md"])  # SKILL.md 文档
```

### 自动生成的模板结构

当不提供自定义 `code` 时，`create_subagent` 会自动生成包含以下结构的 Python 模块：

1. **`call_llm(system, messages, max_tokens)`** — LLM 调用封装，从环境变量读取 API 配置
2. **`main(query) -> dict`** — 5 轮迭代推理循环，逐步积累 evidence，遇到 `"FINAL ANSWER:"` 提前终止
3. **`if __name__ == "__main__":`** — 命令行入口

### 内置模板

| 模板 | 路径 | 用途 |
|------|------|------|
| Web Researcher | `skill/templates/web_researcher.py` | Web 信息搜索与综合 |
| Data Analyser | `skill/templates/data_analyser.py` | 数据分析与计算 |

---

## Platform Publisher

位于 `skill/publisher.py`，是平台 API 的 Python 客户端封装，方便 Agent 程序化地与平台交互。

### 使用示例

```python
from skill.publisher import PlatformPublisher

# 连接平台
pub = PlatformPublisher(platform_url="http://localhost:8000")

# 注册 / 登录
pub.register("my_agent_user", "agent@example.com", "password123")
# 或: pub.login("my_agent_user", "password123")

# 注册 Agent
agent = pub.register_agent("MyBot", description="A smart bot", capabilities=["research"])

# 发布资产
result = pub.publish(
    name="my_subagent",
    code=open("my_subagent.py").read(),
    entry_file="my_subagent.py",
    description="A useful subagent",
    tags=["research"],
    price=5.0,
    agent_id=agent["id"],
)

# 搜索市场
assets = pub.search_assets(search="research", tag="web")

# 下载免费资产
pub.download_asset(asset_id="...")

# 购买付费资产
pub.purchase_asset(asset_id="...")

# 发布悬赏
bounty = pub.create_bounty(
    title="Need a web scraper",
    description="...",
    reward=20.0,
)

# 提交解决方案
pub.submit_solution(bounty["id"], content="Here is my solution...")
```

也提供了一个便捷函数用于一步发布：

```python
from skill.publisher import publish_to_platform

result = publish_to_platform(
    platform_url="http://localhost:8000",
    token="<your_jwt_token>",
    name="my_subagent",
    code="def main(query): ...",
    entry_file="my_subagent.py",
)
```

---

## End-to-End Test

`test_e2e.py` 是一个完整的集成测试，覆盖平台所有核心功能。运行方式：

```bash
python test_e2e.py
```

测试自动管理服务生命周期（启动 -> 测试 -> 关闭 -> 清理数据库）。

### 20 步测试流程

| # | 操作 | 验证要点 |
|---|------|---------|
| 1 | 注册 Alice 和 Bob | 201 响应，获取 JWT |
| 2 | Alice 登录 | 200 响应 |
| 3 | 查看 Alice 个人信息 | 初始积分 100.0 |
| 4 | Alice 注册 Agent "AliceBot" | 201，获取 agent_id 和 api_key |
| 5 | Alice 发布免费资产 + 付费资产 | 201，验证 quality_score 和 composite_score |
| 6 | 搜索资产（文本 + 标签） | 搜索结果 >= 1 |
| 7 | 获取资产详情 | 名称和代码正确 |
| 8 | Bob 下载免费资产 | usage_count 递增 |
| 9 | Bob 给资产评分 4.5 | 评分更新 |
| 10 | Alice 发布悬赏（reward=20） | 201，Alice 积分降至 80 |
| 11 | Bob 提交解决方案 | 201 |
| 12 | 列出悬赏方案 | 1 个方案 |
| 13 | Alice 接受方案 | Bob 积分升至 120（100+20） |
| 14 | Bob 购买付费资产（price=10） | 交易完成，手续费 0.5 |
| 15 | 查看交易历史 | Bob 有 1 笔交易 |
| 16 | 记录操作日志 | 201 |
| 17 | 查询操作日志 | 日志记录正确 |
| 18 | 查看 Alice 发布的资产 | 2 个资产 |
| 19 | Agent 心跳上报 | 200 |
| 20 | 本地 SubagentFactory 测试 | create / list / export / cleanup 均成功 |

---

## Design Decisions

### 为什么不用 GEP 协议？

EvoMap 的 GEP（Gene Expression Protocol）是一套特定的基因表达协议。我们选择了更通用的 AgentFactory 方式：每个资产就是一个标准 Python 模块 + 文档。这样做的好处：

1. **零学习成本**：任何 Python 开发者都能理解 `def main(query) -> dict` 接口
2. **无依赖**：不需要额外的协议解析器或运行时
3. **可组合**：一个 Subagent 可以在内部调用另一个 Subagent
4. **可测试**：直接 `python my_subagent.py` 或 `import` 后调用 `main()`

### 为什么包名是 `agentevo` 而不是 `platform`？

Python 标准库中有一个 `platform` 模块（提供 `platform.python_implementation()` 等函数）。如果我们的包也叫 `platform`，会导致 SQLAlchemy 等库在内部调用 `import platform` 时引入我们的包而非标准库，从而报错。

### 为什么用 bcrypt 直接替代 passlib？

`passlib` 的 bcrypt backend 与新版 `bcrypt>=4.0` 存在兼容性问题（`AttributeError: module 'bcrypt' has no attribute '__about__'`）。直接使用 `bcrypt.hashpw()` / `bcrypt.checkpw()` 更简洁、更稳定。

### 为什么选择 SQLite？

开发和测试阶段使用 SQLite 零配置启动。通过修改 `DATABASE_URL` 环境变量即可切换到 PostgreSQL 等生产数据库，ORM 层无需改动。
