# Smart Admin

企业智能办公平台，集成制度问答 RAG、公文 Copilot、团建策划师、访客管家四大 AI 模块。

**技术栈**：FastAPI + SQLModel + pgvector + Redis + LangGraph + Next.js

---

## 本地开发启动步骤

### 第 1 步：启动数据库（Docker）

```powershell
docker compose -f deploy/docker-compose.yml up postgres redis -d
```

### 第 2 步：启动后端

```powershell
cd backend
uv run alembic upgrade head
uv run python scripts/seed_policy.py
uv run python scripts/seed_document.py
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

> 两个 seed 脚本均为**幂等脚本**，重复运行会自动跳过已存在记录：
> - `seed_policy.py`：写入制度万事通的 9 篇知识库文档（需调用 embedding 服务，请确认 `backend/.env` 中 `ARK_API_KEY` 已配置）
> - `seed_document.py`：写入公文 Copilot 的 9 篇模板（行政通知 / 内部请示 / 处罚奖励各 3 篇）
>
> 日常重启只需执行 `alembic upgrade head` + `uvicorn`，seed 步骤可跳过。

后端接口地址：http://127.0.0.1:8000  
API 文档：http://127.0.0.1:8000/docs

### 第 3 步：启动前端

```powershell
cd frontend
npm run dev
```

前端地址：http://localhost:3000

---

## 环境变量配置

| 文件 | 用途 |
|------|------|
| `backend/.env` | 后端所有配置（数据库、Redis、AI Key 等） |
| `.env` | docker-compose 全栈模式使用 |

`backend/.env` 关键配置项：

```bash
# 数据库（对应 Docker 暴露端口）
DATABASE_URL=postgresql+asyncpg://smartadmin:smartadmin-dev@localhost:5432/smartadmin
REDIS_URL=redis://localhost:6379/0

# 火山引擎 Ark（必填）
ARK_API_KEY=your-key
ARK_CHAT_MODEL=deepseek-v3-2-251201        # 文字推理/生成
ARK_VISION_MODEL=doubao-seed-1-6-flash-250828   # 名片 OCR 图片理解
ARK_EMBEDDING_MODEL=doubao-embedding-vision-251215  # 向量化/语义搜索

# Tavily 搜索（团建策划师模块使用，免费 1000次/月）
# 注册：https://app.tavily.com
TAVILY_API_KEY=your-key

# 钉钉群机器人（访客通知，选填）
DINGTALK_WEBHOOK_URL=
DINGTALK_SECRET=
```

---

## 全栈容器化（生产/集成测试）

```powershell
docker compose -f deploy/docker-compose.yml up --build -d
```

包含服务：postgres、redis、backend、frontend、nginx（统一入口 http://localhost:80）

---

## E2E 冒烟测试

后端启动后执行（覆盖全部 32 个端点）：

```powershell
# PowerShell 7+
pwsh ./scripts/e2e.ps1

# Windows PowerShell 5.1
powershell -ExecutionPolicy Bypass -File scripts/e2e.ps1
```

---

## 项目结构

```
smart-admin/
├── backend/          # FastAPI 后端
│   ├── app/          # 应用代码（api/ai/models/services）
│   ├── alembic/      # 数据库迁移
│   └── scripts/      # entrypoint.sh、seed_policy.py、seed_document.py 等
├── frontend/         # Next.js 前端
├── deploy/           # docker-compose + nginx 配置
├── scripts/          # e2e.ps1 冒烟脚本
└── docs/             # PRD 与技术设计文档
```
