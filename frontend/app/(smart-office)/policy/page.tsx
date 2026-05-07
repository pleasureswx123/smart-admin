"use client"

import * as React from "react"
import { Send, Trash2, BookOpen, Clock, Upload, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { apiGet, apiUpload, streamSse } from "@/lib/api"
import type {
  CategoryItem,
  KnowledgeFile,
  PolicyCitation,
  QuickQuestion,
} from "@/lib/api-types"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: PolicyCitation[]
  stage?: string
}

const initialMessages: Message[] = [
  {
    id: "init",
    role: "assistant",
    content: "您好！我是制度万事通，您可以向我咨询公司的各项规章制度。请问有什么可以帮助您的？",
  },
]

const STAGE_LABELS: Record<string, string> = {
  rewrite: "正在改写问题…",
  retrieve: "正在检索制度库…",
  evaluate: "正在评估命中度…",
  answer: "正在生成答案…",
}

export default function PolicyPage() {
  const [messages, setMessages] = React.useState<Message[]>(initialMessages)
  const [input, setInput] = React.useState("")
  const [selectedCitation, setSelectedCitation] = React.useState<PolicyCitation | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [categories, setCategories] = React.useState<CategoryItem[]>([])
  const [filesByCategory, setFilesByCategory] = React.useState<Record<string, KnowledgeFile[]>>({})
  const [quickQuestions, setQuickQuestions] = React.useState<string[]>([])
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const refreshKnowledge = React.useCallback(async () => {
    try {
      const [cats, files, qqs] = await Promise.all([
        apiGet<CategoryItem[]>("/api/v1/policy/categories"),
        apiGet<KnowledgeFile[]>("/api/v1/policy/files?limit=200"),
        apiGet<QuickQuestion[]>("/api/v1/policy/quick-questions"),
      ])
      setCategories(cats)
      const grouped: Record<string, KnowledgeFile[]> = {}
      for (const f of files) {
        ;(grouped[f.category] ||= []).push(f)
      }
      setFilesByCategory(grouped)
      setQuickQuestions(qqs.map((q) => q.text))
    } catch (e) {
      console.error("policy.knowledge.load_failed", e)
    }
  }, [])

  React.useEffect(() => {
    refreshKnowledge()
    return () => abortRef.current?.abort()
  }, [refreshKnowledge])

  const handleSend = async () => {
    const question = input.trim()
    if (!question || isLoading) return
    setInput("")
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: question }
    const aiId = `a-${Date.now()}`
    const aiMsg: Message = { id: aiId, role: "assistant", content: "", stage: "rewrite" }
    setMessages((prev) => [...prev, userMsg, aiMsg])
    setIsLoading(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const stream = streamSse("/api/v1/policy/chat", { question, top_k: 5 }, ctrl.signal)
      const collected: PolicyCitation[] = []
      for await (const ev of stream) {
        if (ev.event === "stage") {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, stage: ev.data?.node } : m))
          )
        } else if (ev.event === "token") {
          const delta = ev.data?.delta || ""
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: m.content + delta } : m))
          )
        } else if (ev.event === "citation") {
          collected.push(ev.data as PolicyCitation)
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, citations: [...collected] } : m))
          )
        } else if (ev.event === "done") {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, stage: undefined } : m))
          )
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId
              ? { ...m, content: `请求失败：${e?.message || e}`, stage: undefined }
              : m
          )
        )
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }

  const handleClearChat = () => {
    abortRef.current?.abort()
    setMessages(initialMessages)
    setSelectedCitation(null)
  }

  const handleUpload = async (file: File) => {
    const lower = file.name.toLowerCase()
    if (!lower.endsWith(".md") && !lower.endsWith(".markdown")) {
      alert("仅支持 Markdown 文件（.md/.markdown）")
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    fd.append("category", "未分类")
    fd.append("access_level", "public")
    setUploading(true)
    try {
      await apiUpload("/api/v1/policy/files", fd)
      await refreshKnowledge()
    } catch (e: any) {
      alert(`上传失败：${e?.message || e}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* 左侧：知识库目录 */}
      <PolicySidebar
        categories={categories}
        filesByCategory={filesByCategory}
        uploading={uploading}
        fileInputRef={fileInputRef}
        onUpload={handleUpload}
      />

      {/* 中间：智能对话区 */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">制度万事通</h1>
            <p className="text-sm text-muted-foreground">基于 RAG 技术的公司制度智能问答</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClearChat}>
            <Trash2 className="mr-2 size-4" />
            清除对话
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onCite={setSelectedCitation}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {quickQuestions.length > 0 && (
          <div className="border-t bg-muted/30 px-4 py-3">
            <div className="mx-auto max-w-3xl">
              <div className="mb-2 text-xs text-muted-foreground">常用问题</div>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((q) => (
                  <Button key={q} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setInput(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="border-t p-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex gap-2">
              <Input
                placeholder="输入您想咨询的制度问题..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                className="flex-1"
                disabled={isLoading}
              />
              <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：原文溯源 */}
      <CitationPanel selected={selectedCitation} />
    </div>
  )
}

function PolicySidebar(props: {
  categories: CategoryItem[]
  filesByCategory: Record<string, KnowledgeFile[]>
  uploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onUpload: (f: File) => void
}) {
  const { categories, filesByCategory, uploading, fileInputRef, onUpload } = props
  return (
    <div className="hidden w-[280px] flex-shrink-0 border-r bg-muted/30 lg:block">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-sm font-semibold">知识库目录</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            上传
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4">
            {categories.length === 0 && (
              <div className="text-xs text-muted-foreground">暂无文件，请先上传 Markdown 制度。</div>
            )}
            {categories.map((cat) => (
              <div key={cat.category} className="mb-6">
                <div className="mb-2 flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" />
                  <span className="text-sm font-medium">
                    {cat.category}
                    <span className="ml-1 text-xs text-muted-foreground">({cat.file_count})</span>
                  </span>
                </div>
                <div className="space-y-1 pl-6">
                  {(filesByCategory[cat.category] || []).map((file) => (
                    <div
                      key={file.id}
                      className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      title={file.name}
                    >
                      <FileText className="size-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-muted-foreground group-hover:text-foreground">
                        {file.name}
                      </span>
                      <Badge variant="secondary" className="hidden text-[10px] group-hover:inline-flex">
                        <Clock className="mr-1 size-2.5" />
                        {file.updated_at.slice(0, 10)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onCite,
}: {
  message: Message
  onCite: (c: PolicyCitation) => void
}) {
  return (
    <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-3",
          message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {message.stage && !message.content && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {STAGE_LABELS[message.stage] || message.stage}
          </div>
        )}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {message.content.split("\n").map((line, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {line.split(/\[(\d+)\]/).map((part, j) => {
                if (/^\d+$/.test(part)) {
                  const cid = parseInt(part)
                  const cit = message.citations?.find((c) => c.id === cid)
                  return cit ? (
                    <button
                      key={j}
                      onClick={() => onCite(cit)}
                      className={cn(
                        "mx-0.5 inline-flex size-5 items-center justify-center rounded text-xs font-medium transition-colors",
                        message.role === "user"
                          ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
                          : "bg-primary/10 text-primary hover:bg-primary/20"
                      )}
                    >
                      {cid}
                    </button>
                  ) : (
                    `[${part}]`
                  )
                }
                return part
              })}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

function CitationPanel({ selected }: { selected: PolicyCitation | null }) {
  return (
    <div className="hidden w-[320px] flex-shrink-0 border-l bg-muted/30 xl:block">
      <div className="flex h-full flex-col">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold">参考来源</h2>
          <p className="mt-1 text-xs text-muted-foreground">点击对话中的引用标签查看原文</p>
        </div>
        <ScrollArea className="flex-1">
          {selected ? (
            <div className="p-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Badge className="size-5 justify-center p-0 text-xs">{selected.id}</Badge>
                    <CardTitle className="text-sm font-medium">引用来源</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="size-3.5" />
                    <span>{selected.source}</span>
                  </div>
                  <Separator />
                  <div className="rounded-md bg-accent/50 p-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.text}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    相似度：{selected.score.toFixed(3)}
                    {selected.page != null && ` ｜ 第 ${selected.page} 页`}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <div className="text-center text-sm text-muted-foreground">
                <BookOpen className="mx-auto mb-2 size-8 opacity-50" />
                <p>点击对话中的引用标签</p>
                <p>查看原文内容</p>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
