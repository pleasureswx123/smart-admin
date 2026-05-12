"use client"

import * as React from "react"
import {
  FileText,
  Sparkles,
  Download,
  Copy,
  AlertTriangle,
  CheckCircle,
  Info,
  Tag,
  X,
  Loader2,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { apiGet, apiPost, apiPatch, apiDelete, streamSse } from "@/lib/api"
import type {
  AuditItem,
  DocTemplate,
  DocTone,
  DocTypeItem,
  ExportPdfResponse,
} from "@/lib/api-types"

const toneOptions: { value: DocTone; label: string; description: string }[] = [
  { value: "formal", label: "正式", description: "官方正式语气" },
  { value: "friendly", label: "温馨", description: "亲切友好语气" },
  { value: "strict", label: "严厉", description: "严肃警示语气" },
]

export default function DocumentPage() {
  // ── 文档类型（动态从后端加载） ────────────────────────────────────────────
  const [docTypes, setDocTypes] = React.useState<DocTypeItem[]>([])
  const [activeTab, setActiveTab] = React.useState<string>("")
  // 按 type 分组存储模板
  const [templates, setTemplates] = React.useState<Record<string, DocTemplate[]>>({})

  // ── AI 生成相关 state ─────────────────────────────────────────────────────
  const [selectedTemplate, setSelectedTemplate] = React.useState<string | null>(null)
  const [topic, setTopic] = React.useState("")
  const [keywords, setKeywords] = React.useState<string[]>([])
  const [keywordInput, setKeywordInput] = React.useState("")
  const [tone, setTone] = React.useState<DocTone>("formal")
  const [content, setContent] = React.useState("")
  const [audits, setAudits] = React.useState<AuditItem[]>([])
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [stage, setStage] = React.useState<string>("")
  const [round, setRound] = React.useState(0)
  const [draftId, setDraftId] = React.useState<string | null>(null)
  const [exporting, setExporting] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)

  // ── 类型管理弹窗 ──────────────────────────────────────────────────────────
  const [typeDialogOpen, setTypeDialogOpen] = React.useState(false)
  const [typeDialogMode, setTypeDialogMode] = React.useState<"add" | "rename">("add")
  const [typeDialogTarget, setTypeDialogTarget] = React.useState("") // 被重命名的旧名
  const [typeDialogValue, setTypeDialogValue] = React.useState("")
  const [typeDialogLoading, setTypeDialogLoading] = React.useState(false)

  // ── 模板管理弹窗 ──────────────────────────────────────────────────────────
  const [tplDialogOpen, setTplDialogOpen] = React.useState(false)
  const [tplDialogMode, setTplDialogMode] = React.useState<"view" | "create" | "edit">("view")
  const [tplDialogTarget, setTplDialogTarget] = React.useState<DocTemplate | null>(null)
  const [tplDialogName, setTplDialogName] = React.useState("")
  const [tplDialogDesc, setTplDialogDesc] = React.useState("")
  const [tplDialogBody, setTplDialogBody] = React.useState("")
  const [tplDialogLoading, setTplDialogLoading] = React.useState(false)

  // ── 初始化数据加载 ────────────────────────────────────────────────────────
  const loadData = React.useCallback(async () => {
    try {
      const [types, allTpls] = await Promise.all([
        apiGet<DocTypeItem[]>("/api/v1/document/types"),
        apiGet<DocTemplate[]>("/api/v1/document/templates"),
      ])
      setDocTypes(types)
      // 按 type 分组
      const grouped: Record<string, DocTemplate[]> = {}
      for (const tpl of allTpls) {
        if (!grouped[tpl.type]) grouped[tpl.type] = []
        grouped[tpl.type].push(tpl)
      }
      setTemplates(grouped)
      // 首次加载时设置默认 tab
      setActiveTab((prev) => prev || (types[0]?.type ?? ""))
    } catch (e) {
      console.error("doc.data.load_failed", e)
    }
  }, [])

  React.useEffect(() => {
    loadData()
    return () => abortRef.current?.abort()
  }, [loadData])

  // ── 类型管理操作 ──────────────────────────────────────────────────────────
  const openAddType = () => {
    setTypeDialogMode("add")
    setTypeDialogValue("")
    setTypeDialogOpen(true)
  }

  const openRenameType = (typeName: string) => {
    setTypeDialogMode("rename")
    setTypeDialogTarget(typeName)
    setTypeDialogValue(typeName)
    setTypeDialogOpen(true)
  }

  const handleTypeDialogSubmit = async () => {
    const newName = typeDialogValue.trim()
    if (!newName) return
    setTypeDialogLoading(true)
    try {
      if (typeDialogMode === "rename") {
        await apiPatch(`/api/v1/document/types/${encodeURIComponent(typeDialogTarget)}`, { new_name: newName })
        if (activeTab === typeDialogTarget) setActiveTab(newName)
      } else {
        // 新建类型：同时创建一个初始模板（占位）
        await apiPost("/api/v1/document/templates", {
          type: newName,
          name: "默认模板",
          description: "请编辑此模板内容",
          body: `# ${newName}模板\n\n请在此填写正文内容。`,
          is_system: false,
        })
        setActiveTab(newName)
      }
      setTypeDialogOpen(false)
      await loadData()
    } catch (e: any) {
      alert(`操作失败：${e?.detail || e?.message || e}`)
    } finally {
      setTypeDialogLoading(false)
    }
  }

  const handleDeleteType = async (typeName: string) => {
    if (!confirm(`确定删除类型「${typeName}」及其下所有模板？此操作不可恢复。`)) return
    try {
      await apiDelete(`/api/v1/document/types/${encodeURIComponent(typeName)}`)
      if (activeTab === typeName) setActiveTab(docTypes.find((t) => t.type !== typeName)?.type ?? "")
      await loadData()
    } catch (e: any) {
      alert(`删除失败：${e?.detail || e?.message || e}`)
    }
  }

  // ── 模板管理操作 ──────────────────────────────────────────────────────────
  const openViewTemplate = (tpl: DocTemplate) => {
    setTplDialogMode("view")
    setTplDialogTarget(tpl)
    setTplDialogName(tpl.name)
    setTplDialogDesc(tpl.description)
    setTplDialogBody(tpl.body)
    setTplDialogOpen(true)
  }

  const openCreateTemplate = (forType: string) => {
    setTplDialogMode("create")
    setTplDialogTarget({ id: "", type: forType, name: "", description: "", body: "", is_system: false })
    setTplDialogName("")
    setTplDialogDesc("")
    setTplDialogBody("")
    setTplDialogOpen(true)
  }

  const openEditTemplate = (tpl: DocTemplate) => {
    setTplDialogMode("edit")
    setTplDialogTarget(tpl)
    setTplDialogName(tpl.name)
    setTplDialogDesc(tpl.description)
    setTplDialogBody(tpl.body)
    setTplDialogOpen(true)
  }

  const handleTplDialogSubmit = async () => {
    if (!tplDialogName.trim() || !tplDialogBody.trim()) {
      alert("模板名称和正文不能为空")
      return
    }
    setTplDialogLoading(true)
    try {
      if (tplDialogMode === "create") {
        await apiPost("/api/v1/document/templates", {
          type: tplDialogTarget!.type,
          name: tplDialogName.trim(),
          description: tplDialogDesc.trim(),
          body: tplDialogBody,
        })
      } else if (tplDialogMode === "edit") {
        await apiPatch(`/api/v1/document/templates/${tplDialogTarget!.id}`, {
          name: tplDialogName.trim(),
          description: tplDialogDesc.trim(),
          body: tplDialogBody,
        })
      }
      setTplDialogOpen(false)
      await loadData()
    } catch (e: any) {
      alert(`操作失败：${e?.detail || e?.message || e}`)
    } finally {
      setTplDialogLoading(false)
    }
  }

  const handleDeleteTemplate = async (tpl: DocTemplate) => {
    if (!confirm(`确定删除模板「${tpl.name}」？此操作不可恢复。`)) return
    try {
      await apiDelete(`/api/v1/document/templates/${tpl.id}`)
      if (selectedTemplate === tpl.id) setSelectedTemplate(null)
      await loadData()
    } catch (e: any) {
      alert(`删除失败：${e?.detail || e?.message || e}`)
    }
  }

  // ── AI 生成操作 ───────────────────────────────────────────────────────────
  const handleAddKeyword = () => {
    const w = keywordInput.trim()
    if (w && !keywords.includes(w)) setKeywords([...keywords, w])
    setKeywordInput("")
  }

  const handleGenerate = async () => {
    if (!topic.trim() || isGenerating) return
    setContent("")
    setAudits([])
    setRound(0)
    setDraftId(null)
    setStage("writer")
    setIsGenerating(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const stream = streamSse(
        "/api/v1/document/draft",
        {
          type: activeTab,
          template_id: selectedTemplate,
          topic: topic.trim(),
          keywords,
          tone,
        },
        ctrl.signal
      )
      let acc = ""
      for await (const ev of stream) {
        if (ev.event === "stage") {
          setStage(`${ev.data?.node || ""}:${ev.data?.status || ""}`)
          if (ev.data?.node === "writer" && ev.data?.status === "loading") {
            acc = ""
            setContent("")
          }
          if (ev.data?.round) setRound(ev.data.round)
        } else if (ev.event === "token") {
          acc += ev.data?.delta || ""
          setContent(acc)
        } else if (ev.event === "audit") {
          setAudits((ev.data?.items || []) as AuditItem[])
          setRound(ev.data?.round || round)
        } else if (ev.event === "done") {
          if (ev.data?.draft_id) setDraftId(ev.data.draft_id)
          setStage("")
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        alert(`生成失败：${e?.message || e}`)
      }
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }

  const handleAuditOnly = async () => {
    if (!content.trim()) return
    setIsGenerating(true)
    try {
      const res = await apiPost<{ audit_feedback: AuditItem[]; passed: boolean }>(
        "/api/v1/document/audit",
        { type: activeTab, content }
      )
      setAudits(res.audit_feedback)
    } catch (e: any) {
      alert(`审计失败：${e?.message || e}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleExportPdf = async () => {
    if (!draftId) {
      alert("请先生成草稿")
      return
    }
    setExporting(true)
    try {
      const res = await apiPost<ExportPdfResponse>(
        `/api/v1/document/${draftId}/export-pdf`
      )
      window.open(res.download_url, "_blank")
    } catch (e: any) {
      alert(`导出失败：${e?.message || e}`)
    } finally {
      setExporting(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ── 顶部：类型 Tab + 模板卡片 ─────────────────────────────────────── */}
      <div className="border-b bg-muted/30 px-6 py-3">
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedTemplate(null) }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-lg font-semibold">公文 Copilot</h1>
              <p className="text-sm text-muted-foreground">AI 驱动的智能公文写作助手</p>
            </div>
            <div className="flex items-center gap-2">
              <TabsList>
                {docTypes.map((dt) => (
                  <TabsTrigger key={dt.type} value={dt.type} className="group relative pr-7">
                    {dt.type}
                    {/* 类型操作菜单 */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span
                          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-muted"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openRenameType(dt.type)}>
                          <Pencil className="mr-2 size-3.5" />重命名
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteType(dt.type)}
                        >
                          <Trash2 className="mr-2 size-3.5" />删除类型
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button variant="outline" size="sm" className="gap-1" onClick={openAddType}>
                <Plus className="size-4" />新建类型
              </Button>
            </div>
          </div>

          {docTypes.map((dt) => (
            <TabsContent key={dt.type} value={dt.type} className="mt-2">
              <div className="flex flex-wrap items-center gap-2">
                {(templates[dt.type] || []).map((tpl) => (
                  <div
                    key={tpl.id}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm cursor-pointer transition-all hover:border-primary/60 hover:bg-primary/5",
                      selectedTemplate === tpl.id && "border-primary bg-primary/5 font-medium"
                    )}
                    onClick={() => setSelectedTemplate(tpl.id)}
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="max-w-[140px] truncate">{tpl.name}</span>
                    {/* 模板操作菜单 */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="ml-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted p-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openViewTemplate(tpl) }}>
                          <Eye className="mr-2 size-3.5" />查看内容
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditTemplate(tpl) }}>
                          <Pencil className="mr-2 size-3.5" />编辑
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl) }}
                        >
                          <Trash2 className="mr-2 size-3.5" />删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
                {/* 新建模板：小入口按钮 */}
                <button
                  className="flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                  onClick={() => openCreateTemplate(dt.type)}
                >
                  <Plus className="size-3" />新建模板
                </button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* ── 主区域 ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左：指令配置 */}
        <div className="w-[400px] flex-shrink-0 border-r">
          <ScrollArea className="h-full">
            <div className="space-y-6 p-6">
              <div className="space-y-2">
                <Label htmlFor="topic">公文主题</Label>
                <Input id="topic" placeholder="例如：关于办公区禁烟的通知" value={topic} onChange={(e) => setTopic(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>关键词</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="输入关键词后回车"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddKeyword() } }}
                  />
                  <Button variant="outline" size="icon" onClick={handleAddKeyword}><Tag className="size-4" /></Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {keywords.map((k) => (
                      <Badge key={k} variant="secondary" className="gap-1">
                        {k}
                        <button onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="ml-1 rounded-full hover:bg-muted">
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>语气选择</Label>
                <div className="flex gap-2">
                  {toneOptions.map((option) => (
                    <Badge key={option.value} variant={tone === option.value ? "default" : "outline"} className="cursor-pointer px-4 py-2" onClick={() => setTone(option.value)}>
                      {option.label}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{toneOptions.find((t) => t.value === tone)?.description}</p>
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button className="flex-1 gap-2" onClick={handleGenerate} disabled={isGenerating || !topic.trim()}>
                  {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  开始起草
                </Button>
                <Button variant="outline" className="flex-1 gap-2" onClick={handleAuditOnly} disabled={isGenerating || !content.trim()}>
                  仅审计
                </Button>
              </div>

              {(stage || round > 0) && (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  <div>当前阶段：{stage || "—"}</div>
                  <div>反思轮次：{round}</div>
                  {draftId && <div>草稿 ID：{draftId.slice(0, 8)}…</div>}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* 右：预览 + 审计 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden border-b">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="text-sm font-medium">内容预览（Markdown）</span>
                <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!content}>
                  <Copy className="mr-1 size-3.5" />复制
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {!content && !isGenerating ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="text-center text-muted-foreground">
                        <FileText className="mx-auto mb-4 size-12 opacity-30" />
                        <p>填写左侧配置信息</p>
                        <p className="text-sm">点击"开始起草"生成公文</p>
                      </div>
                    </div>
                  ) : (
                    <Textarea value={content} onChange={(e) => setContent(e.target.value)}
                      className="min-h-[400px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
                      placeholder={isGenerating ? "AI 正在生成…" : ""} />
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="h-[200px] flex-shrink-0 overflow-hidden">
            <div className="flex h-full flex-col">
              <div className="flex items-center border-b px-4 py-2">
                <span className="text-sm font-medium">AI 审计反馈</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-3 p-4">
                  {audits.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-center text-sm text-muted-foreground">生成公文后将显示审计结果</div>
                  ) : (
                    audits.map((feedback, i) => (
                      <Alert key={i} variant={feedback.type === "warning" ? "destructive" : "default"}
                        className={cn(feedback.type === "success" && "border-green-500/50 bg-green-500/10", feedback.type === "info" && "border-blue-500/50 bg-blue-500/10")}>
                        {feedback.type === "success" && <CheckCircle className="size-4 text-green-500" />}
                        {feedback.type === "info" && <Info className="size-4 text-blue-500" />}
                        {feedback.type === "warning" && <AlertTriangle className="size-4" />}
                        <AlertTitle className="text-sm">{feedback.title}</AlertTitle>
                        <AlertDescription className="text-xs">{feedback.description}</AlertDescription>
                      </Alert>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t bg-muted/30 px-4 py-3">
            <Button variant="outline" size="sm" disabled={!draftId || exporting} onClick={handleExportPdf}>
              {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              导出 PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!content}>
              <Copy className="mr-2 size-4" />复制
            </Button>
          </div>
        </div>
      </div>

      {/* ── 类型管理弹窗 ────────────────────────────────────────────────── */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{typeDialogMode === "add" ? "新建文档类型" : "重命名文档类型"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {typeDialogMode === "rename" && (
              <p className="text-sm text-muted-foreground">当前类型：{typeDialogTarget}</p>
            )}
            <div className="space-y-1.5">
              <Label>{typeDialogMode === "add" ? "类型名称" : "新名称"}</Label>
              <Input
                placeholder="如：法律文书"
                value={typeDialogValue}
                onChange={(e) => setTypeDialogValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleTypeDialogSubmit() }}
                autoFocus
              />
            </div>
            {typeDialogMode === "add" && (
              <p className="text-xs text-muted-foreground">创建类型时将自动生成一个默认占位模板，你可以稍后编辑它。</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>取消</Button>
            <Button onClick={handleTypeDialogSubmit} disabled={typeDialogLoading || !typeDialogValue.trim()}>
              {typeDialogLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 模板查看/创建/编辑弹窗 ──────────────────────────────────────── */}
      <Dialog open={tplDialogOpen} onOpenChange={setTplDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {tplDialogMode === "view" ? `查看模板：${tplDialogTarget?.name}` : tplDialogMode === "create" ? "新建模板" : "编辑模板"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {tplDialogMode !== "view" && (
              <>
                <div className="space-y-1.5">
                  <Label>模板名称 <span className="text-destructive">*</span></Label>
                  <Input placeholder="如：通用通知模板" value={tplDialogName} onChange={(e) => setTplDialogName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>简要描述</Label>
                  <Input placeholder="一句话说明用途" value={tplDialogDesc} onChange={(e) => setTplDialogDesc(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>
                Markdown 正文 {tplDialogMode !== "view" && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                placeholder="在此输入 Markdown 格式的模板正文..."
                value={tplDialogBody}
                onChange={(e) => setTplDialogBody(e.target.value)}
                readOnly={tplDialogMode === "view"}
                className={cn(
                  "min-h-[340px] resize-none font-mono text-sm",
                  tplDialogMode === "view" && "bg-muted cursor-default"
                )}
              />
            </div>
          </div>
          <DialogFooter>
            {tplDialogMode === "view" ? (
              <>
                <Button variant="outline" onClick={() => { openEditTemplate(tplDialogTarget!); }}>
                  <Pencil className="mr-2 size-3.5" />编辑
                </Button>
                <Button onClick={() => setTplDialogOpen(false)}>关闭</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setTplDialogOpen(false)}>取消</Button>
                <Button onClick={handleTplDialogSubmit} disabled={tplDialogLoading}>
                  {tplDialogLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {tplDialogMode === "create" ? "创建" : "保存"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
