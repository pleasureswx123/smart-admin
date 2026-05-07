# 【灵办】智能行政服务中心 - 技术方案文档 (Technical Design) v2.0

## 1. 技术栈选型 (Advanced Tech Stack)
*   **Orchestration:** **LangGraph** (核心编排，用于处理带循环逻辑的策划任务)。
*   **Framework:** **LangChain** (用于处理 RAG 链条、工具调用、Prompt 模板)。
*   **Vector Database:** **ChromaDB** (本地持久化向量库)。
*   **Agent Tools:** **Tavily Search API** (专为 AI 设计的实时联网搜索)。
*   **Backend:** FastAPI (Python 3.10+)。
*   **OCR:** `Unstructured` (用于解析 PDF 表格) + 任意主流 OCR API (用于访客登记)。

## 2. 目录结构规划 (File Structure)
```text
smart-admin/
├── backend/
│   ├── app/
│   │   ├── graph/             # LangGraph 状态机定义
│   │   │   ├── state.py       # 统一状态定义
│   │   │   ├── event_graph.py # 团建策划工作流图
│   │   │   └── writer_graph.py# 闭环公文写作图
│   │   ├── services/
│   │   │   ├── rag_engine.py  # LangChain RAG 实现
│   │   │   ├── tool_box.py    # 联网搜索、预算计算工具
│   │   │   └── dingtalk.py    # 钉钉 API 封装
│   │   ├── api/               # FastAPI 路由
│   │   └── main.py
├── data/
│   ├── knowledge_base/        # 存放公司制度 PDF/Word
│   └── vector_store/          # ChromaDB 持久化文件
└── frontend/                  # React + Tailwind
```

## 3. 核心设计：LangGraph 状态机编排

### 3.1 团建策划图逻辑 (Event Planner Graph)
这是项目二最核心的 Agent 逻辑，用于解决“方案不符合要求就重来”的问题。
*   **Nodes (节点):**
    1.  `search_node`: 根据用户需求，使用 Tavily 搜索周边餐厅/场地。
    2.  `evaluator_node`: AI 检查搜索结果，计算总价，对比用户预算和人数。
    3.  `draft_node`: 根据审核通过的结果生成正式 Markdown 方案。
*   **Edges (边):**
    *   `evaluator_node` -> `search_node`: 如果预算超标或信息不足，触发 **Loop (循环)** 重新搜索。
    *   `evaluator_node` -> `draft_node`: 审核通过，进入生成阶段。

### 3.2 制度问答链路 (Advanced RAG)
*   **多步检索:** 采用 `Self-Querying Retriever`。AI 先解析用户问题中的元数据（如：日期、部门），再进行向量检索。
*   **内容评价:** 引入 `RAGAS` 或类似的评价逻辑，如果检索到的 Chunk 无法回答问题，AI 会尝试 `Multi-query`（从不同角度重写问题再次检索）。

## 4. 数据库与状态设计 (Schema)

### 4.1 LangGraph 状态定义
```python
from typing import TypedDict, List, Optional

class PlannerState(TypedDict):
    query: str                  # 原始需求
    candidates: List[dict]      # 搜索到的地点列表
    budget_feedback: str        # 评价意见
    is_budget_ok: bool          # 预算是否合格
    final_itinerary: str        # 最终行程
    retry_count: int            # 重试次数限制
```

### 4.2 访客记录表
| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| id | UUID | 主键 |
| visitor_info | JSONB | 包含姓名、单位、手机号 |
| host_name | String | 匹配到的员工姓名 |
| push_status | Enum | 钉钉推送状态 (Success/Fail) |

## 5. 给 Cursor 的核心指令 (System Prompt)

**任务 A：生成 RAG 核心逻辑**
> "我需要你编写 `rag_engine.py`。
> 1. 使用 `LangChain` 的 `PyMuPDFLoader` 加载 `knowledge_base/` 下的文件。
> 2. 实现 `RecursiveCharacterTextSplitter` 进行切片，并存入 `Chroma`。
> 3. 编写 `ask` 函数：实现带来源溯源（Source Documents）的问答。要求 AI 在回答中必须指出引用了哪一个 PDF。"

**任务 B：构建 LangGraph 策划图**
> "请在 `event_graph.py` 中实现状态图。
> 1. 定义 `search_node` 调用 `TavilySearchResults` 工具。
> 2. 定义 `evaluator_node` 逻辑：如果 `retry_count < 3` 且预算不符，则返回 `search_node`。
> 3. 使用 `StateGraph` 进行编译，并支持在 FastAPI 中异步调用 `graph.ainvoke`。"

## 6. 开发建议 (Architect's Tips)
1.  **处理 PDF 表格:** 告诉 Cursor 在处理制度文档时，如果 PDF 包含大量表格，建议先用 `UnstructuredPDFLoader(strategy="hi_res")`。
2.  **搜索限制:** 预设 Prompt 限制搜索范围为“公司周边 20 公里”或“特定城市”。
3.  **访客隐私:** 访客登记的身份证图片通过 OCR 提取文本后，立刻在服务器 `temp/` 目录下物理删除。
