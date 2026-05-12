"use client"

import * as React from "react"
import { Send, Trash2, BookOpen, Upload, FileText, Loader2, MoreHorizontal, Pencil, Eye, Code2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { apiGet, apiGetText, apiPost, apiUpload, apiPatch, apiDelete, streamSse } from "@/lib/api"
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
  // 使用 container ref 直接控制滚动，比 scrollIntoView 在自定义 ScrollArea 内更可靠
  const messagesContainerRef = React.useRef<HTMLDivElement>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const el = messagesContainerRef.current
    if (el) {
      // 每次消息列表变化时，立即滚动到底部
      el.scrollTop = el.scrollHeight
    }
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* 左侧：知识库目录 */}
      <PolicySidebar
        categories={categories}
        filesByCategory={filesByCategory}
        onRefresh={refreshKnowledge}
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

        {/* 用普通 div overflow-y-auto 代替 ScrollArea，确保 scrollTop 控制生效 */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onCite={setSelectedCitation}
              />
            ))}
          </div>
        </div>

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

// ─── 上传 / 重命名 / 删除 / 查看 均在此组件内管理状态 ───────────────────────────
function PolicySidebar({
  categories,
  filesByCategory,
  onRefresh,
}: {
  categories: CategoryItem[]
  filesByCategory: Record<string, KnowledgeFile[]>
  onRefresh: () => void
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // ── 上传弹窗 ──────────────────────────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [uploadMode, setUploadMode] = React.useState<"file" | "text">("file")
  // 上传文件模式
  const [uploadFile, setUploadFile] = React.useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = React.useState("")
  const [uploadNewCat, setUploadNewCat] = React.useState("")
  const [uploadName, setUploadName] = React.useState("")
  // 在线录入模式
  const [textName, setTextName] = React.useState("")
  const [textCategory, setTextCategory] = React.useState("")
  const [textNewCat, setTextNewCat] = React.useState("")
  const [textContent, setTextContent] = React.useState("")
  const [uploading, setUploading] = React.useState(false)

  // ── 重命名弹窗（分类 & 文件共用）────────────────────────────────────────
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [renameTarget, setRenameTarget] = React.useState<{
    type: "category" | "file"; id?: string; current: string
  } | null>(null)
  const [renameDraft, setRenameDraft] = React.useState("")
  const [renaming, setRenaming] = React.useState(false)

  // ── 删除确认弹窗（分类 & 文件共用）─────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<{
    type: "category" | "file"; id?: string; name: string; count?: number
  } | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // ── 文件详情弹窗（含原文内容）───────────────────────────────────────────
  const [viewFile, setViewFile] = React.useState<KnowledgeFile | null>(null)
  const [viewContent, setViewContent] = React.useState<string | null>(null)
  const [viewContentLoading, setViewContentLoading] = React.useState(false)

  // 每次打开查看弹窗时自动拉取原始 Markdown 内容
  React.useEffect(() => {
    if (!viewFile) { setViewContent(null); return }
    setViewContentLoading(true)
    apiGetText(`/api/v1/policy/files/${viewFile.id}/content`)
      .then((text) => setViewContent(text))
      .catch(() => setViewContent("（内容加载失败，物理文件可能不存在）"))
      .finally(() => setViewContentLoading(false))
  }, [viewFile])

  // 上传时实际使用的分类：若选"新建"则取文本框内容
  const effectiveCategory =
    uploadCategory === "__new__" ? uploadNewCat.trim() : uploadCategory
  const effectiveTextCategory =
    textCategory === "__new__" ? textNewCat.trim() : textCategory

  const resetUploadDialog = () => {
    setUploadMode("file")
    setUploadFile(null); setUploadCategory(""); setUploadNewCat(""); setUploadName("")
    setTextName(""); setTextCategory(""); setTextNewCat(""); setTextContent("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ── 处理：上传文件 ───────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile || !effectiveCategory) return
    const fd = new FormData()
    fd.append("file", uploadFile)
    fd.append("category", effectiveCategory)
    fd.append("access_level", "public")
    if (uploadName.trim()) fd.append("name", uploadName.trim())
    setUploading(true)
    try {
      await apiUpload("/api/v1/policy/files", fd)
      setUploadOpen(false)
      resetUploadDialog()
      onRefresh()
    } catch (e: any) {
      alert(`上传失败：${e?.message || e}`)
    } finally {
      setUploading(false)
    }
  }

  // ── 处理：在线录入 Markdown 创建文档 ────────────────────────────────────
  const handleCreateFromText = async () => {
    if (!textName.trim() || !effectiveTextCategory || !textContent.trim()) return
    setUploading(true)
    try {
      await apiPost("/api/v1/policy/files/text", {
        name: textName.trim(),
        category: effectiveTextCategory,
        content: textContent,
        access_level: "public",
      })
      setUploadOpen(false)
      resetUploadDialog()
      onRefresh()
    } catch (e: any) {
      alert(`创建失败：${e?.message || e}`)
    } finally {
      setUploading(false)
    }
  }

  // ── 处理：重命名（分类 / 文件）──────────────────────────────────────────
  const handleRename = async () => {
    if (!renameTarget || !renameDraft.trim()) return
    setRenaming(true)
    try {
      if (renameTarget.type === "category") {
        await apiPatch(
          `/api/v1/policy/categories/${encodeURIComponent(renameTarget.current)}`,
          { new_name: renameDraft.trim() }
        )
      } else {
        await apiPatch(`/api/v1/policy/files/${renameTarget.id}`, { name: renameDraft.trim() })
      }
      setRenameOpen(false)
      onRefresh()
    } catch (e: any) {
      alert(`重命名失败：${e?.message || e}`)
    } finally {
      setRenaming(false)
    }
  }

  // ── 处理：删除（分类 / 文件）────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.type === "category") {
        await apiDelete(`/api/v1/policy/categories/${encodeURIComponent(deleteTarget.name)}`)
      } else {
        await apiDelete(`/api/v1/policy/files/${deleteTarget.id}`)
      }
      setDeleteOpen(false)
      onRefresh()
    } catch (e: any) {
      alert(`删除失败：${e?.message || e}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="hidden w-[280px] flex-shrink-0 border-r bg-muted/30 lg:block">
      <div className="flex h-full flex-col">

        {/* ── 顶部栏 ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-sm font-semibold">知识库目录</h2>
          <Button
            size="sm" variant="outline" className="h-8 gap-1.5"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="size-3.5" />上传
          </Button>
        </div>

        {/* ── 分类 & 文件列表 ──────────────────────────────────────────── */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground">
                暂无文件，请点击「上传」添加 Markdown 制度文档。
              </p>
            )}
            {categories.map((cat) => (
              <div key={cat.category} className="mb-5">

                {/* 分类标题行 */}
                <div className="group mb-1.5 flex items-center gap-1.5">
                  <BookOpen className="size-4 flex-shrink-0 text-primary" />
                  <span className="flex-1 text-sm font-medium leading-none">
                    {cat.category}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({cat.file_count})
                    </span>
                  </span>
                  {/* 分类操作菜单 */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost" size="icon"
                        className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget({ type: "category", current: cat.category })
                          setRenameDraft(cat.category)
                          setRenameOpen(true)
                        }}
                      >
                        <Pencil className="mr-2 size-3.5" />重命名
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          setDeleteTarget({
                            type: "category",
                            name: cat.category,
                            count: cat.file_count,
                          })
                          setDeleteOpen(true)
                        }}
                      >
                        <Trash2 className="mr-2 size-3.5" />删除分类
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* 文件列表 */}
                <div className="space-y-0.5 pl-5">
                  {(filesByCategory[cat.category] || []).map((file) => (
                    <div
                      key={file.id}
                      className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent"
                    >
                      <FileText className="size-3.5 flex-shrink-0 text-muted-foreground" />
                      <span
                        className="flex-1 truncate text-xs text-muted-foreground group-hover:text-foreground"
                        title={file.name}
                      >
                        {file.name}
                      </span>
                      {/* 文件操作菜单 */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost" size="icon"
                            className="h-5 w-5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <MoreHorizontal className="size-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => setViewFile(file)}>
                            <Eye className="mr-2 size-3.5" />查看详情
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameTarget({ type: "file", id: file.id, current: file.name })
                              setRenameDraft(file.name)
                              setRenameOpen(true)
                            }}
                          >
                            <Pencil className="mr-2 size-3.5" />重命名
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setDeleteTarget({ type: "file", id: file.id, name: file.name })
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="mr-2 size-3.5" />删除文件
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ══ 上传弹窗（上传文件 / 在线录入 两个 Tab）════════════════════════════ */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) resetUploadDialog() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增制度文档</DialogTitle>
            <DialogDescription>支持上传 Markdown 文件，或直接在线录入内容；提交后自动完成向量入库。</DialogDescription>
          </DialogHeader>

          <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "file" | "text")} className="mt-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file"><Upload className="mr-1.5 size-3.5" />上传文件</TabsTrigger>
              <TabsTrigger value="text"><Code2 className="mr-1.5 size-3.5" />在线录入</TabsTrigger>
            </TabsList>

            {/* ── Tab：上传文件 ── */}
            <TabsContent value="file" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>选择文件 <span className="text-destructive">*</span></Label>
                <input
                  ref={fileInputRef} type="file" accept=".md,.markdown"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) { setUploadFile(f); if (!uploadName) setUploadName(f.name) }
                  }}
                />
                <Button
                  variant="outline" className="w-full justify-start font-normal"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 size-4 text-muted-foreground" />
                  {uploadFile ? uploadFile.name : "点击选择文件（.md / .markdown）…"}
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label>所属分类 <span className="text-destructive">*</span></Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger><SelectValue placeholder="请选择分类" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.category} value={c.category}>{c.category}</SelectItem>
                    ))}
                    <SelectItem value="__new__">＋ 新建分类…</SelectItem>
                  </SelectContent>
                </Select>
                {uploadCategory === "__new__" && (
                  <Input placeholder="输入新分类名称" value={uploadNewCat} onChange={(e) => setUploadNewCat(e.target.value)} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>显示名称<span className="ml-1 text-xs text-muted-foreground">（可选，留空使用文件名）</span></Label>
                <Input placeholder={uploadFile?.name || ""} value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
              </div>
            </TabsContent>

            {/* ── Tab：在线录入 ── */}
            <TabsContent value="text" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>文档名称 <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="例：员工手册 v4.0（无需写 .md 后缀）"
                  value={textName}
                  onChange={(e) => setTextName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>所属分类 <span className="text-destructive">*</span></Label>
                <Select value={textCategory} onValueChange={setTextCategory}>
                  <SelectTrigger><SelectValue placeholder="请选择分类" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.category} value={c.category}>{c.category}</SelectItem>
                    ))}
                    <SelectItem value="__new__">＋ 新建分类…</SelectItem>
                  </SelectContent>
                </Select>
                {textCategory === "__new__" && (
                  <Input placeholder="输入新分类名称" value={textNewCat} onChange={(e) => setTextNewCat(e.target.value)} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Markdown 内容 <span className="text-destructive">*</span></Label>
                <Textarea
                  placeholder={"# 文档标题\n\n## 第一章 总则\n\n在此输入制度正文…"}
                  className="h-48 resize-none font-mono text-xs"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                />
                <p className="text-right text-xs text-muted-foreground">{textContent.length} 字</p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>取消</Button>
            {uploadMode === "file" ? (
              <Button disabled={!uploadFile || !effectiveCategory || uploading} onClick={handleUpload}>
                {uploading && <Loader2 className="mr-2 size-4 animate-spin" />}上传
              </Button>
            ) : (
              <Button
                disabled={!textName.trim() || !effectiveTextCategory || !textContent.trim() || uploading}
                onClick={handleCreateFromText}
              >
                {uploading && <Loader2 className="mr-2 size-4 animate-spin" />}创建文档
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 重命名弹窗（分类 & 文件共用）════════════════════════════════════ */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {renameTarget?.type === "category" ? "重命名分类" : "重命名文件"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename() }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>取消</Button>
            <Button disabled={!renameDraft.trim() || renaming} onClick={handleRename}>
              {renaming && <Loader2 className="mr-2 size-4 animate-spin" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 删除确认弹窗 ════════════════════════════════════════════════════ */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "category" ? "删除分类" : "删除文件"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "category"
                ? `确认删除「${deleteTarget.name}」分类及其下 ${deleteTarget.count} 个文件？所有向量数据将被清除，此操作不可撤销。`
                : `确认删除「${deleteTarget?.name}」？该文件的所有向量数据将被清除，此操作不可撤销。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ 文件详情弹窗（详情 + 原文 两个 Tab）════════════════════════════ */}
      <Dialog open={!!viewFile} onOpenChange={(o) => { if (!o) { setViewFile(null); setViewContent(null) } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{viewFile?.name ?? "文件详情"}</DialogTitle>
          </DialogHeader>
          {viewFile && (
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info"><FileText className="mr-1.5 size-3.5" />文件详情</TabsTrigger>
                <TabsTrigger value="content"><Code2 className="mr-1.5 size-3.5" />原文内容</TabsTrigger>
              </TabsList>

              {/* ── Tab：文件详情 ── */}
              <TabsContent value="info" className="mt-3 space-y-2.5 text-sm">
                {[
                  ["文件名", viewFile.name],
                  ["所属分类", viewFile.category],
                  ["状态", viewFile.status],
                  ["向量片段数", String(viewFile.chunk_count)],
                  ["文件大小", `${(viewFile.size_bytes / 1024).toFixed(1)} KB`],
                  ["创建时间", viewFile.created_at.slice(0, 10)],
                  ["更新时间", viewFile.updated_at.slice(0, 10)],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="flex-shrink-0 text-muted-foreground">{label}</span>
                    <span className="text-right font-medium">{val}</span>
                  </div>
                ))}
              </TabsContent>

              {/* ── Tab：原文内容 ── */}
              <TabsContent value="content" className="mt-3">
                {viewContentLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">加载原文…</span>
                  </div>
                ) : (
                  <Textarea
                    readOnly
                    className="h-[420px] resize-none font-mono text-xs leading-relaxed"
                    value={viewContent ?? ""}
                  />
                )}
                {viewContent && !viewContentLoading && (
                  <p className="mt-1.5 text-right text-xs text-muted-foreground">{viewContent.length} 字符</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
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
