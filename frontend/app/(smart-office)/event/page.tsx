"use client"

import * as React from "react"
import {
  MapPin,
  Phone,
  Star,
  ExternalLink,
  Check,
  Loader2,
  RefreshCw,
  Users,
  Wallet,
  Building2,
  Utensils,
  TreePine,
  Drama,
  Tent,
  PartyPopper,
  Clock,
  ArrowRight,
  Download,
  AlertCircle,
  Timer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { apiGet, apiPost, streamSse } from "@/lib/api"
import type {
  ActivityTypeItem,
  CityItem,
  ExportPdfResponse,
  PlanDetail,
} from "@/lib/api-types"

const ICON_MAP: Record<string, React.ElementType> = {
  bbq: Utensils,
  outdoor: TreePine,
  script: Drama,
  camping: Tent,
  indoor: Building2,
  party: PartyPopper,
}

const SHOW_AGENT_DETAILS = false

interface AgentNode {
  id: number
  title: string
  description: string
  status: "pending" | "loading" | "success" | "retry" | "error"
  message?: string
  details?: AgentNodeDetail[]
}

interface AgentNodeDetail {
  title: string
  content?: string
  url?: string
  score?: number
}

const initialNodes: AgentNode[] = [
  { id: 1, title: "联网搜索周边地点", description: "正在搜索符合条件的场地...", status: "pending" },
  { id: 2, title: "预算匹配核验", description: "验证方案预算是否符合要求...", status: "pending" },
  { id: 3, title: "生成行程方案", description: "整合信息生成完整方案...", status: "pending" },
]

function planTabLabel(index: number) {
  if (index === 0) return "精选方案 A"
  if (index === 1) return "备选方案 B"
  return `方案 ${String.fromCharCode(65 + index)}`
}

function normalizeNodeDetails(items: unknown): AgentNodeDetail[] | undefined {
  if (!Array.isArray(items)) return undefined
  const details = items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      title: String(item.title || "未命名候选"),
      content: item.content ? String(item.content) : undefined,
      url: item.url ? String(item.url) : undefined,
      score: typeof item.score === "number" ? item.score : undefined,
    }))
  return details.length ? details : undefined
}

function normalizePlanOptions(data: any): PlanDetail[] {
  const options = Array.isArray(data?.plans) ? data.plans : [data?.plan_a, data?.plan_b]
  return options.filter((item: unknown): item is PlanDetail => !!item && typeof item === "object")
}

export default function EventPage() {
  const [participants, setParticipants] = React.useState([30])
  const [budget, setBudget] = React.useState("")
  const [city, setCity] = React.useState("")
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([])
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [nodes, setNodes] = React.useState<AgentNode[]>(initialNodes)
  const [plans, setPlans] = React.useState<PlanDetail[]>([])
  const [planId, setPlanId] = React.useState<string | null>(null)
  const [activePlan, setActivePlan] = React.useState("0")
  const [cityOptions, setCityOptions] = React.useState<CityItem[]>([])
  const [activityOptions, setActivityOptions] = React.useState<ActivityTypeItem[]>([])
  const [exporting, setExporting] = React.useState(false)
  // 初始化加载状态
  const [optionsLoading, setOptionsLoading] = React.useState(true)
  const [optionsError, setOptionsError] = React.useState<string | null>(null)
  // 生成过程耗时
  const [elapsedMs, setElapsedMs] = React.useState<number | null>(null)
  // 生成内联错误（替代 alert）
  const [generateError, setGenerateError] = React.useState<string | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  const loadOptions = React.useCallback(async () => {
    setOptionsLoading(true)
    setOptionsError(null)
    try {
      const [c, a] = await Promise.all([
        apiGet<CityItem[]>("/api/v1/event/cities"),
        apiGet<ActivityTypeItem[]>("/api/v1/event/activity-types"),
      ])
      setCityOptions(c)
      setActivityOptions(a)
    } catch (e: any) {
      setOptionsError(e?.message || "加载选项失败，请检查后端服务是否运行")
    } finally {
      setOptionsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadOptions()
    return () => abortRef.current?.abort()
  }, [loadOptions])

  const toggleActivityType = (id: string) => {
    setSelectedTypes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  const handleGenerate = async () => {
    if (!budget || !city || selectedTypes.length === 0 || isGenerating) return
    setIsGenerating(true)
    setGenerateError(null)
    setElapsedMs(null)
    setPlans([])
    setPlanId(null)
    setActivePlan("0")
    // 立即将 node 1 设为 loading，给用户即时视觉反馈
    setNodes(
      initialNodes.map((n) =>
        n.id === 1
          ? { ...n, status: "loading" as const, message: "正在连接 AI 服务..." }
          : { ...n, status: "pending" as const, message: undefined, details: undefined }
      )
    )

    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const stream = streamSse(
        "/api/v1/event/plan",
        {
          participants: participants[0],
          per_capita_budget: Number(budget),
          city,
          activity_types: selectedTypes,
        },
        ctrl.signal
      )
      for await (const ev of stream) {
        if (ev.event === "node") {
          // 严格对应后端 node 事件：id/status/message/title/items
          const { id, status, message, title, items } = ev.data || {}
          const details = normalizeNodeDetails(items)
          setNodes((prev) =>
            prev.map((n) =>
              n.id === id
                ? {
                    ...n,
                    status: status as AgentNode["status"],
                    message,
                    title: title || n.title,
                    details: status === "loading" ? undefined : details,
                  }
                : n
            )
          )
        } else if (ev.event === "plan") {
          // plan 事件：plans / plan_a / plan_b / plan_id
          setPlans(normalizePlanOptions(ev.data))
          setActivePlan("0")
          if (ev.data?.plan_id) setPlanId(ev.data.plan_id)
        } else if (ev.event === "done") {
          // done 事件：elapsed_ms / retries
          if (ev.data?.elapsed_ms) setElapsedMs(ev.data.elapsed_ms)
        } else if (ev.event === "error") {
          // error 事件：替代 alert，用内联错误展示
          const message = ev.data?.message || "生成失败，请重试"
          setGenerateError(message)
          setNodes((prev) =>
            prev.map((n) =>
              n.status === "loading" || n.id === 3
                ? { ...n, status: "error" as const, message, details: undefined }
                : n
            )
          )
        }
        // meta 事件（session_id/run_id）忽略，无需处理
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        const message = e?.message || "请求失败，请检查网络和后端服务"
        setGenerateError(message)
        setNodes((prev) =>
          prev.map((n) =>
            n.status === "loading" || n.id === 3
              ? { ...n, status: "error" as const, message, details: undefined }
              : n
          )
        )
      }
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }

  const handleExportPdf = async () => {
    if (!planId) return
    setExporting(true)
    try {
      const res = await apiPost<ExportPdfResponse>(`/api/v1/event/plans/${planId}/export-pdf`)
      window.open(res.download_url, "_blank")
    } catch (e: any) {
      setGenerateError(`导出 PDF 失败：${e?.message || e}`)
    } finally {
      setExporting(false)
    }
  }

  const activePlanIndex = Number(activePlan)
  const currentPlan = plans[Number.isFinite(activePlanIndex) ? activePlanIndex : 0]
  const showPlan = plans.length > 0 && !!currentPlan

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 min-w-0 overflow-hidden">
      {/* 左：需求配置 */}
      <div className="min-h-0 w-[320px] flex-shrink-0 border-r">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b p-4">
            <h1 className="text-lg font-semibold">团建策划师</h1>
            <p className="text-sm text-muted-foreground">AI 智能生成团建方案</p>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 p-4">

              {/* 选项加载中/加载失败状态 */}
              {optionsLoading && (
                <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  正在加载城市和活动类型...
                </div>
              )}
              {optionsError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs">
                  <div className="flex items-start gap-2 text-destructive">
                    <AlertCircle className="mt-0.5 size-3.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium">选项加载失败</div>
                      <div className="mt-0.5 text-muted-foreground">{optionsError}</div>
                    </div>
                  </div>
                  <button
                    onClick={loadOptions}
                    className="mt-2 text-xs text-primary underline underline-offset-2 hover:opacity-80"
                  >
                    点击重试
                  </button>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    参与人数
                  </Label>
                  <span className="text-sm font-medium">{participants[0]} 人</span>
                </div>
                <Slider value={participants} onValueChange={setParticipants} min={5} max={100} step={5} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5人</span>
                  <span>100人</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Wallet className="size-4 text-muted-foreground" />
                  人均预算 <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                  <Input
                    type="number"
                    placeholder="例如：200"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" />
                  活动城市 <span className="text-destructive">*</span>
                </Label>
                <Select value={city} onValueChange={setCity} disabled={optionsLoading || !!optionsError}>
                  <SelectTrigger>
                    <SelectValue placeholder={optionsLoading ? "加载中..." : "选择城市"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cityOptions.map((c) => (
                      <SelectItem key={c.code} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  活动类型（多选）<span className="text-destructive">*</span>
                </Label>
                {optionsLoading ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {activityOptions.map((type) => {
                      const Icon = ICON_MAP[type.id] || PartyPopper
                      return (
                        <Badge
                          key={type.id}
                          variant={selectedTypes.includes(type.id) ? "default" : "outline"}
                          className="cursor-pointer justify-center gap-1 py-2"
                          onClick={() => toggleActivityType(type.id)}
                        >
                          <Icon className="size-3.5" />
                          {type.label}
                        </Badge>
                      )
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* 生成按钮 + 缺少字段提示 */}
              <div className="space-y-2">
                <Button
                  className="w-full gap-2"
                  onClick={handleGenerate}
                  disabled={isGenerating || !budget || !city || selectedTypes.length === 0 || optionsLoading || !!optionsError}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      AI 正在策划...
                    </>
                  ) : (
                    <>
                      <PartyPopper className="size-4" />
                      生成全案
                    </>
                  )}
                </Button>
                {/* 说明为何按钮不可点击 */}
                {!isGenerating && (!budget || !city || selectedTypes.length === 0) && !optionsLoading && !optionsError && (
                  <p className="text-center text-xs text-muted-foreground">
                    请填写：
                    {[!budget && "人均预算", !city && "活动城市", selectedTypes.length === 0 && "活动类型"]
                      .filter(Boolean)
                      .join("、")}
                  </p>
                )}
              </div>

              {/* 生成失败内联提示 */}
              {generateError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-3.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium">生成失败</div>
                    <div className="mt-0.5 text-muted-foreground">{generateError}</div>
                  </div>
                </div>
              )}

              {/* 生成完成后显示耗时 */}
              {elapsedMs !== null && !isGenerating && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer className="size-3.5" />
                  生成耗时 {(elapsedMs / 1000).toFixed(1)} 秒
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 中：Agent 节点流 */}
      <div className="min-h-0 w-[320px] flex-shrink-0 border-r bg-muted/30">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold">Agent 执行状态</h2>
            <p className="text-xs text-muted-foreground">LangGraph 工作流程</p>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              <div className="relative space-y-0">
                {nodes.map((node, index) => (
                  <div key={node.id} className="relative pb-8 last:pb-0">
                    {index < nodes.length - 1 && (
                      <div
                        className={cn(
                          "absolute left-[15px] top-[30px] h-full w-0.5",
                          node.status === "success" ? "bg-primary" : "bg-border"
                        )}
                      />
                    )}
                    <div className="flex gap-3">
                      <div
                        className={cn(
                          "relative z-10 flex size-8 flex-shrink-0 items-center justify-center rounded-full border-2 bg-background",
                          node.status === "pending" && "border-muted-foreground/30",
                          node.status === "loading" && "border-primary",
                          node.status === "success" && "border-primary bg-primary",
                          node.status === "retry" && "border-orange-500",
                          node.status === "error" && "border-destructive bg-destructive"
                        )}
                      >
                        {node.status === "pending" && (
                          <span className="text-xs text-muted-foreground">{node.id}</span>
                        )}
                        {node.status === "loading" && <Loader2 className="size-4 animate-spin text-primary" />}
                        {node.status === "success" && <Check className="size-4 text-primary-foreground" />}
                        {node.status === "retry" && <RefreshCw className="size-4 animate-spin text-orange-500" />}
                        {node.status === "error" && <AlertCircle className="size-4 text-destructive-foreground" />}
                      </div>
                      <div className="flex-1 pt-1">
                        <div className="text-sm font-medium">{node.title}</div>
                        <div
                          className={cn(
                            "mt-1 text-xs",
                            node.status === "retry"
                              ? "text-orange-500"
                              : node.status === "success"
                                ? "text-primary"
                                : node.status === "error"
                                  ? "text-destructive"
                                : "text-muted-foreground"
                          )}
                        >
                          {node.message || node.description}
                        </div>
                        {SHOW_AGENT_DETAILS && node.details?.length ? (
                          <div className="mt-2 space-y-1.5">
                            {node.details.map((detail, detailIndex) => (
                              <div
                                key={`${node.id}-${detailIndex}-${detail.title}`}
                                className="rounded-md border bg-background px-2 py-1.5 shadow-xs"
                              >
                                <div
                                  className="truncate text-[11px] font-medium text-foreground"
                                  title={detail.title}
                                >
                                  {detailIndex + 1}. {detail.title}
                                </div>
                                {detail.content && (
                                  <div className="mt-0.5 max-h-8 overflow-hidden text-[11px] leading-4 text-muted-foreground">
                                    {detail.content}
                                  </div>
                                )}
                                {(detail.score !== undefined || detail.url) && (
                                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                    {detail.score !== undefined && (
                                      <span>匹配度 {Math.round(detail.score * 100)}%</span>
                                    )}
                                    {detail.url && (
                                      <a
                                        href={detail.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
                                      >
                                        <ExternalLink className="size-3 flex-shrink-0" />
                                        <span className="truncate">来源</span>
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 右：方案展示 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {showPlan && currentPlan ? (
          <PlanView
            plans={plans}
            currentPlan={currentPlan}
            participants={participants[0]}
            activePlan={activePlan}
            onTabChange={setActivePlan}
            onExport={handleExportPdf}
            exporting={exporting}
            canExport={!!planId}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <PartyPopper className="mx-auto mb-4 size-12 opacity-30" />
              <p>配置活动需求后</p>
              <p className="text-sm">点击"生成全案"开始策划</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PlanView(props: {
  plans: PlanDetail[]
  currentPlan: PlanDetail
  participants: number
  activePlan: string
  onTabChange: (v: string) => void
  onExport: () => void
  exporting: boolean
  canExport: boolean
}) {
  const { plans, currentPlan, participants, activePlan, onTabChange, onExport, exporting, canExport } = props
  const total = currentPlan.total || currentPlan.budget.reduce((s, b) => s + b.total, 0)
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3 border-b p-4">
        <Tabs value={activePlan} onValueChange={onTabChange} className="min-w-0 flex-1">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex w-max">
              {plans.map((_, index) => (
                <TabsTrigger key={index} value={String(index)}>
                  {planTabLabel(index)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        <Button size="sm" variant="outline" disabled={!canExport || exporting} onClick={onExport} className="flex-shrink-0">
          {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
          导出 PDF
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">{currentPlan.name}</h2>
            <p className="text-muted-foreground">{currentPlan.description}</p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4" />
                活动日程
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentPlan.schedule.map((item, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="flex-shrink-0 text-sm font-medium text-primary">{item.time}</div>
                    <ArrowRight className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{item.activity}</div>
                      {item.location && (
                        <div className="text-xs text-muted-foreground">{item.location}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="size-4" />
                地点明细
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentPlan.venues.map((venue, index) => (
                  <div key={index} className="flex items-start justify-between rounded-lg border p-4">
                    <div>
                      <div className="font-medium">{venue.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{venue.address}</div>
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        {venue.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3.5" />
                            {venue.phone}
                          </span>
                        )}
                        {venue.rating > 0 && (
                          <span className="flex items-center gap-1">
                            <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
                            {venue.rating}
                          </span>
                        )}
                      </div>
                    </div>
                    {venue.map_url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={venue.map_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="size-4" />
                预算明细
              </CardTitle>
              <CardDescription>
                总预算：¥{total.toLocaleString()} | 人均：¥{Math.round(total / Math.max(participants, 1))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>项目</TableHead>
                    <TableHead className="text-right">单价</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">小计</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentPlan.budget.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.item}</TableCell>
                      <TableCell className="text-right">¥{item.unit_price}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right font-medium">
                        ¥{item.total.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold">
                      合计
                    </TableCell>
                    <TableCell className="text-right font-semibold">¥{total.toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </>
  )
}
