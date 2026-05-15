# 【灵办】智能行政服务中心 — 技术方案文档（Technical Design）v3.0

> 配套 PRD：`docs/prd.md`。本版相对 v2.0 重新设计了 `backend/` 与 `data/` 目录、统一了 LLM/向量库选型、明确了 Docker 五服务编排，并将后端栈对齐到 **FastAPI + Pydantic v2 + SQLModel + asyncpg + Redis**，AI 推理与 OCR 统一通过 **火山方舟（Volcengine Ark）**。

---

## 1. 技术栈选型（Tech Stack）

### 1.1 前端
| 类别 | 选型 |
| :--- | :--- |
| 框架 | **Next.js 16 (App Router)** + **React 19** |
| 语言 | TypeScript 5.7 |
| UI 组件 | shadcn/ui（Radix UI）+ Tailwind CSS 4 |
| 图表 | Recharts |
| 表单 | react-hook-form + zod |
| 包管理 | pnpm |

> 现有页面（`frontend/app/(smart-office)/`）四大模块已完成静态版：`policy / document / event / visitor`，本设计的接口契约即对齐这些页面的真实交互。

### 1.2 后端
| 类别 | 选型 | 备注 |
| :--- | :--- | :--- |
| Web 框架 | **FastAPI** (Python 3.12+) | 异步、内置 OpenAPI |
| 数据校验 | **Pydantic v2** | Schema / Settings |
| ORM | **SQLModel** | 基于 SQLAlchemy 2.0 异步语法 |
| 数据库驱动 | **asyncpg** | PostgreSQL 异步驱动 |
| 缓存 / 会话 / 限流 | **Redis 7** + `redis.asyncio` | |
| 数据库迁移 | **Alembic** | 配合 SQLModel |
| 包/虚拟环境 | **uv**（推荐）或 venv + pip | 产物为 `backend/.venv` |
| LLM 编排 | **LangChain 0.3** + **LangGraph 0.2** | 多步推理 / 反思循环 |
| 向量库 | **pgvector**（默认）/ ChromaDB（本地降级） | pgvector 与 Postgres 同库共管 |
| 文档解析 | `pypdf` / `python-docx` / `Unstructured`（含表格场景） | |
| 联网搜索 | **Tavily Search API** | LangChain Tool |
| LLM / Embedding | **火山方舟 Doubao 系列**（OpenAI 兼容） | 通过 `langchain-openai` + 自定义 base_url |
| OCR / 视觉 | **火山方舟视觉理解模型**（多模态） | 名片 / 身份证字段抽取 |
| 钉钉推送 | DingTalk Robot Webhook | 访客到访通知 |
| PDF 导出 | `weasyprint` | 公文 / 团建方案 |
| 任务队列 | FastAPI BackgroundTasks（轻量） / 可升级 ARQ | 知识库入库异步化 |

### 1.3 部署
| 类别 | 选型 |
| :--- | :--- |
| 反向代理 | **Nginx**（统一 80/443，路由 `/api → backend`、`/ → frontend`） |
| 容器编排 | **Docker Compose**：`postgres` + `redis` + `backend` + `frontend` + `nginx` |
| 数据库镜像 | `pgvector/pgvector:pg16`（已内置 pgvector 扩展） |
| 缓存镜像 | `redis:7-alpine` |
| 静态资源 | Next.js standalone 输出 |

---

## 2. 系统架构（Architecture）

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Browser / Mobile                           │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS
                  ┌────────────▼────────────┐
                  │        Nginx :80        │  反向代理 / 静态资源 / SSE 透传
                  └─────┬──────────────┬────┘
              /api/*    │              │  / (静态)
                  ┌─────▼────────┐  ┌──▼──────────────┐
                  │  FastAPI     │  │ Next.js (SSR)   │
                  │  backend     │  │ frontend        │
                  └──┬──────┬────┘  └─────────────────┘
                     │      │
        ┌────────────▼─┐  ┌─▼────────────┐
        │ PostgreSQL   │  │  Redis 7     │
        │ + pgvector   │  │  cache/queue │
        └──────────────┘  └──────────────┘
                     │
        ┌────────────▼──────────────────────────────┐
        │   外部服务（出站）                          │
        │  - 火山方舟 (LLM / Embedding / Vision OCR) │
        │  - Tavily Search API                       │
        │  - 钉钉 Webhook                             │
        └────────────────────────────────────────────┘
```

LangGraph / LangChain 在 `backend.app.ai` 内统一构建，被 `app.services` 业务服务以**异步流式（SSE）**或一次性调用的方式消费。

---

## 3. 目录结构规划（File Structure）

> 这是相对 v2.0 改动最大的部分。`backend/` 采用「**核心层（core/db/cache）→ 模型层（models/schemas）→ 数据访问层（repositories）→ AI 层（ai）→ 业务服务层（services）→ 接口层（api）**」的分层结构；`data/` 仅作为**运行时数据卷**的挂载点，不再混入业务源码。

### 3.1 仓库根（monorepo 根）
```text
smart-admin/
├── backend/                      # 后端服务（FastAPI）
├── frontend/                     # 前端（Next.js，已完成静态页）
├── data/                         # 运行时数据卷（被 docker volumes 挂载）
├── deploy/                       # 部署相关配置
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   └── nginx/
│       └── nginx.conf
├── docs/
│   ├── prd.md
│   └── technical-design.md
├── .env.example                  # 环境变量样例（含火山 / Tavily / DB 占位）
├── .gitignore
└── README.md
```

### 3.2 `backend/` 详细结构

```text
backend/
├── .venv/                        # Python 虚拟环境（gitignore）
├── .env                          # 真实环境变量（gitignore）
├── .env.example                  # 占位样例
├── pyproject.toml                # 依赖清单（uv / pip 统一）
├── uv.lock
├── Dockerfile
├── alembic.ini
├── README.md
├── alembic/                      # 数据库迁移脚本
│   ├── env.py
│   └── versions/
├── scripts/                      # 一次性运维脚本
│   ├── ingest_knowledge.py       # 批量入库知识库
│   └── seed.py                   # 种子数据
├── tests/
│   ├── conftest.py
│   ├── test_policy.py
│   ├── test_document.py
│   ├── test_event.py
│   └── test_visitor.py
└── app/
    ├── __init__.py
    ├── main.py                   # FastAPI 入口（lifespan、CORS、router 挂载）
    │
    ├── core/                     # 横切能力（无业务）
    │   ├── config.py             # pydantic-settings：读取 .env
    │   ├── logging.py            # structlog 配置
    │   ├── lifespan.py           # 启动/关闭：初始化 DB / Redis 池
    │   ├── exceptions.py         # 业务异常 + 全局 handler
    │   ├── security.py           # JWT / 密码哈希（如需登录）
    │   └── sse.py                # SSE event 序列化辅助
    │
    ├── db/                       # 数据库设施
    │   ├── session.py            # AsyncEngine / async_sessionmaker
    │   └── base.py               # SQLModel 元数据基类
    │
    ├── cache/                    # 缓存设施
    │   └── redis.py              # redis.asyncio 连接池 + 通用 key 命名
    │
    ├── models/                   # 数据库表（SQLModel, table=True）
    │   ├── __init__.py
    │   ├── visitor.py            # VisitorRecord / Employee
    │   ├── policy.py             # KnowledgeFile / PolicyChunk(含 embedding)
    │   ├── document.py           # DocumentDraft / DocumentTemplate
    │   ├── event.py              # EventPlan / EventRun(LangGraph 运行记录)
    │   └── conversation.py       # ChatSession / ChatMessage
    │
    ├── schemas/                  # 接口 IO 模型（Pydantic, table=False）
    │   ├── visitor.py
    │   ├── policy.py
    │   ├── document.py
    │   ├── event.py
    │   └── common.py             # 分页、错误、SSE 事件
    │
    ├── repositories/             # 数据访问层（薄封装，纯 SQL）
    │   ├── base.py               # 通用 CRUD
    │   ├── visitor_repo.py
    │   ├── policy_repo.py
    │   ├── document_repo.py
    │   └── event_repo.py
    │
    ├── ai/                       # AI 编排核心（LangChain / LangGraph）
    │   ├── llm.py                # 火山方舟 ChatOpenAI 工厂
    │   ├── embeddings.py         # 火山 Embedding 工厂
    │   ├── vector_store.py       # PGVector / Chroma 抽象
    │   ├── prompts/
    │   │   ├── policy_qa.py
    │   │   ├── doc_writer.py
    │   │   ├── doc_auditor.py
    │   │   └── event_planner.py
    │   ├── chains/
    │   │   ├── rag_chain.py      # Self-Query / Multi-Query 检索链
    │   │   └── citation.py       # 来源溯源整理
    │   ├── graphs/               # LangGraph 状态机
    │   │   ├── state.py          # 各 graph 的 TypedDict 状态
    │   │   ├── policy_rag.py     # 检索→自评→重写→生成
    │   │   ├── doc_reflective.py # 写作 Node A ↔ 审计 Node B 闭环
    │   │   └── event_planner.py  # 搜索→评估→重搜（条件边）→生成
    │   ├── tools/                # Agent 工具
    │   │   ├── tavily_search.py
    │   │   ├── volc_ocr.py       # 火山视觉 OCR（名片/身份证）
    │   │   └── dingtalk.py       # 钉钉到访推送
    │   └── loaders/
    │       └── pdf_loader.py     # 表格场景走 Unstructured(hi_res)
    │
    ├── services/                 # 业务服务（编排 ai + repositories）
    │   ├── policy_service.py
    │   ├── document_service.py
    │   ├── event_service.py
    │   └── visitor_service.py
    │
    └── api/                      # 接口层
        ├── deps.py               # 依赖注入：Session / Redis / 当前用户
        └── v1/
            ├── router.py         # 汇总各模块 router
            ├── policy.py         # /api/v1/policy/*
            ├── document.py       # /api/v1/document/*
            ├── event.py          # /api/v1/event/*
            ├── visitor.py        # /api/v1/visitor/*
            └── health.py         # /api/v1/health
```

> **分层原则：** `api → services → (repositories | ai)`；`ai` 与 `repositories` 之间不互相依赖，统一由 `services` 编排。`models` 仅描述数据形态，不承载业务逻辑。

### 3.3 `data/` 详细结构（运行时数据卷）

```text
data/
├── knowledge_base/               # 上传的原始制度文档（PDF/Word，被 ingest 脚本消费）
│   └── .gitkeep
├── uploads/                      # 临时上传（OCR 等），处理完即清理
├── exports/                      # 公文 PDF / 团建方案 PDF 输出
├── logs/                         # 应用日志（按天滚动）
├── postgres/                     # 由 docker volume 管理（gitignore）
└── redis/                        # 由 docker volume 管理（gitignore）
```

> **要点：**
> 1. v2.0 中的 `data/vector_store/` 已**移除** —— 向量数据直接落入 PostgreSQL 的 `pgvector` 表（与业务数据同库同事务）；如需降级到 Chroma，由 `app/ai/vector_store.py` 抽象层切换，本地路径为 `data/vector_store/`（默认关闭）。
> 2. `data/` 仅保留 `.gitkeep`，所有真实数据均**不入仓库**（见 `.gitignore`）。
> 3. `postgres/` 与 `redis/` 子目录由 `docker-compose.yml` 的 `volumes` 段挂载；生产环境建议改用命名卷或外部存储。

---

## 4. 业务模块设计（对齐前端四大页面）

### 4.1 制度万事通（Agentic RAG，对应 `/policy`）

**LangGraph 状态机：`policy_rag.py`**

```
        ┌───────────────┐
入口 ──▶│  rewrite_node │  改写问题（Multi-Query 扩展，提取元数据）
        └──────┬────────┘
               ▼
        ┌───────────────┐
        │ retrieve_node │  pgvector 相似度检索（Top-K=8）+ 元数据过滤
        └──────┬────────┘
               ▼
        ┌───────────────┐    ┌─ 命中度低 ──▶ rewrite_node（最多 retry=2）
        │ evaluate_node │ ───┤
        └──────┬────────┘    └─ 命中度高 ──▶ answer_node
               ▼
        ┌───────────────┐
        │  answer_node  │  流式生成回答 + citations（chunk_id / file_name / page）
        └───────────────┘
```

**关键设计：**
- **多文档路由：** `KnowledgeFile.category`（人事 / 财务 / 行政）作为 metadata，`evaluate_node` 可基于问题语义在 metadata 上做过滤。
- **检索回审：** `evaluate_node` 用一次轻量 LLM 调用判断 chunk 集合的 `relevance_score`，<0.6 触发改写重检。
- **溯源显示：** `answer_node` 在生成的 markdown 中插入 `[1] [2]` 引用标记，与返回的 `citations` 数组一一对应（前端 `policy/page.tsx` 已实现该交互）。
- **权限：** `KnowledgeFile.access_level` 字段（`public` / `manager`），检索前在 SQL 层过滤。
- **流式：** 通过 SSE 输出 `event: token / event: citation / event: done`。

### 4.2 公文 Copilot（Reflective Writer，对应 `/document`）

**LangGraph 状态机：`doc_reflective.py`**

```
                ┌───────────────┐
   topic+kw ──▶│  writer_node  │ 根据 template + tone 生成草稿
                └──────┬────────┘
                       ▼
                ┌───────────────┐    ┌─ pass=false ──▶ writer_node（带审计意见重写，retry≤2）
                │ auditor_node  │ ───┤
                └──────┬────────┘    └─ pass=true ───▶ END
                       │
                       └─▶ 输出 audit_feedback[]（success/info/warning，前端已对应渲染）
```

**关键设计：**
- **写审分离：** `writer_node` 与 `auditor_node` 使用不同 system prompt，避免「自己审自己」失效。
- **审计维度：** 格式规范 / 语气一致性 / 敏感词 / 合规性（公司制度引用），返回结构化 `AuditItem[]`。
- **AI 优化按钮：** `optimize` 接口复用 `writer_node`，输入为「原文 + 审计意见摘要」，单轮非 graph。
- **PDF 导出：** `weasyprint` 将 Markdown 转 HTML 再转 PDF，落到 `data/exports/`。

### 4.3 团建策划智能体（LangGraph Planner，对应 `/event`）

**LangGraph 状态机：`event_planner.py`**

```
       ┌─────────────────┐
入口──▶│  search_node    │ Tavily 搜索：城市 + 活动类型 + "餐厅 / 场地"
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │  enrich_node    │ 解析评分 / 距离 / 预估人均，过滤已倒闭/低评分
       └────────┬────────┘
                ▼
       ┌─────────────────┐    ┌─ over_budget=true & retry<3 ──▶ search_node（带反馈）
       │  validate_node  │ ───┤
       └────────┬────────┘    └─ ok ──▶ generate_node
                ▼
       ┌─────────────────┐
       │  generate_node  │ 生成方案 A（推荐）+ 方案 B（备选）：日程 / 地点 / 预算明细
       └─────────────────┘
```

**关键设计：**
- **节点事件流：** 通过 SSE `event: node` 推送当前节点状态（`pending / loading / success / retry`），前端 `event/page.tsx` 已实现节点状态可视化。
- **预算校验：** 生成后校验 A/B 方案预算，要求总价位于 `participants × per_capita_budget` 的 70%~100% 区间，不通过则带反馈重试。
- **方案双选：** `generate_node` 输出 2 个互斥方案（如 A=户外、B=室内），命中前端 Tabs。
- **运行记录：** 每次生成保存到 `EventRun`（含完整状态 JSON），用于失败回放和 Prompt 调优。

### 4.4 智能访客收发室（对应 `/visitor`）

**业务流程：**
```
扫名片/身份证 ──▶ 火山视觉 OCR ──▶ 字段抽取（姓名/单位/手机）
                                           │
                                           ▼
            填写"被访人" ──▶ Redis 模糊匹配 Employee（拼音 + 缩写 + 部门）
                                           │
                                           ▼
                              落库 VisitorRecord(status=registered)
                                           │
                                           ▼
                          钉钉机器人推送到访卡片（异步 BackgroundTask）
                                           │
                                           ▼
                   前台核验 ──▶ check-in（status=entered）── ... ──▶ check-out
```

**关键设计：**
- **Employee 模糊匹配：** 启动时把员工通讯录加载到 Redis（`emp:idx`），用 `RediSearch` 或简单 `set` + 拼音库（`pypinyin`）实现 O(1) 模糊查找；`/visitor/search-host?q=` 走该路径。
- **隐私合规：** OCR 处理完后**立即**删除 `data/uploads/` 下的临时图片；身份证号字段**永不**入库（仅暂存于 OCR 函数局部变量）。
- **统计与图表：** `/visitor/stats` 与 `/visitor/weekly-trend` 用 SQL 直接聚合，结果在 Redis 缓存 60s。

---

## 5. AI 集成（火山方舟 Volcengine Ark）

### 5.1 LLM / Embedding 调用

火山方舟提供 **OpenAI 兼容**的 Chat Completions 接口，因此可直接用 `langchain-openai` 配合自定义 `base_url`：

```python
# app/ai/llm.py
from langchain_openai import ChatOpenAI
from app.core.config import settings

def get_chat_llm(model: str | None = None, temperature: float = 0.3) -> ChatOpenAI:
    return ChatOpenAI(
        model=model or settings.ARK_CHAT_MODEL,        # e.g. "doubao-1.5-pro-32k"
        api_key=settings.ARK_API_KEY,
        base_url=settings.ARK_BASE_URL,                 # https://ark.cn-beijing.volces.com/api/v3
        temperature=temperature,
        streaming=True,
    )
```

```python
# app/ai/embeddings.py
from langchain_openai import OpenAIEmbeddings

def get_embeddings():
    return OpenAIEmbeddings(
        model=settings.ARK_EMBEDDING_MODEL,             # e.g. "doubao-embedding-vision-251215"
        api_key=settings.ARK_API_KEY,
        base_url=settings.ARK_BASE_URL,
        dimensions=settings.ARK_EMBEDDING_DIM,          # 默认 2048，pgvector 表 dim 需对齐
    )
```

> **模型选型建议：**
> - Chat：`doubao-1.5-pro-32k` 或 `doubao-1.5-pro-256k`（长文档场景）
> - Embedding：`doubao-embedding-vision-251215`（dim=2048）
> - 视觉：`doubao-1.5-vision-pro-32k`（OCR 多模态推理）
>
> 具体模型代号以你在火山控制台开通的为准。

### 5.2 视觉 OCR

火山方舟视觉模型支持以 `image_url`（base64 或公网 URL）作为多模态输入，直接调用 Chat Completions：

```python
# app/ai/tools/volc_ocr.py（伪代码）
async def extract_business_card(image_b64: str) -> BusinessCardOCR:
    llm = get_chat_llm(model=settings.ARK_VISION_MODEL, temperature=0)
    resp = await llm.ainvoke([
        {"role": "system", "content": OCR_PROMPT_BUSINESS_CARD},  # 要求严格 JSON 输出
        {"role": "user", "content": [
            {"type": "text", "text": "提取名片字段"},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
        ]},
    ])
    return BusinessCardOCR.model_validate_json(resp.content)
```

返回结构（与前端表单一一对应）：
```json
{ "name": "...", "company": "...", "phone": "...", "title": "..." }
```

### 5.3 向量库（pgvector）

```sql
-- alembic 迁移片段
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE policy_chunk (
    id            UUID PRIMARY KEY,
    file_id       UUID REFERENCES knowledge_file(id) ON DELETE CASCADE,
    chunk_index   INT NOT NULL,
    content       TEXT NOT NULL,
    metadata      JSONB DEFAULT '{}'::jsonb,
    embedding     VECTOR(2048),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 注：embedding 维度 2048 超过 pgvector ivfflat/hnsw 的 2000 维上限，
-- MVP 阶段不建 ANN 索引（用顺序扫描）；后续若需 ANN 可切换到 halfvec(2048) + HNSW。
CREATE INDEX idx_policy_chunk_file_id ON policy_chunk(file_id);
CREATE INDEX idx_policy_chunk_metadata_gin ON policy_chunk USING GIN(metadata);
```

LangChain 侧使用 `langchain_postgres.PGVector` 作为 VectorStore 实现；如果切换 Chroma，仅需修改 `app/ai/vector_store.py` 的工厂函数。

---

## 6. 数据库设计（SQLModel Schema）

> 所有表均带 `id (UUID, pk)`、`created_at`、`updated_at`；下文略写。

### 6.1 知识库（policy）

```python
class KnowledgeFile(SQLModel, table=True):
    id: UUID
    name: str                          # 显示名 "员工手册 v3.2.pdf"
    category: str                      # "人事" | "财务" | "行政"
    access_level: str = "public"       # "public" | "manager"
    file_path: str                     # data/knowledge_base/<file>
    size_bytes: int
    page_count: int | None
    status: str = "pending"            # pending | indexing | ready | failed
    chunk_count: int = 0

class PolicyChunk(SQLModel, table=True):
    id: UUID
    file_id: UUID = Field(foreign_key="knowledgefile.id")
    chunk_index: int
    content: str
    page: int | None
    metadata: dict = Field(sa_column=Column(JSONB))
    embedding: list[float] = Field(sa_column=Column(Vector(2048)))
```

### 6.2 公文（document）

```python
class DocumentTemplate(SQLModel, table=True):
    id: UUID
    type: str                          # notice | request | reward | meeting
    name: str                          # "通用通知模板"
    description: str
    body: str                          # Markdown 模板
    is_system: bool = True             # 系统内置 / 用户保存

class DocumentDraft(SQLModel, table=True):
    id: UUID
    user_id: UUID | None
    template_id: UUID | None
    type: str
    topic: str
    keywords: list[str] = Field(sa_column=Column(JSONB))
    tone: str                          # formal | friendly | strict
    content: str                       # 当前 Markdown
    audit_feedback: list[dict] = Field(sa_column=Column(JSONB))
    retry_count: int = 0
```

### 6.3 团建（event）

```python
class EventPlan(SQLModel, table=True):
    id: UUID
    user_id: UUID | None
    participants: int
    per_capita_budget: int
    city: str
    activity_types: list[str] = Field(sa_column=Column(JSONB))
    plan_a: dict = Field(sa_column=Column(JSONB))   # schedule + venues + budget
    plan_b: dict = Field(sa_column=Column(JSONB))

class EventRun(SQLModel, table=True):
    id: UUID
    plan_id: UUID
    final_state: dict = Field(sa_column=Column(JSONB))   # LangGraph 末态
    total_retries: int
    duration_ms: int
    success: bool
```

### 6.4 访客（visitor）

```python
class Employee(SQLModel, table=True):
    id: UUID
    name: str                          # "李明"
    name_pinyin: str                   # "liming"
    nickname: str | None               # "李工"
    department: str
    title: str | None
    phone: str | None
    dingtalk_user_id: str | None       # 用于钉钉点对点推送
    is_active: bool = True

class VisitorRecord(SQLModel, table=True):
    id: UUID
    name: str
    company: str
    phone: str                         # 加密存储（AES-GCM）
    purpose: str | None
    host_employee_id: UUID = Field(foreign_key="employee.id")
    host_match_score: float            # 模糊匹配置信度
    status: str                        # registered | entered | left
    check_in_at: datetime | None
    check_out_at: datetime | None
    push_status: str = "pending"       # pending | success | failed
    source: str = "mobile"             # mobile | desk
```

### 6.5 会话（conversation，可选）

```python
class ChatSession(SQLModel, table=True):
    id: UUID
    user_id: UUID | None
    module: str                        # policy | document | event
    title: str

class ChatMessage(SQLModel, table=True):
    id: UUID
    session_id: UUID = Field(foreign_key="chatsession.id")
    role: str                          # user | assistant | system
    content: str
    citations: list[dict] = Field(sa_column=Column(JSONB))
```

### 6.6 索引建议

| 表 | 索引 |
| :--- | :--- |
| `policy_chunk` | `(file_id)`, `metadata GIN`（2048 维超 pgvector ANN 上限，MVP 不建 ANN 索引）|
| `visitor_record` | `(status, created_at DESC)`, `(host_employee_id, created_at DESC)` |
| `employee` | `(name_pinyin text_pattern_ops)`, `(department)` |
| `chat_message` | `(session_id, created_at)` |

---

## 7. API 接口契约（v1）

> 所有接口前缀 `/api/v1`；流式接口返回 `text/event-stream`；其余返回 `application/json`。错误格式遵循 [RFC 7807 Problem Details]。

### 7.1 制度万事通 `/policy`

| Method | Path | 说明 | 流式 |
| :--- | :--- | :--- | :--- |
| POST | `/policy/chat` | 提问，返回回答 + citations | ✅ SSE |
| GET  | `/policy/categories` | 知识库分类与文件列表（左侧栏） | |
| GET  | `/policy/quick-questions` | 常用问题列表（按类目） | |
| POST | `/policy/files` | 上传 PDF/Word（multipart） | |
| GET  | `/policy/files/{id}` | 文件详情 | |
| DELETE | `/policy/files/{id}` | 删除文件（级联删除 chunk） | |

**请求 `POST /policy/chat`：**
```json
{ "session_id": "uuid|null", "question": "年假有多少天？", "category": "人事|null" }
```

**SSE 事件流：**
```
event: meta       data: { "session_id": "...", "graph_run_id": "..." }
event: stage      data: { "node": "rewrite|retrieve|evaluate|answer", "status": "loading|success|retry" }
event: token      data: { "delta": "根据《员工手册" }
event: citation   data: { "id": 1, "source": "员工手册 v3.2.pdf - 第四章", "text": "...", "file_id": "...", "page": 12 }
event: done       data: { "elapsed_ms": 2410 }
```

### 7.2 公文 Copilot `/document`

| Method | Path | 说明 | 流式 |
| :--- | :--- | :--- | :--- |
| GET  | `/document/templates?type=notice` | 模板列表 | |
| POST | `/document/draft` | 生成草稿（含审计循环） | ✅ SSE |
| POST | `/document/optimize` | 单段优化（基于审计意见） | ✅ SSE |
| POST | `/document/audit` | 仅对外部传入的草稿做审计 | |
| POST | `/document/{id}/export-pdf` | 导出 PDF，返回下载 URL | |
| POST | `/document/{id}/save-template` | 当前草稿另存为用户模板 | |

**请求 `POST /document/draft`：**
```json
{
  "type": "notice",
  "template_id": "uuid|null",
  "topic": "关于办公区禁烟的通知",
  "keywords": ["健康", "公共场所"],
  "tone": "formal"
}
```

**SSE 事件流：**
```
event: stage      data: { "node": "writer|auditor", "round": 1 }
event: token      data: { "delta": "..." }
event: audit      data: { "items": [{"type": "success|info|warning", "title": "...", "description": "..."}] }
event: done       data: { "draft_id": "uuid", "passed": true, "rounds": 2 }
```

### 7.3 团建策划 `/event`

| Method | Path | 说明 | 流式 |
| :--- | :--- | :--- | :--- |
| GET  | `/event/cities` | 可选城市枚举 | |
| GET  | `/event/activity-types` | 活动类型枚举 | |
| POST | `/event/plan` | 触发 LangGraph 生成方案 A/B | ✅ SSE |
| GET  | `/event/plans/{id}` | 获取已生成方案 | |
| POST | `/event/plans/{id}/export-pdf` | 导出方案 PDF | |

**请求 `POST /event/plan`：**
```json
{
  "participants": 30,
  "per_capita_budget": 200,
  "city": "北京",
  "activity_types": ["bbq", "outdoor"]
}
```

**SSE 事件流（与前端 `AgentNode` 状态严格对齐）：**
```
event: node       data: { "id": 1, "title": "联网搜索周边地点", "status": "loading", "message": "正在搜索..." }
event: node       data: { "id": 1, "status": "success", "message": "已找到 12 个符合条件的场地" }
event: node       data: { "id": 2, "status": "retry", "message": "初选方案超标，正在重新规划..." }
event: plan       data: { "plan_a": {...}, "plan_b": {...}, "plan_id": "uuid" }
event: done       data: { "elapsed_ms": 6800, "retries": 1 }
```

### 7.4 访客管理 `/visitor`

| Method | Path | 说明 |
| :--- | :--- | :--- |
| POST | `/visitor/ocr-card` | 名片/身份证 OCR（multipart 或 base64） |
| GET  | `/visitor/search-host?q=` | 员工模糊匹配（Redis） |
| POST | `/visitor/register` | 提交登记（手机端） |
| GET  | `/visitor/list?status=&search=&page=` | 后台列表（分页） |
| GET  | `/visitor/stats` | 今日 / 本周统计卡片 |
| GET  | `/visitor/weekly-trend` | 本周趋势（柱图数据） |
| POST | `/visitor/{id}/check-in` | 前台核验入场 |
| POST | `/visitor/{id}/check-out` | 离场 |
| POST | `/visitor/{id}/notify` | 重新推送钉钉到访卡片 |

**OCR 响应：**
```json
{ "name": "张明", "company": "华为技术有限公司", "phone": "138xxxx1234", "title": "产品经理", "confidence": 0.93 }
```

**Host 匹配响应：**
```json
{
  "matches": [
    { "id": "uuid", "name": "李明", "department": "技术部", "title": "经理", "score": 0.92 }
  ]
}
```

### 7.5 通用

| Method | Path | 说明 |
| :--- | :--- | :--- |
| GET | `/health` | 存活检查（含 db / redis ping） |
| GET | `/config/public` | 前端可见的运行时配置（feature flag 等） |

---

## 8. Redis 使用规约

| Key 模式 | 类型 | TTL | 用途 |
| :--- | :--- | :--- | :--- |
| `emp:idx:pinyin:{prefix}` | SET | ∞ (启动重建) | 员工拼音前缀倒排，用于 host 模糊匹配 |
| `emp:profile:{id}` | HASH | ∞ | 员工属性快照 |
| `visitor:stats:today` | STRING(JSON) | 60s | 今日访客统计缓存 |
| `visitor:trend:weekly` | STRING(JSON) | 300s | 本周趋势缓存 |
| `chat:session:{id}:msgs` | LIST | 1h | 对话上下文滑动窗口 |
| `rl:{ip}:{route}` | STRING | 60s | 接口级限流计数 |
| `lock:ingest:{file_id}` | STRING(NX) | 600s | 文档入库幂等锁 |
| `cache:llm:{sha256}` | STRING | 1h | 同问题/同 prompt 的 LLM 响应缓存（可选） |

---

## 9. Docker 部署（五服务编排）

### 9.1 `deploy/docker-compose.yml`（节选）

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ../data/postgres:/var/lib/postgresql/data
    ports: ["5432:5432"]   # 仅 dev，prod 请去掉
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - ../data/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file: ../.env
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379/0
    volumes:
      - ../data/knowledge_base:/app/data/knowledge_base
      - ../data/uploads:/app/data/uploads
      - ../data/exports:/app/data/exports
      - ../data/logs:/app/data/logs
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    expose: ["8000"]

  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_BASE: /api/v1
    expose: ["3000"]

  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on: [backend, frontend]
```

### 9.2 `deploy/nginx/nginx.conf`（关键片段）

```nginx
server {
  listen 80;
  server_name _;
  client_max_body_size 50m;        # 支持文档上传

  # SSE 关键参数
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 3600s;

  location /api/ {
    proxy_pass http://backend:8000/api/;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location / {
    proxy_pass http://frontend:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

### 9.3 `backend/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
    UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates libpq5 \
    && rm -rf /var/lib/apt/lists/*

# 静态二进制方式引入 uv
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /usr/local/bin/

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY app ./app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 9.4 `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

> 需要在 `frontend/next.config.mjs` 中开启 `output: 'standalone'`。

---

## 10. 环境变量（`.env.example`）

```dotenv
# ===== App =====
APP_ENV=dev                          # dev | staging | prod
APP_DEBUG=true
APP_SECRET_KEY=change-me-32-bytes-base64

# ===== PostgreSQL =====
POSTGRES_DB=smartadmin
POSTGRES_USER=smartadmin
POSTGRES_PASSWORD=change-me
DATABASE_URL=postgresql+asyncpg://smartadmin:change-me@postgres:5432/smartadmin

# ===== Redis =====
REDIS_URL=redis://redis:6379/0

# ===== 火山方舟（Volcengine Ark）=====
ARK_API_KEY=replace-with-real-key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_CHAT_MODEL=doubao-1.5-pro-32k
ARK_VISION_MODEL=doubao-seed-1-6-flash-250828
ARK_EMBEDDING_MODEL=doubao-embedding-vision-251215
ARK_EMBEDDING_DIM=2048

# ===== Tavily =====
TAVILY_API_KEY=replace-with-real-key

# ===== 钉钉 =====
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=...
DINGTALK_SECRET=

# ===== CORS / Frontend =====
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

> ⚠️ `.env` **绝不入仓库**（已在根 `.gitignore` 中排除）。火山 API key 仅在本地 `.env` 与生产 secret store 中存在。

---

## 11. 开发与运维流程

### 11.1 本地启动（开发模式）

```bash
# 1) 启动依赖服务
docker compose -f deploy/docker-compose.yml up -d postgres redis

# 2) 后端
cd backend
uv sync                                  # 创建 .venv + 安装依赖
uv run alembic upgrade head              # 应用迁移
uv run python scripts/seed.py            # 可选：种子数据
uv run uvicorn app.main:app --reload     # http://localhost:8000

# 3) 前端
cd ../frontend
pnpm install
pnpm dev                                 # http://localhost:3000

# 4) 知识库批量入库
cd ../backend
uv run python scripts/ingest_knowledge.py --dir ../data/knowledge_base
```

### 11.2 一键部署（生产模式）

```bash
cp .env.example .env                     # 修改密钥
docker compose -f deploy/docker-compose.yml up -d --build
docker compose exec backend alembic upgrade head
```

### 11.3 测试

| 类型 | 工具 | 路径 |
| :--- | :--- | :--- |
| 后端单测 | `pytest` + `pytest-asyncio` | `backend/tests/` |
| 后端集成 | `httpx.AsyncClient` + `testcontainers-postgres` | 同上 |
| 前端 | （未引入）建议 Vitest + Playwright | `frontend/__tests__/` |

```bash
cd backend && uv run pytest -q
```

### 11.4 监控与日志

- 应用日志：`structlog` JSON → `data/logs/app.log`（轮转）；生产可对接 Loki。
- LangGraph 运行轨迹：保存至 `EventRun.final_state`，便于回放。
- 健康检查：`/api/v1/health` 检查 DB / Redis / 火山方舟连通性（带 5s 超时）。

---

## 12. 安全与合规

| 维度 | 措施 |
| :--- | :--- |
| 密钥管理 | 仅通过 `.env` / 容器 secret 注入；代码与文档严禁硬编码 |
| 访客隐私 | 身份证号**不入库**；OCR 临时图片处理后立即删除；手机号 AES-GCM 加密落库；前端列表脱敏（138****1234） |
| 制度权限 | `KnowledgeFile.access_level` + 用户角色，在检索前做 SQL 级过滤 |
| 上传校验 | 类型白名单（pdf/docx/png/jpg）+ 大小 ≤ 50MB + 文件头探测 |
| 联网搜索 | Tavily 结果做白名单 / 评分过滤；Prompt 限定地理范围 |
| 限流 | Nginx + Redis token bucket，敏感接口 60 req/min/IP |
| 审计日志 | 所有写操作记录 `actor / action / target / time`（落 `audit_log` 表，可选） |
| LLM 注入防护 | system prompt 与用户输入分离；输出严格 JSON schema 校验；citations 强制溯源 |

---

## 13. 路线图（Roadmap）

| 阶段 | 内容 |
| :--- | :--- |
| **M1（脚手架）** | 后端骨架：core / db / cache / models / migrations / health；接通 Postgres + Redis + 火山方舟最小调用 |
| **M2（制度万事通）** | 知识库 ingest 脚本 + RAG 链 + `/policy/chat` SSE；前端联调 |
| **M3（公文 Copilot）** | Reflective Writer Graph + 模板 CRUD + PDF 导出 |
| **M4（团建策划师）** | LangGraph Planner + Tavily + 节点事件流；前端联调 |
| **M5（访客管家）** | OCR + 模糊匹配 + 钉钉推送 + 后台统计 |
| **M6（部署 / 加固）** | 完整 Docker Compose、Nginx、CI、监控告警、加密落地 |

---

## 14. 给协作 AI / Cursor 的核心指令（System Prompt）

**任务 A：搭建后端脚手架**
> 在 `backend/` 中按上文 §3.2 创建目录与最小文件：`app/main.py`、`app/core/config.py`、`app/db/session.py`、`app/cache/redis.py`、`app/api/v1/health.py`，启动后 `GET /api/v1/health` 应返回 `{"db":"ok","redis":"ok","ark":"ok"}`。依赖用 `uv` 管理，写入 `pyproject.toml`，必须包含：fastapi、uvicorn[standard]、sqlmodel、asyncpg、alembic、redis、pydantic-settings、langchain、langchain-openai、langchain-postgres、langgraph、tavily-python、structlog、weasyprint。

**任务 B：实现制度万事通 RAG**
> 实现 `app/ai/graphs/policy_rag.py` 与 `app/api/v1/policy.py`：
> 1. 节点：rewrite / retrieve / evaluate / answer，按 §4.1 的状态图编排。
> 2. 检索使用 `langchain_postgres.PGVector`，dim 与 `ARK_EMBEDDING_DIM` 对齐。
> 3. `/policy/chat` 必须以 `text/event-stream` 流式输出，事件类型严格按 §7.1 定义。
> 4. citations 字段需可定位到 `file_id + page + chunk_index`。

**任务 C：实现公文 Reflective Writer**
> 实现 `app/ai/graphs/doc_reflective.py`：writer / auditor 两节点 + 条件边，retry≤2；输出严格符合 §7.2 SSE schema；导出 PDF 走 `weasyprint`，落到 `data/exports/`。

**任务 D：实现团建 LangGraph Planner**
> 严格按 §4.3 的状态图实现；`event: node` 事件的 `id / status` 必须与前端 `frontend/app/(smart-office)/event/page.tsx` 中的 `initialNodes` 完全对齐。

**任务 E：实现访客模块**
> OCR 走火山视觉模型（§5.2），返回结构对齐 §7.4；启动时把 `Employee` 表加载到 Redis 拼音倒排索引；钉钉推送通过 `BackgroundTasks` 异步执行，重试 3 次指数退避。

---

## 附录 A：与 v2.0 的差异点

| # | v2.0 | v3.0 |
| :--- | :--- | :--- |
| 1 | 后端栈未指定数据库/缓存 | FastAPI + SQLModel + asyncpg + Redis |
| 2 | 向量库 ChromaDB（落 `data/vector_store/`） | pgvector（默认）；Chroma 仅作降级备选 |
| 3 | LLM 未指定 | 火山方舟（OpenAI 兼容） + Doubao 系列 |
| 4 | OCR 用 "任意主流 OCR API" | 火山方舟视觉模型，统一供应商 |
| 5 | `backend/app/{graph,services,api}` 三件套 | 七层结构：core / db / cache / models / repositories / ai / services / api |
| 6 | `data/` 含向量库 | `data/` 仅运行时数据卷（含 postgres/redis 持久化） |
| 7 | 无部署方案 | Docker Compose 五服务（postgres / redis / backend / frontend / nginx） |
| 8 | 无前后端契约 | 完整 SSE / REST 契约，对齐前端实际页面 |

