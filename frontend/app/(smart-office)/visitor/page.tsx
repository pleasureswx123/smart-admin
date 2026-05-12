"use client"

import * as React from "react"
import {
  Users,
  Search,
  Filter,
  TrendingUp,
  UserCheck,
  UserPlus,
  Building2,
  Phone,
  QrCode,
  Check,
  LogIn,
  LogOut,
  Bell,
  Loader2,
  RefreshCw,
  AlertCircle,
  X,
  Clock,
  QrCode as QrCodeIcon,
  MessageSquare,
  CheckCircle2,
  ChevronRight,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { apiGet, apiPost, apiUpload } from "@/lib/api"
import type {
  HostMatch,
  OcrCardResponse,
  VisitorListResponse,
  VisitorOut,
  VisitorStats,
  WeeklyTrendResponse,
} from "@/lib/api-types"

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  registered: { label: "已登记", variant: "secondary" },
  entered: { label: "已入场", variant: "default" },
  left: { label: "已离开", variant: "outline" },
}

// 推送状态友好映射
// skipped = DINGTALK_WEBHOOK_URL 未配置，后端直接跳过推送
const pushStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "推送中", variant: "secondary" },
  success: { label: "已推送", variant: "default" },
  failed: { label: "推送失败", variant: "destructive" },
  skipped: { label: "未配置通知", variant: "outline" },
}

/** 将 ISO 时间格式化为 MM-DD HH:mm */
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${mm}-${dd} ${hh}:${min}`
}

export default function VisitorPage() {
  const [activeTab, setActiveTab] = React.useState("dashboard")
  const [searchTerm, setSearchTerm] = React.useState("")
  // 防抖：350ms 后才更新实际查询关键词，避免每次击键都触发 API
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [stats, setStats] = React.useState<VisitorStats>({
    today_total: 0,
    today_entered: 0,
    today_left: 0,
    weekly_total: 0,
  })
  const [weekly, setWeekly] = React.useState<{ day: string; count: number }[]>([])
  const [list, setList] = React.useState<VisitorOut[]>([])
  const [loading, setLoading] = React.useState(false)
  const [actionId, setActionId] = React.useState<string | null>(null)
  // 全局内联错误（替代 alert）
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  // 访客详情弹窗
  const [detailId, setDetailId] = React.useState<string | null>(null)

  // 搜索防抖
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 350)
    return () => clearTimeout(t)
  }, [searchTerm])

  const reload = React.useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const params = new URLSearchParams({ page: "1", page_size: "50" })
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim())
      const [s, w, l] = await Promise.all([
        apiGet<VisitorStats>("/api/v1/visitor/stats/today"),
        apiGet<WeeklyTrendResponse>("/api/v1/visitor/stats/weekly-trend"),
        apiGet<VisitorListResponse>(`/api/v1/visitor?${params.toString()}`),
      ])
      setStats(s)
      setWeekly(w.points.map((p) => ({ day: p.day, count: p.count })))
      setList(l.items)
    } catch (e: any) {
      setErrorMsg(e?.message || "加载失败，请检查后端服务是否运行")
    } finally {
      setLoading(false)
    }
  }, [statusFilter, debouncedSearch])

  React.useEffect(() => {
    reload()
  }, [reload])

  const doAction = async (vid: string, op: "check-in" | "check-out" | "notify") => {
    setActionId(vid)
    setErrorMsg(null)
    try {
      await apiPost(`/api/v1/visitor/${vid}/${op}`)
      await reload()
    } catch (e: any) {
      const opLabel = op === "check-in" ? "入场" : op === "check-out" ? "离场" : "通知"
      setErrorMsg(`${opLabel}操作失败：${e?.detail || e?.message || e}`)
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">访客登记管理</h1>
            <p className="text-sm text-muted-foreground">数字化访客管理系统</p>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="dashboard">管理后台</TabsTrigger>
              <TabsTrigger value="mobile">手机登记页</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* 全局操作错误提示条 */}
      {errorMsg && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 flex-shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="hover:opacity-70">
            <X className="size-4" />
          </button>
        </div>
      )}

      <Tabs value={activeTab} className="flex-1 overflow-hidden">
        <TabsContent value="dashboard" className="mt-0 flex h-full flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* 使用流程引导 */}
              <FlowGuide hasDingtalk={list.some((v) => v.push_status === "success")} />
              <StatsCards stats={stats} />
              <div className="grid gap-6 lg:grid-cols-3">
                <WeeklyChart data={weekly} />
                <VisitorTable
                  list={list}
                  loading={loading}
                  actionId={actionId}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  onReload={reload}
                  onAction={doAction}
                  onDetail={setDetailId}
                />
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="mobile" className="mt-0 flex h-full items-center justify-center bg-muted/30 p-6">
          <MobileRegisterPreview onRegistered={reload} />
        </TabsContent>
      </Tabs>

      {/* 访客详情弹窗（覆盖 GET /visitor/{vid}） */}
      <VisitorDetailDialog vid={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}

// ─────────────────────────────────────────────
// 使用流程引导条（顶部简洁说明）
// ─────────────────────────────────────────────
function FlowGuide({ hasDingtalk }: { hasDingtalk: boolean }) {
  const steps = [
    { icon: QrCode, text: "手机扫码登记", desc: "访客扫码填写姓名、单位、事由" },
    { icon: Bell, text: "钉钉自动通知", desc: hasDingtalk ? "已成功推送钉钉" : "被访人收到钉钉消息" },
    { icon: LogIn, text: "前台确认入场", desc: "管理员点击「入场」确认" },
    { icon: LogOut, text: "离场签离", desc: "访客离开后点击「离场」" },
  ]
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-4 py-2.5">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <s.icon className="size-4 flex-shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-xs font-medium leading-tight">{s.text}</div>
              <div className="truncate text-[10px] text-muted-foreground">{s.desc}</div>
            </div>
          </div>
          {i < steps.length - 1 && <div className="mx-1 text-muted-foreground/40">›</div>}
        </React.Fragment>
      ))}
    </div>
  )
}

function StatsCards({ stats }: { stats: VisitorStats }) {
  const cards = [
    { icon: Users, bg: "bg-primary/10", fg: "text-primary", value: stats.today_total, label: "今日访客" },
    { icon: UserCheck, bg: "bg-green-500/10", fg: "text-green-500", value: stats.today_entered, label: "当前在访" },
    { icon: UserPlus, bg: "bg-orange-500/10", fg: "text-orange-500", value: stats.today_left, label: "今日离开" },
    { icon: TrendingUp, bg: "bg-blue-500/10", fg: "text-blue-500", value: stats.weekly_total, label: "本周累计" },
  ]
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => {
        const Icon = c.icon
        return (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`flex size-12 items-center justify-center rounded-lg ${c.bg}`}>
                <Icon className={`size-6 ${c.fg}`} />
              </div>
              <div>
                <div className="text-2xl font-bold">{c.value}</div>
                <div className="text-sm text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function WeeklyChart({ data }: { data: { day: string; count: number }[] }) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="text-base">本周访客趋势</CardTitle>
        <CardDescription>按日统计的访客数量</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={30} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function VisitorTable(props: {
  list: VisitorOut[]
  loading: boolean
  actionId: string | null
  searchTerm: string
  setSearchTerm: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  onReload: () => void
  onAction: (vid: string, op: "check-in" | "check-out" | "notify") => void
  onDetail: (vid: string) => void
}) {
  const { list, loading, actionId, searchTerm, setSearchTerm, statusFilter, setStatusFilter, onReload, onAction, onDetail } = props
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">访客列表</CardTitle>
            <CardDescription>实时访客登记信息（共 {list.length} 条，点击行查看详情）</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索访客..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-[200px] pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[120px]">
                <Filter className="mr-2 size-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="registered">已登记</SelectItem>
                <SelectItem value="entered">已入场</SelectItem>
                <SelectItem value="left">已离开</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={onReload} disabled={loading} title="刷新">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>访客</TableHead>
              <TableHead>来访单位</TableHead>
              <TableHead>联系电话</TableHead>
              <TableHead>被访人</TableHead>
              <TableHead>登记时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  {loading ? "加载中..." : "暂无数据"}
                </TableCell>
              </TableRow>
            ) : (
              list.map((v) => {
                const map = statusMap[v.status] || statusMap.registered
                const pushMap = pushStatusMap[v.push_status] || pushStatusMap.pending
                const busy = actionId === v.id
                return (
                  <TableRow
                    key={v.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => onDetail(v.id)}
                  >
                    {/* 访客姓名 + 来访事由（副文本） */}
                    <TableCell className="font-medium">
                      <div>{v.name}</div>
                      {v.purpose && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{v.purpose}</div>
                      )}
                    </TableCell>
                    <TableCell>{v.company}</TableCell>
                    <TableCell>{v.phone_masked}</TableCell>
                    <TableCell>{v.host_name || "—"}</TableCell>
                    {/* 登记时间 */}
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {fmtTime(v.created_at)}
                      </div>
                    </TableCell>
                    {/* 访问状态 + 推送状态 */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={map.variant} className="w-fit">{map.label}</Badge>
                        {v.push_status !== "success" && (
                          <Badge variant={pushMap.variant} className="w-fit px-1.5 py-0 text-[10px]">
                            {pushMap.label}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {/* 操作按钮：阻止冒泡避免触发行点击 */}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {v.status === "registered" && (
                          <Button size="sm" variant="ghost" disabled={busy}
                            onClick={() => onAction(v.id, "check-in")} className="gap-1 text-xs">
                            {busy ? <Loader2 className="size-3 animate-spin" /> : <LogIn className="size-3" />}
                            入场
                          </Button>
                        )}
                        {v.status === "entered" && (
                          <Button size="sm" variant="ghost" disabled={busy}
                            onClick={() => onAction(v.id, "check-out")} className="gap-1 text-xs">
                            {busy ? <Loader2 className="size-3 animate-spin" /> : <LogOut className="size-3" />}
                            离场
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={busy}
                          onClick={() => onAction(v.id, "notify")} className="gap-1 text-xs" title="重新推送钉钉通知">
                          <Bell className="size-3" />
                          通知
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function MobileRegisterPreview({ onRegistered }: { onRegistered: () => void }) {
  const [step, setStep] = React.useState<1 | 2>(1)
  const [formData, setFormData] = React.useState({
    name: "",
    company: "",
    phone: "",
    purpose: "",
    host: "",
  })
  const [hostId, setHostId] = React.useState<string | null>(null)
  const [matches, setMatches] = React.useState<HostMatch[]>([])
  const [showHostSuggestions, setShowHostSuggestions] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [scanning, setScanning] = React.useState(false)
  const [registered, setRegistered] = React.useState<VisitorOut | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  // 防抖搜索被访人
  React.useEffect(() => {
    const q = formData.host.trim()
    if (!q) {
      setMatches([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await apiGet<{ matches: HostMatch[] }>(
          `/api/v1/visitor/search-host?q=${encodeURIComponent(q)}&limit=8`
        )
        setMatches(res.matches)
      } catch (e) {
        console.error("host.search_failed", e)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [formData.host])

  const handleScan = async (file: File) => {
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await apiUpload<OcrCardResponse>("/api/v1/visitor/ocr-card", fd)
      setFormData((prev) => ({
        ...prev,
        name: res.name || prev.name,
        company: res.company || prev.company,
        phone: res.phone || prev.phone,
      }))
    } catch (e: any) {
      alert(`识别失败：${e?.message || e}`)
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.company || !formData.phone) {
      alert("请填写姓名、单位与电话")
      return
    }
    setSubmitting(true)
    try {
      const payload: any = {
        name: formData.name,
        company: formData.company,
        phone: formData.phone,
        purpose: formData.purpose || null,
        source: "mobile",
      }
      if (hostId) payload.host_employee_id = hostId
      else if (formData.host) payload.host_name = formData.host
      const v = await apiPost<VisitorOut>("/api/v1/visitor", payload)
      setRegistered(v)
      setStep(2)
      onRegistered()
    } catch (e: any) {
      alert(`登记失败：${e?.message || e}`)
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setStep(1)
    setFormData({ name: "", company: "", phone: "", purpose: "", host: "" })
    setHostId(null)
    setMatches([])
    setRegistered(null)
  }

  return (
    <div className="relative mx-auto w-[375px] overflow-hidden rounded-[40px] border-8 border-foreground/10 bg-background shadow-2xl">
      <div className="flex items-center justify-between bg-foreground/5 px-6 py-2 text-xs">
        <span>09:41</span>
        <div className="flex items-center gap-1">
          <div className="h-2.5 w-4 rounded-sm border border-current" />
        </div>
      </div>

      <div className="h-[667px] overflow-auto">
        {step === 1 ? (
          <MobileForm
            formData={formData}
            setFormData={setFormData}
            hostId={hostId}
            setHostId={setHostId}
            matches={matches}
            showHostSuggestions={showHostSuggestions}
            setShowHostSuggestions={setShowHostSuggestions}
            scanning={scanning}
            submitting={submitting}
            fileRef={fileRef}
            onScan={handleScan}
            onSubmit={handleSubmit}
          />
        ) : (
          <MobileSuccess registered={registered} onReset={reset} />
        )}
      </div>

      <div className="h-8 bg-foreground/5" />
    </div>
  )
}

function MobileForm(props: {
  formData: { name: string; company: string; phone: string; purpose: string; host: string }
  setFormData: React.Dispatch<
    React.SetStateAction<{ name: string; company: string; phone: string; purpose: string; host: string }>
  >
  hostId: string | null
  setHostId: (v: string | null) => void
  matches: HostMatch[]
  showHostSuggestions: boolean
  setShowHostSuggestions: (v: boolean) => void
  scanning: boolean
  submitting: boolean
  fileRef: React.RefObject<HTMLInputElement | null>
  onScan: (f: File) => void
  onSubmit: () => void
}) {
  const {
    formData,
    setFormData,
    setHostId,
    matches,
    showHostSuggestions,
    setShowHostSuggestions,
    scanning,
    submitting,
    fileRef,
    onScan,
    onSubmit,
  } = props
  return (
    <div className="flex flex-col">
      <div className="bg-primary px-6 pb-8 pt-6 text-primary-foreground">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary-foreground/20">
            <Building2 className="size-7" />
          </div>
          <div>
            <div className="text-lg font-semibold">智慧科技园区</div>
            <div className="text-sm opacity-80">欢迎您的到来</div>
          </div>
        </div>
        <p className="text-sm opacity-90">请填写以下信息完成访客登记</p>
      </div>

      <div className="px-6 py-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onScan(f)
          }}
        />
        <Button
          className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80"
          disabled={scanning}
          onClick={() => fileRef.current?.click()}
        >
          {scanning ? <Loader2 className="size-5 animate-spin" /> : <QrCode className="size-5" />}
          扫描名片自动填单
        </Button>
      </div>

      <div className="space-y-4 px-6 pb-6">
        <FormField label="姓名">
          <Input
            placeholder="请输入您的姓名"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </FormField>
        <FormField label="来访单位">
          <Input
            placeholder="请输入您的公司/单位名称"
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
          />
        </FormField>
        <FormField label="手机号码">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="请输入手机号码"
              type="tel"
              className="pl-10"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
        </FormField>
        <FormField label="来访事由">
          <Input
            placeholder="例如：商务洽谈、项目对接"
            value={formData.purpose}
            onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
          />
        </FormField>
        <FormField label="被访人姓名">
          <div className="relative">
            <Input
              placeholder="支持中文/拼音/缩写"
              value={formData.host}
              onChange={(e) => {
                setFormData({ ...formData, host: e.target.value })
                setHostId(null)
                setShowHostSuggestions(true)
              }}
              onFocus={() => setShowHostSuggestions(true)}
            />
            {showHostSuggestions && matches.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-md border bg-background shadow-lg">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setFormData({ ...formData, host: m.name })
                      setHostId(m.id)
                      setShowHostSuggestions(false)
                    }}
                  >
                    <span>
                      <span className="font-medium">{m.name}</span>
                      {m.title && <span className="ml-1 text-xs text-muted-foreground">{m.title}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.department}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </FormField>

        <div className="pt-4">
          <Button className="w-full" size="lg" onClick={onSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            提交登记
          </Button>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

function MobileSuccess({ registered, onReset }: { registered: VisitorOut | null; onReset: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-green-500/10">
        <Check className="size-10 text-green-500" />
      </div>
      <h2 className="mb-2 text-xl font-semibold">登记成功</h2>
      <p className="mb-6 text-muted-foreground">已通知被访人，请在前台稍候</p>
      <div className="w-full rounded-lg border bg-muted/30 p-4 text-left">
        <div className="mb-3 text-sm font-medium">登记信息</div>
        <div className="space-y-2 text-sm">
          <Row k="姓名" v={registered?.name || ""} />
          <Row k="单位" v={registered?.company || ""} />
          <Row k="电话" v={registered?.phone_masked || ""} />
          <Row k="被访人" v={registered?.host_name || ""} />
          <Row k="登记时间" v={registered?.created_at?.replace("T", " ").slice(0, 16) || ""} />
          <Row k="推送状态" v={registered?.push_status || ""} />
        </div>
      </div>
      <Button variant="outline" className="mt-6" onClick={onReset}>
        返回首页
      </Button>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  )
}

/** 访客详情弹窗：调用 GET /api/v1/visitor/{vid} */
function VisitorDetailDialog({ vid, onClose }: { vid: string | null; onClose: () => void }) {
  const [detail, setDetail] = React.useState<VisitorOut | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!vid) {
      setDetail(null)
      setErr(null)
      return
    }
    setLoading(true)
    setErr(null)
    apiGet<VisitorOut>(`/api/v1/visitor/${vid}`)
      .then(setDetail)
      .catch((e: any) => setErr(e?.message || "加载失败"))
      .finally(() => setLoading(false))
  }, [vid])

  const statusInfo = detail ? (statusMap[detail.status] ?? statusMap.registered) : null
  const pushInfo = detail ? (pushStatusMap[detail.push_status] ?? pushStatusMap.pending) : null

  return (
    <Dialog open={!!vid} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>访客详情</DialogTitle>
        </DialogHeader>

        {/* 加载中 */}
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* 加载失败 */}
        {!loading && err && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4 flex-shrink-0" />
            {err}
          </div>
        )}

        {/* 详情内容 */}
        {!loading && detail && (
          <div className="space-y-4 text-sm">
            {/* 基本信息 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">基本信息</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <DetailItem label="姓名" value={detail.name} />
                <DetailItem label="来访单位" value={detail.company} />
                <DetailItem label="联系电话" value={detail.phone_masked} />
                <DetailItem label="来访事由" value={detail.purpose ?? "—"} />
              </div>
            </div>

            <Separator />

            {/* 接待信息 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">接待信息</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <DetailItem label="被访人" value={detail.host_name || "—"} />
                <DetailItem label="登记方式" value={detail.source === "mobile" ? "手机扫码" : "前台录入"} />
              </div>
            </div>

            <Separator />

            {/* 状态与时间 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">状态 &amp; 时间</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">访问状态</p>
                  {statusInfo && <Badge variant={statusInfo.variant} className="mt-1">{statusInfo.label}</Badge>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">通知状态</p>
                  {pushInfo && <Badge variant={pushInfo.variant} className="mt-1">{pushInfo.label}</Badge>}
                </div>
                <DetailItem label="登记时间" value={fmtTime(detail.created_at)} />
                <DetailItem label="入场时间" value={fmtTime(detail.check_in_at)} />
                <DetailItem label="离场时间" value={fmtTime(detail.check_out_at)} />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** 详情弹窗内的单个信息行 */
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  )
}
