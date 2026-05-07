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
import { cn } from "@/lib/utils"
import { apiGet, apiPost, streamSse } from "@/lib/api"
import type {
  AuditItem,
  DocTemplate,
  DocTone,
  DocType,
  ExportPdfResponse,
} from "@/lib/api-types"

const TYPE_TABS: { value: DocType; label: string }[] = [
  { value: "notice", label: "行政通知" },
  { value: "request", label: "内部请示" },
  { value: "reward", label: "处罚/奖励" },
  { value: "meeting", label: "会议纪要" },
]

const toneOptions: { value: DocTone; label: string; description: string }[] = [
  { value: "formal", label: "正式", description: "官方正式语气" },
  { value: "friendly", label: "温馨", description: "亲切友好语气" },
  { value: "strict", label: "严厉", description: "严肃警示语气" },
]

export default function DocumentPage() {
  const [activeTab, setActiveTab] = React.useState<DocType>("notice")
  const [templates, setTemplates] = React.useState<Record<DocType, DocTemplate[]>>({
    notice: [],
    request: [],
    reward: [],
    meeting: [],
  })
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

  React.useEffect(() => {
    apiGet<DocTemplate[]>("/api/v1/document/templates")
      .then((rows) => {
        const grouped: Record<DocType, DocTemplate[]> = {
          notice: [],
          request: [],
          reward: [],
          meeting: [],
        }
        for (const t of rows) {
          if (t.type in grouped) grouped[t.type as DocType].push(t)
        }
        setTemplates(grouped)
      })
      .catch((e) => console.error("doc.templates.load_failed", e))
    return () => abortRef.current?.abort()
  }, [])

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
      {/* 顶部：模板选择 */}
      <div className="border-b bg-muted/30 px-6 py-4">
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as DocType)
            setSelectedTemplate(null)
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">公文 Copilot</h1>
              <p className="text-sm text-muted-foreground">AI 驱动的智能公文写作助手</p>
            </div>
            <TabsList>
              {TYPE_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {TYPE_TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {(templates[t.value] || []).map((template) => (
                  <Card
                    key={template.id}
                    className={cn(
                      "cursor-pointer transition-all hover:border-primary/50",
                      selectedTemplate === template.id && "border-primary bg-primary/5"
                    )}
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="size-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground">{template.description}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(templates[t.value] || []).length === 0 && (
                  <div className="col-span-3 text-xs text-muted-foreground">该类型暂无模板。</div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* 主区域 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左：指令配置 */}
        <div className="w-[400px] flex-shrink-0 border-r">
          <ScrollArea className="h-full">
            <div className="space-y-6 p-6">
              <div className="space-y-2">
                <Label htmlFor="topic">公文主题</Label>
                <Input
                  id="topic"
                  placeholder="例如：关于办公区禁烟的通知"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>关键词</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="输入关键词后回车"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddKeyword()
                      }
                    }}
                  />
                  <Button variant="outline" size="icon" onClick={handleAddKeyword}>
                    <Tag className="size-4" />
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {keywords.map((k) => (
                      <Badge key={k} variant="secondary" className="gap-1">
                        {k}
                        <button
                          onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                          className="ml-1 rounded-full hover:bg-muted"
                        >
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
                    <Badge
                      key={option.value}
                      variant={tone === option.value ? "default" : "outline"}
                      className="cursor-pointer px-4 py-2"
                      onClick={() => setTone(option.value)}
                    >
                      {option.label}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {toneOptions.find((t) => t.value === tone)?.description}
                </p>
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button
                  className="flex-1 gap-2"
                  onClick={handleGenerate}
                  disabled={isGenerating || !topic.trim()}
                >
                  {isGenerating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  开始起草
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleAuditOnly}
                  disabled={isGenerating || !content.trim()}
                >
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
                  <Copy className="mr-1 size-3.5" />
                  复制
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
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="min-h-[400px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
                      placeholder={isGenerating ? "AI 正在生成…" : ""}
                    />
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
                    <div className="flex items-center justify-center py-8 text-center text-sm text-muted-foreground">
                      生成公文后将显示审计结果
                    </div>
                  ) : (
                    audits.map((feedback, i) => (
                      <Alert
                        key={i}
                        variant={feedback.type === "warning" ? "destructive" : "default"}
                        className={cn(
                          feedback.type === "success" && "border-green-500/50 bg-green-500/10",
                          feedback.type === "info" && "border-blue-500/50 bg-blue-500/10"
                        )}
                      >
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
              {exporting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
              导出 PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!content}>
              <Copy className="mr-2 size-4" />
              复制
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
