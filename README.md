# Smart Admin

企业智能办公平台，集成制度问答 RAG、公文 Copilot、团建策划师、访客管家四大 AI 模块。

## 项目简介

**Smart Admin** 是一款面向企业内部的智能化办公助手，基于大语言模型（LLM）打造，旨在将日常行政工作中的重复性劳动自动化，让人专注于更有价值的事务。

### 🎯 解决什么问题

- **制度查询难**：员工想了解公司政策，需要翻阅大量文档或反复咨询 HR
- **公文写作慢**：撰写通知、报告等公文耗时长，格式不规范
- **团建策划烦**：组织活动需要协调多方资源，策划过程繁琐
- **访客管理乱**：访客登记依赖人工，效率低且易出错

### ✨ 能做什么

| 模块 | 功能描述 |
|------|----------|
| **制度万事通** | 智能问答公司制度规范，基于 RAG 检索准确保存答案，支持上传制度文档 |
| **公文 Copilot** | AI 辅助撰写通知、报告等公文，支持模板管理和一键导出 |
| **团建策划师** | 自动生成团建方案，包含活动推荐、时间安排、预算明细与 PDF 导出 |
| **访客管家** | 数字化访客登记与审批，员工邀请、访客签到、离场记录全流程管理 |

---

**技术栈：** FastAPI + SQLModel + pgvector + Redis + LangGraph + Next.js 16

---

## 目录

- [一、本地开发启动](#一本地开发启动)
- [二、服务器部署信息](#二服务器部署信息)
- [三、首次部署（自动化一键部署）](#三首次部署自动化一键部署)
- [四、后续迭代更新（一键部署）](#四后续迭代更新一键部署)
- [五、运维常用命令](#五运维常用命令)
- [六、端口规划与目录结构](#六端口规划与目录结构)
- [七、故障排查](#七故障排查)
- [八、已知陷阱（部署前必读）](#八已知陷阱部署前必读)

---

## 一、本地开发启动

本地开发模式 = `docker-compose` 起 Postgres/Redis + 宿主机直接跑 backend / frontend。

### 1.1 启动数据库（PostgreSQL + Redis）

```powershell
docker compose -f deploy/docker-compose.yml up postgres redis -d
```

> 暴露端口：Postgres `5434`、Redis `6381`（避免与宿主机其它项目冲突）

### 1.2 启动后端

```powershell
cd backend
uv run alembic upgrade head
uv run python scripts/seed_policy.py        # 写入制度万事通 9 篇示例（幂等，重跑会跳过）
uv run python scripts/seed_document.py      # 写入公文 Copilot 9 篇模板（幂等）
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- 后端地址：http://127.0.0.1:8000
- API 文档：http://127.0.0.1:8000/docs
- seed 脚本只在首次运行时生效，日常重启可跳过

### 1.3 启动前端

```powershell
cd frontend
npm run dev
```

前端地址：http://localhost:3000

### 1.4 本地 `.env` 关键配置

`.env`（项目根目录）已配置完善，关键项：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | `postgresql+asyncpg://smartadmin:smartadmin-dev@localhost:5434/smartadmin` |
| `REDIS_URL` | `redis://localhost:6381/0` |
| `ARK_API_KEY` | 火山方舟 API Key（填在本地未跟踪的 `.env` / `deploy/server.env`） |
| `TAVILY_API_KEY` | Tavily 搜索 Key（团建模块用，填在本地未跟踪的 `.env` / `deploy/server.env`） |
| `DINGTALK_WEBHOOK_URL` / `DINGTALK_SECRET` | 钉钉群通知（选填，访客模块） |

---

## 二、服务器部署信息

| 项目 | 值 |
|------|-----|
| **服务器 IP** | `192.168.10.130` |
| **系统** | Ubuntu 24.04.4 LTS |
| **登录** | `ssh root@192.168.10.130` / 密码请从安全渠道获取 |
| **部署目录** | `/opt/smart-admin` |
| **对外访问** | http://192.168.10.130:8081 |

**端口规划（与服务器其它项目无冲突，已确认）：**

| 服务 | 宿主机端口 | 容器端口 | 暴露范围 |
|------|----------|---------|---------|
| Nginx（统一入口） | **8081** | 80 | 公开 |
| Postgres | **5434** | 5432 | 公开（仅调试用） |
| Redis | **6381** | 6379 | 公开（仅调试用） |
| Backend | — | 8000 | 仅 docker 网络 |
| Frontend | — | 3000 | 仅 docker 网络 |

---

## 三、首次部署（自动化一键部署）

### 部署组成示意图（脚本 · 配置 · 容器）

下图按 **本地脚本 → SSH 链路 → 服务器脚本 → 配置文件 → 运行时容器** 的纵向层级展示项目所有可执行入口和它们之间的依赖关系，**建议用等宽字体查看**。

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                       本地 Windows / Git Bash                                │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                  一次性配置脚本（仅首次跑一次）                        │  │
│  │   setup-ssh.ps1 ──→ 生成 SSH key 并推送到服务器，配好后免密            │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                  一键部署脚本（首次 / 迭代通用）                       │  │
│  │   deploy.ps1   ──→ PowerShell 入口（Windows 11 推荐）                  │  │
│  │   deploy.sh    ──→ Bash 入口（Git Bash / WSL / Linux / macOS 推荐）    │  │
│  │       └─ 校验 server.env → tar 打包 → scp 上传 → ssh 触发远端脚本      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                     日常运维脚本（按需运行）                           │  │
│  │   status.ps1   ──→ 查看 5 个容器状态 / 健康检查 / 磁盘占用             │  │
│  │   logs.ps1     ──→ 查看 / 跟踪服务器日志（默认 follow）                │  │
│  │   restart.ps1  ──→ 不重建镜像，重启服务                                │  │
│  │   seed.ps1     ──→ 手动重跑 seed（幂等）                               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│              ssh + scp（无密码，依赖 setup-ssh.ps1 一次性配置）              │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│            远程服务器 root@192.168.10.130 · Ubuntu 24.04 LTS                 │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                         服务器侧脚本层                                 │  │
│  │   /opt/smart-admin/deploy/scripts/remote-deploy.sh                     │  │
│  │       └─ 解压代码 → docker compose build --pull → up -d                │  │
│  │       └─ 等待 backend healthy（180s 超时）                             │  │
│  │       └─ 首次部署自动跑 seed_policy.py + seed_document.py              │  │
│  │                                                                        │  │
│  │   /opt/smart-admin/backend/scripts/entrypoint.sh                       │  │
│  │       └─ 容器启动时执行 alembic upgrade head                           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                           配置文件层                                   │  │
│  │   /opt/smart-admin/.env               ← 本地 deploy/server.env         │  │
│  │   /opt/smart-admin/deploy/docker-compose.yml                           │  │
│  │       └─ 5 个容器编排（name: smart-admin，防止与其它项目冲突）         │  │
│  │   /opt/smart-admin/deploy/nginx/nginx.conf                             │  │
│  │       └─ 8081 反代 → frontend:3000 / backend:8000                      │  │
│  │   /etc/docker/daemon.json             ← deploy/server-daemon.json      │  │
│  │       └─ Docker 国内镜像加速（清华 / 1ms.run / 阿里 等 6 源）          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                          运行时容器层                                  │  │
│  │   smart-admin-nginx      :8081 → 80     nginx:1.27-alpine              │  │
│  │   smart-admin-frontend          3000    Next.js 16 standalone          │  │
│  │   smart-admin-backend           8000    FastAPI + uv（Python 3.12）    │  │
│  │   smart-admin-postgres   :5434 → 5432   pgvector/pgvector:pg16         │  │
│  │   smart-admin-redis      :6381 → 6379   redis:7-alpine                 │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 部署流程总览

下图展示了从本地一键脚本到服务器容器全部就绪的完整流程。

```mermaid
flowchart TD
    subgraph LOCAL ["本地 Windows / Git Bash"]
        direction TB
        A(["开发者执行<br/>deploy.ps1 / deploy.sh"]) --> C["1. 校验 deploy/server.env<br/>+ SSH 免密"]
        C --> D["2. tar 打包源码<br/>排除 data/ .git/ .venv/ node_modules/"]
        D --> E["3. scp 上传 tar.gz<br/>+ server.env → /opt/smart-admin/.env"]
    end

    E -->|ssh 触发| F

    subgraph REMOTE ["服务器 192.168.10.130 · Ubuntu 24.04"]
        direction TB
        F["4. remote-deploy.sh<br/>解压到 /opt/smart-admin"] --> G["5. docker compose build --pull<br/>国内镜像源（清华 / 阿里 / 1ms.run）"]
        G --> H["6. docker compose up -d<br/>postgres · redis · backend · frontend · nginx"]
        H --> I["7. entrypoint.sh 自动执行<br/>alembic upgrade head"]
        I --> J["8. 等待 backend healthy<br/>最长 180s"]
        J --> K{"首次部署？<br/>.deploy/first-run.done 不存在"}
        K -->|是| L["9a. seed_policy.py<br/>+ seed_document.py（幂等）"]
        K -->|否| M["9b. 跳过 seed"]
        L --> N["10. touch .deploy/first-run.done"]
        N --> O(["✅ 部署完成"])
        M --> O
    end

    O --> P(["浏览器访问<br/>http://192.168.10.130:8081"])

    classDef local fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e
    classDef remote fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef decision fill:#fef3c7,stroke:#ca8a04,color:#713f12
    classDef done fill:#fae8ff,stroke:#a21caf,color:#581c87
    class A,C,D,E local
    class F,G,H,I,J,L,M,N remote
    class K decision
    class O,P done
```

**关键点：**

- 第 2 步 tar 打包会自动**排除** `data/`，因此服务器上业务数据**永不被覆盖**
- 第 5 步所有依赖（pip / npm / apt / apk / docker pull）全部走国内源，详见 [§8.2](#82-镜像源全部走国内源避免拉取超时)
- 第 7 步 alembic 迁移在容器内**自动执行**，新增 migration 部署即生效
- 第 9 步 seed 由 `.deploy/first-run.done` 标记控制，迭代部署不会重跑 seed

---

> 本地电脑：Windows 11 + PowerShell（已自带 ssh / scp / tar）

### 步骤 1：一次性配置 SSH 免密（仅做一次）

```powershell
pwsh ./deploy/scripts/setup-ssh.ps1
```

执行过程中会要求 **输入一次** 服务器 root 密码（请从安全渠道获取），完成后所有部署/运维脚本均无需密码。

> **Git Bash 用户也可以直接执行：** `ssh-copy-id root@192.168.10.130`

### 步骤 2：准备服务器端环境变量

```powershell
Copy-Item deploy/server.env.example deploy/server.env
notepad deploy/server.env
```

**至少修改以下两项**（其它项默认值即可工作）：

- `APP_SECRET_KEY=` 改成 32+ 字节随机字符串
- `POSTGRES_PASSWORD=` 改成强密码（必须 **同时** 修改 `DATABASE_URL` 中相同位置的密码）

> `deploy/server.env` 已加入 `.gitignore`，不会被提交。

### 步骤 3：一键部署

```powershell
pwsh ./deploy/scripts/deploy.ps1
```

或在 **Git Bash / WSL / Linux / macOS** 下：

```bash
bash ./deploy/scripts/deploy.sh
```

部署流程（全自动）：

1. 检查本地 `deploy/server.env` 与 SSH 免密
2. 本地 `tar` 打包源码（排除 `data/`、`node_modules/`、`.venv/`、`.git/` 等）
3. `scp` 上传 tar 包 + `server.env`（落到远端 `/opt/smart-admin/.env`）
4. 远端 `docker compose build --pull` → `up -d`
5. 容器启动时 `entrypoint.sh` 自动执行 `alembic upgrade head` 完成数据库迁移
6. 等待 backend 健康检查通过
7. **首次部署** 自动执行 `seed_policy.py` + `seed_document.py`（幂等）
8. 输出访问地址

部署完成后访问 http://192.168.10.130:8081

---

## 四、后续迭代更新（一键部署）

新功能开发完成后，**只需一条命令** 即可发布：

```powershell
pwsh ./deploy/scripts/deploy.ps1
```

脚本会自动判断是否首次部署：

- 首次部署 → 跑 seed
- 已部署 → 跳过 seed，仅同步代码 + 重建镜像 + 滚动重启 + 自动跑 alembic 迁移

> 新增 alembic 迁移无需任何额外操作，`backend/scripts/entrypoint.sh` 在容器启动时会自动 `upgrade head`。

---

## 五、运维常用命令

所有脚本均位于 `deploy/scripts/`，默认连接 `192.168.10.130`。

| 命令 | 作用 |
|------|------|
| `pwsh ./deploy/scripts/deploy.ps1` | 一键部署 / 迭代更新（Windows / PowerShell） |
| `bash ./deploy/scripts/deploy.sh` | 一键部署 / 迭代更新（Git Bash / WSL / Linux / macOS） |
| `pwsh ./deploy/scripts/status.ps1` | 查看远端容器状态 / 健康检查 / 磁盘占用 |
| `pwsh ./deploy/scripts/logs.ps1 backend` | 跟踪 backend 日志（`-NoFollow` 不持续跟踪，`-Tail 500` 指定行数） |
| `pwsh ./deploy/scripts/logs.ps1` | 一次性查看全部服务最近 200 行 |
| `pwsh ./deploy/scripts/restart.ps1` | 重启全部服务（不重建镜像） |
| `pwsh ./deploy/scripts/restart.ps1 backend` | 仅重启 backend |
| `pwsh ./deploy/scripts/seed.ps1` | 手动重跑全部 seed（幂等） |
| `pwsh ./deploy/scripts/seed.ps1 -Only policy` | 仅重跑制度万事通 seed |
| `pwsh ./deploy/scripts/setup-ssh.ps1` | 一次性配置 SSH 免密（仅首次） |

直接 SSH 进服务器：

```powershell
ssh root@192.168.10.130
cd /opt/smart-admin
docker compose -f deploy/docker-compose.yml ps
```

---

## 六、端口规划与目录结构

### 服务器目录结构（`/opt/smart-admin`）

```
/opt/smart-admin/
├── .env                       # 服务器端环境变量（由 deploy.ps1 自动上传）
├── .deploy/
│   └── first-run.done         # 首次部署标记（存在则跳过 seed）
├── backend/                   # 源码（每次部署覆盖）
├── frontend/                  # 源码（每次部署覆盖）
├── deploy/                    # docker-compose + nginx 配置 + 脚本
└── data/                      # 持久化数据（永不覆盖）
    ├── postgres/              # Postgres 数据卷
    ├── redis/                 # Redis 数据卷
    ├── knowledge_base/        # 制度万事通知识库文件
    ├── uploads/               # 用户上传
    ├── exports/               # 导出文件
    └── logs/                  # 应用日志
```

### 项目源码结构

```
smart-admin/
├── backend/                   # FastAPI 后端（Python 3.12 + uv）
│   ├── app/                   # 应用代码（api/ai/models/services/repositories）
│   ├── alembic/               # 数据库迁移
│   └── scripts/               # entrypoint.sh、seed_policy.py、seed_document.py
├── frontend/                  # Next.js 16 前端（standalone build）
├── deploy/
│   ├── docker-compose.yml     # 全栈编排
│   ├── nginx/nginx.conf       # 反代 /api → backend，/ → frontend
│   ├── server.env.example     # 服务器端 .env 模板
│   └── scripts/               # 自动化部署 & 运维 PowerShell / bash 脚本
│       ├── setup-ssh.ps1
│       ├── deploy.ps1            # Windows / PowerShell 一键部署
│       ├── deploy.sh            # Git Bash / Linux / macOS 一键部署（功能对等 deploy.ps1）
│       ├── remote-deploy.sh
│       ├── status.ps1
│       ├── logs.ps1
│       ├── restart.ps1
│       └── seed.ps1
├── docs/                      # PRD 与技术设计文档
└── scripts/e2e.ps1            # 32 用例端到端冒烟测试
```

### 数据库迁移说明

- 迁移文件位于 `backend/alembic/versions/`，当前已有 5 个 baseline 迁移
- 容器启动时 `backend/scripts/entrypoint.sh` 自动执行 `alembic upgrade head`
- **新增迁移：** 本地 `cd backend && uv run alembic revision --autogenerate -m "xxx"` → 部署时自动应用
- pgvector 扩展由 `pgvector/pgvector:pg16` 镜像内置，无需手动安装

---

## 七、故障排查

### 部署失败：backend 健康检查未通过

```powershell
pwsh ./deploy/scripts/logs.ps1 backend -NoFollow -Tail 200
```

常见原因：
- `ARK_API_KEY` 错误 → seed 阶段会失败，检查 `deploy/server.env`
- Postgres 密码不匹配 → 删除 `data/postgres/` 后重新部署（会清空数据）
- 端口冲突 → 编辑 `deploy/docker-compose.yml` 修改宿主机端口

### 想完全重置数据库（清空业务数据）

```powershell
ssh root@192.168.10.130
cd /opt/smart-admin
docker compose -f deploy/docker-compose.yml down
rm -rf data/postgres data/redis .deploy/first-run.done
exit
# 然后本地
pwsh ./deploy/scripts/deploy.ps1
```

### 修改了 `.env` 但容器没生效

```powershell
pwsh ./deploy/scripts/restart.ps1 backend
```

或重新部署：

```powershell
pwsh ./deploy/scripts/deploy.ps1
```

### E2E 冒烟测试（本地后端启动后）

```powershell
pwsh ./scripts/e2e.ps1
```

覆盖全部 32 个用例（制度问答、公文 Copilot、团建策划师、访客管家四大模块）。

---

## 八、已知陷阱（部署前必读）

以下为本项目部署/运维过程中已踩过的坑，**已通过脚本与配置规避**，但需要使用者知晓背景。

### 8.1 项目隔离（防止误杀服务器上其它 Compose 项目）

`deploy/docker-compose.yml` 顶部已设置 `name: smart-admin`，确保：

- compose 项目名固定为 `smart-admin`，**不会** 因为目录改名而改变
- 网络名固定为 `smart-admin_default`、卷名前缀固定为 `smart-admin_*`
- 在服务器上 `docker compose down --remove-orphans` 等命令**不会误删** `/opt/cgwire`、`/opt/falcon` 等其它项目的容器

> ⚠️ **千万不要** 删除或修改 `docker-compose.yml` 顶部的 `name:` 字段。

### 8.2 镜像源全部走国内源（避免拉取超时）

国内网络从 `ghcr.io`、`registry-1.docker.io` 直拉极慢甚至失败，本项目已统一改造：

| 类型 | 镜像源 | 配置位置 |
|------|--------|----------|
| PyPI（uv / pip） | 清华 TUNA `https://pypi.tuna.tsinghua.edu.cn/simple` | `backend/pyproject.toml` `[[tool.uv.index]]` |
| Debian APT | 清华 TUNA `mirrors.tuna.tsinghua.edu.cn` | `backend/Dockerfile` 内 `sed` 替换 |
| Alpine APK | 阿里云 `mirrors.aliyun.com` | `frontend/Dockerfile` 内 `sed` 替换 |
| NPM | 淘宝 `https://registry.npmmirror.com` | `frontend/Dockerfile` 安装阶段 `--registry` |
| Docker Registry | 1ms.run / xuanyuan.me / 1panel.live / atomgit / daocloud / ustc | `deploy/server-daemon.json`（已写入 `/etc/docker/daemon.json`） |

如服务器 Docker 镜像加速器丢失或被覆盖，重新写入：

```bash
scp deploy/server-daemon.json root@192.168.10.130:/etc/docker/daemon.json
ssh root@192.168.10.130 'systemctl restart docker'
```

### 8.3 Git Bash 终端注意事项（WebStorm 用户）

如果在 WebStorm 中把终端配置为 `C:\Program Files\Git\bin\bash.exe`：

- **直接执行 `bash ./deploy/scripts/deploy.sh`**，更加丝滑（无编码 / PATH 问题）
- 若坚持用 `pwsh deploy.ps1`，脚本已强制使用 `C:\Windows\System32\tar.exe`，避免 Git Bash 自带的 GNU tar 把 `C:` 当成远程主机解析（典型报错 `tar (child): Cannot connect to C`）
- 控制台中文乱码：`chcp 65001` 后再跑脚本

### 8.4 服务器现有项目端口对照

为方便排错，下列端口在服务器上已被其它项目占用，本项目已避开：

| 已占用端口 | 占用方 |
|-----------|-------|
| 5432 / 5433 | cgwire / 其它 Postgres |
| 6379 / 6380 | 其它 Redis |
| 80 / 8080 | falcon-nginx |

本项目使用 `8081`（web）/ `5434`（pg）/ `6381`（redis）。如需进一步避让，统一修改 `deploy/docker-compose.yml` 中的 ports 映射。

### 8.5 误删容器的应急恢复（仅供参考）

若运维操作不慎对其它项目执行了 `docker compose down`：

- **数据卷不会被删** —— 仅 `down -v` 才会删卷
- 找到该项目的 `docker-compose.yml` 重新 `up -d` 即可（如 `cd /opt/cgwire/deploy && docker compose -f docker-compose.prod.yml up -d`）

---

## 许可

内部项目。

