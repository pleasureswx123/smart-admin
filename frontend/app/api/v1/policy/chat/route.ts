/**
 * SSE 代理：POST /api/v1/policy/chat
 *
 * 原因：Next.js dev server 的 rewrite 代理会缓冲 SSE 响应，导致 token 流
 * 无法实时到达浏览器。此 Route Handler 优先级高于 rewrite，直接透传后端流。
 */

import { NextRequest } from "next/server"
import { proxyPost } from "@/lib/sse-proxy"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest): Promise<Response> {
  return proxyPost(req, "/api/v1/policy/chat")
}
