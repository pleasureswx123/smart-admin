// 统一 API 客户端：fetch 包装 + SSE 解析 + 后端类型镜像。
// 所有调用走相对路径 `/api/v1/...`，由 Next.js rewrite 或 nginx 反代到后端。

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""

export class ApiError extends Error {
  status: number
  detail?: string
  constructor(status: number, detail?: string) {
    super(detail || `HTTP ${status}`)
    this.status = status
    this.detail = detail
  }
}

async function _parseError(res: Response): Promise<string> {
  try {
    const j = await res.json()
    return j?.detail || JSON.stringify(j)
  } catch {
    return await res.text()
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, method: "GET" })
  if (!res.ok) throw new ApiError(res.status, await _parseError(res))
  return res.json() as Promise<T>
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(res.status, await _parseError(res))
  return res.json() as Promise<T>
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" })
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, await _parseError(res))
  }
}

export async function apiUpload<T>(
  path: string,
  formData: FormData
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) throw new ApiError(res.status, await _parseError(res))
  return res.json() as Promise<T>
}

// ============================================================
// SSE：基于 fetch + ReadableStream 自行解析（原生 EventSource 不支持 POST）
// ============================================================
export type SseEvent = { event: string; data: any }

export async function* streamSse(
  path: string,
  body: unknown,
  signal?: AbortSignal
): AsyncGenerator<SseEvent> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new ApiError(res.status, await _parseError(res))
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    // SSE 帧按空行分隔（\n\n）
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      let event = "message"
      const dataLines: string[] = []
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim()
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length === 0) continue
      const raw = dataLines.join("\n")
      let data: any = raw
      try {
        data = JSON.parse(raw)
      } catch {
        // 保持字符串
      }
      yield { event, data }
    }
  }
}
