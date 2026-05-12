/**
 * SSE 代理工具：用于 Next.js Route Handler 透传后端 SSE 流。
 *
 * 问题背景：
 *   Next.js dev server 的 rewrite 代理会缓冲 SSE 响应，导致所有事件在后端
 *   处理完成后才一次性推送到浏览器，无法实现实时流式效果。
 *
 * 解决方案：
 *   对 SSE 端点单独创建 Route Handler（优先级高于 rewrite），直接用
 *   Web Fetch API 拿到后端 ReadableStream 后原样透传给浏览器，无任何缓冲。
 */

import { NextRequest } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000"

/**
 * 将 POST 请求代理到后端，透传响应流（支持 SSE）。
 * @param req  Next.js 请求对象
 * @param backendPath  后端完整路径，如 "/api/v1/event/plan"
 */
export async function proxyPost(req: NextRequest, backendPath: string): Promise<Response> {
  const accept = req.headers.get("accept") || "application/json"
  const body = await req.text()

  let backendRes: globalThis.Response
  try {
    backendRes = await fetch(`${BACKEND_URL}${backendPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: accept,
      },
      body,
    })
  } catch (err: any) {
    // 后端不可达时返回 502
    return new Response(
      JSON.stringify({ detail: `后端服务不可达：${err?.message || err}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    )
  }

  const contentType = backendRes.headers.get("content-type") || "application/json"

  // 构建响应头：SSE 必须禁用缓冲
  const responseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  }

  // 透传响应体（ReadableStream），不做任何缓冲
  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: responseHeaders,
  })
}
