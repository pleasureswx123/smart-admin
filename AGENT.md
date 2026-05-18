# AGENT.md

Smart Admin 是一个面向企业行政办公场景的智能办公平台。项目由 FastAPI 后端、Next.js 管理台、PostgreSQL + pgvector、Redis，以及基于火山方舟、LangChain、LangGraph 的 AI 工作流组成。

## 项目主要做什么

本项目覆盖四个核心行政办公场景：

- 制度万事通：基于公司制度文档做 RAG 问答，支持来源引用、制度文档入库与检索。
- 公文 Copilot：辅助撰写通知、报告等行政公文，支持模板和导出。
- 团建策划师：基于 LangGraph 的活动策划工作流，结合联网搜索、预算检查和迭代生成方案。
- 访客管家：访客登记、员工匹配、签到/离场记录，以及可选的钉钉通知。

仓库是 monorepo 结构：

- `backend/`：FastAPI 服务、数据库模型、Repository、业务服务、AI chains/graphs/tools、Alembic 迁移。
- `frontend/`：Next.js 16 App Router 前端，承载四个智能办公模块页面。
- `deploy/`：Docker Compose、Nginx、远程部署和运维脚本。
- `docs/`：产品需求文档和技术方案文档。
- `data/`：运行时数据卷目录。不要提交真实业务数据。
- `scripts/`：本地辅助脚本，例如端到端流程脚本。

## 架构约定

后端分层保持清晰、直接：

```text
api -> services -> repositories
api -> services -> ai
```

- `backend/app/api/v1/`：HTTP 路由、请求/响应处理和依赖注入，不写业务编排。
- `backend/app/services/`：业务编排层，负责协调 repositories、AI graphs/chains、导出和外部通知。
- `backend/app/repositories/`：数据库访问层，保持轻量，聚焦 SQL/ORM 操作。
- `backend/app/models/`：SQLModel 表模型。
- `backend/app/schemas/`：Pydantic API 输入/输出模型。
- `backend/app/ai/`：Ark 客户端、LangChain/LangGraph 工作流、提示词、loader 和工具。
- `backend/app/core/`、`backend/app/db/`、`backend/app/cache/`：通用基础设施。

不要让 `ai` 层直接调用 repositories。需要同时使用数据和 AI 能力时，在 `services` 层统一编排。

前端约定：

- 主应用页面位于 `frontend/app/(smart-office)/`。
- 统一 API 辅助函数位于 `frontend/lib/api.ts`；后端类型镜像或手写 API 类型位于 `frontend/lib/api-types.ts`。
- 共享 UI primitives 位于 `frontend/components/ui/`；新增 UI 前优先复用现有 shadcn/Radix 模式。
- API 调用使用 `/api/v1/...` 这类相对路径，由 Next.js rewrite 或 Nginx 反代到后端。

## 常用命令

启动本地基础设施：

```powershell
docker compose -f deploy/docker-compose.yml up postgres redis -d
```

启动后端：

```powershell
cd backend
uv run alembic upgrade head
uv run python scripts/seed_policy.py
uv run python scripts/seed_document.py
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

启动前端：

```powershell
cd frontend
npm run dev
```

后端地址和文档：

- 后端：`http://127.0.0.1:8000`
- OpenAPI：`http://127.0.0.1:8000/docs`
- 健康检查：`/api/v1/health`

前端：

- 本地页面：`http://localhost:3000`

构建和检查前端：

```powershell
cd frontend
npm run build
npm run lint
```

执行后端迁移：

```powershell
cd backend
uv run alembic upgrade head
```

只有在确认目标环境和 `deploy/server.env` 后，才使用 `deploy/scripts/` 下的部署脚本。

## 环境变量与密钥

配置从 `.env` 文件和部署环境文件读取。重要变量包括：

- `DATABASE_URL`
- `REDIS_URL`
- `ARK_API_KEY`
- `ARK_BASE_URL`
- `ARK_CHAT_MODEL`
- `ARK_VISION_MODEL`
- `ARK_EMBEDDING_MODEL`
- `TAVILY_API_KEY`
- `DINGTALK_WEBHOOK_URL`
- `DINGTALK_SECRET`

不要提交真实密钥。示例配置放在 `*.env.example`，真实本地或服务器配置放在已忽略的环境文件中。

## 数据与持久化

`data/` 是运行时状态目录，不是源码目录：

- `data/postgres/` 和 `data/redis/` 是 Docker 挂载的持久化目录。
- `data/uploads/` 存放临时上传文件。
- `data/exports/` 存放生成的公文和活动方案导出文件。
- `data/logs/` 存放应用日志。
- 制度向量数据存放在 PostgreSQL/pgvector 中，不提交到仓库文件。

除非用户明确要求，不要删除或覆盖运行时数据。

## 数据库变更

修改数据库模型时：

- 在 `backend/alembic/versions/` 下新增 Alembic migration。
- 保持 SQLModel 定义、Pydantic schemas、repositories 和 API 响应一致。
- migration 要兼容已有本地和服务器数据。
- 对 nullable/default 行为保持显式，不依赖隐式数据库行为。

## AI 工作流变更

AI 代码应保持外部依赖隔离：

- Ark 配置放在 `backend/app/core/config.py`，客户端工厂放在 `backend/app/ai/` 下。
- Tavily 搜索逻辑放在 `backend/app/ai/tools/`。
- LangGraph 工作流放在 `backend/app/ai/graphs/`。
- 修改提示词时，保留中文业务语气；涉及制度问答时保留引用和来源要求。
- 流式接口应输出稳定的 SSE frame，确保前端可以通过 `streamSse()` 解析。

当 AI 输出需要解析为 JSON 或结构化数据时，应通过 schema 校验，并妥善处理模型输出格式错误的情况。

## 测试与验证

完成代码改动前，运行最小但有效的检查：

- 仅后端改动：运行相关后端测试；如果没有测试，至少做导入/启动检查或运行相关脚本。
- migration 或模型改动：运行 `uv run alembic upgrade head`。
- 仅前端改动：可行时运行 `npm run lint` 和 `npm run build`。
- 跨前后端 API 改动：同时确认后端 schema、前端 API 类型和受影响页面流程。

如果因为缺少凭据、服务未启动或外部 API 不可用导致无法执行检查，在最终回复中说明。

## 编码指南

- 修改范围保持聚焦，只处理用户请求相关的行为。
- 匹配现有项目风格和命名。
- 优先复用现有工具函数和本地模式，不轻易新增抽象。
- 不在功能或修复任务中顺手重构无关代码。
- 除非任务需要，不要修改 `.env`、运行时数据、生成的 lockfile 或部署配置。
- 保留中文 UI 和产品文案，除非用户要求其他语言。
- 做前端 UI 时，直接构建真实可用的业务界面，不做营销落地页。

## 部署说明

Docker Compose 定义了五个服务：

- `smart-admin-postgres`
- `smart-admin-redis`
- `smart-admin-backend`
- `smart-admin-frontend`
- `smart-admin-nginx`

当前部署配置中，Nginx 通过宿主机 `8081` 端口暴露应用。生产环境下 backend 和 frontend 仅在 compose 网络内部访问。

部署脚本会打包源码并排除运行时数据。`deploy/server.env` 是敏感的服务器配置文件，应谨慎处理。

