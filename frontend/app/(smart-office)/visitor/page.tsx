"use client"

import * as React from "react"
import {
  Users,
  Search,
  Filter,
  MoreHorizontal,
  TrendingUp,
  UserCheck,
  UserPlus,
  Calendar,
  Building2,
  Phone,
  QrCode,
  ChevronDown,
  Check,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"
import { cn } from "@/lib/utils"

// 模拟访客数据
const visitors = [
  {
    id: 1,
    name: "张明",
    company: "华为技术有限公司",
    phone: "138****1234",
    host: "李经理",
    purpose: "商务洽谈",
    status: "entered",
    checkInTime: "09:30",
    checkOutTime: null,
  },
  {
    id: 2,
    name: "王芳",
    company: "阿里巴巴集团",
    phone: "139****5678",
    host: "张总监",
    purpose: "项目对接",
    status: "entered",
    checkInTime: "10:15",
    checkOutTime: null,
  },
  {
    id: 3,
    name: "刘强",
    company: "腾讯科技",
    phone: "137****9012",
    host: "王经理",
    purpose: "技术交流",
    status: "registered",
    checkInTime: null,
    checkOutTime: null,
  },
  {
    id: 4,
    name: "陈静",
    company: "字节跳动",
    phone: "136****3456",
    host: "赵总",
    purpose: "招聘面试",
    status: "left",
    checkInTime: "08:45",
    checkOutTime: "11:30",
  },
  {
    id: 5,
    name: "杨帆",
    company: "京东集团",
    phone: "135****7890",
    host: "钱经理",
    purpose: "供应商会议",
    status: "entered",
    checkInTime: "14:00",
    checkOutTime: null,
  },
  {
    id: 6,
    name: "周雪",
    company: "美团点评",
    phone: "134****2345",
    host: "孙总监",
    purpose: "合作洽谈",
    status: "registered",
    checkInTime: null,
    checkOutTime: null,
  },
]

// 本周访客趋势数据
const weeklyData = [
  { day: "周一", count: 45 },
  { day: "周二", count: 52 },
  { day: "周三", count: 38 },
  { day: "周四", count: 61 },
  { day: "周五", count: 55 },
  { day: "周六", count: 12 },
  { day: "周日", count: 8 },
]

// 统计数据
const stats = {
  todayTotal: 28,
  todayEntered: 18,
  todayLeft: 8,
  weeklyTotal: 271,
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  registered: { label: "已登记", variant: "secondary" },
  entered: { label: "已入场", variant: "default" },
  left: { label: "已离开", variant: "outline" },
}

export default function VisitorPage() {
  const [searchTerm, setSearchTerm] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [activeTab, setActiveTab] = React.useState("dashboard")

  const filteredVisitors = visitors.filter((visitor) => {
    const matchesSearch =
      visitor.name.includes(searchTerm) ||
      visitor.company.includes(searchTerm) ||
      visitor.host.includes(searchTerm)
    const matchesStatus = statusFilter === "all" || visitor.status === statusFilter
    return matchesSearch && matchesStatus
  })

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

      <Tabs value={activeTab} className="flex-1 overflow-hidden">
        {/* PC 端管理后台 */}
        <TabsContent value="dashboard" className="mt-0 flex h-full flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-6">
              {/* 统计卡片 */}
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                      <Users className="size-6 text-primary" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{stats.todayTotal}</div>
                      <div className="text-sm text-muted-foreground">今日访客</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex size-12 items-center justify-center rounded-lg bg-green-500/10">
                      <UserCheck className="size-6 text-green-500" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{stats.todayEntered}</div>
                      <div className="text-sm text-muted-foreground">当前在访</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex size-12 items-center justify-center rounded-lg bg-orange-500/10">
                      <UserPlus className="size-6 text-orange-500" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{stats.todayLeft}</div>
                      <div className="text-sm text-muted-foreground">今日离开</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex size-12 items-center justify-center rounded-lg bg-blue-500/10">
                      <TrendingUp className="size-6 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{stats.weeklyTotal}</div>
                      <div className="text-sm text-muted-foreground">本周累计</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                {/* 访客趋势图 */}
                <Card className="lg:col-span-1">
                  <CardHeader>
                    <CardTitle className="text-base">本周访客趋势</CardTitle>
                    <CardDescription>按日统计的访客数量</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={weeklyData}>
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          width={30}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar
                          dataKey="count"
                          fill="hsl(var(--primary))"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* 访客列表 */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">访客列表</CardTitle>
                        <CardDescription>实时访客登记信息</CardDescription>
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
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>访客姓名</TableHead>
                          <TableHead>来访单位</TableHead>
                          <TableHead>联系电话</TableHead>
                          <TableHead>被访人</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredVisitors.map((visitor) => (
                          <TableRow key={visitor.id}>
                            <TableCell className="font-medium">{visitor.name}</TableCell>
                            <TableCell>{visitor.company}</TableCell>
                            <TableCell>{visitor.phone}</TableCell>
                            <TableCell>{visitor.host}</TableCell>
                            <TableCell>
                              <Badge variant={statusMap[visitor.status].variant}>
                                {statusMap[visitor.status].label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8">
                                    <MoreHorizontal className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem>
                                    <UserCheck className="mr-2 size-4" />
                                    确认入场
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <X className="mr-2 size-4" />
                                    取消登记
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* 手机 H5 登记页面 */}
        <TabsContent value="mobile" className="mt-0 flex h-full items-center justify-center bg-muted/30 p-6">
          <MobileRegisterPreview />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// 手机登记页面预览组件
function MobileRegisterPreview() {
  const [step, setStep] = React.useState(1)
  const [formData, setFormData] = React.useState({
    name: "",
    company: "",
    phone: "",
    host: "",
  })
  const [showHostSuggestions, setShowHostSuggestions] = React.useState(false)

  const hostSuggestions = ["李经理", "张总监", "王经理", "赵总", "钱经理"]

  const handleSubmit = () => {
    setStep(2)
  }

  return (
    <div className="relative mx-auto w-[375px] overflow-hidden rounded-[40px] border-8 border-foreground/10 bg-background shadow-2xl">
      {/* 手机状态栏模拟 */}
      <div className="flex items-center justify-between bg-foreground/5 px-6 py-2 text-xs">
        <span>09:41</span>
        <div className="flex items-center gap-1">
          <div className="h-2.5 w-4 rounded-sm border border-current" />
        </div>
      </div>

      {/* 内容区域 */}
      <div className="h-[667px] overflow-auto">
        {step === 1 ? (
          <div className="flex flex-col">
            {/* 顶部 Logo 和欢迎语 */}
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

            {/* 扫名片按钮 */}
            <div className="px-6 py-4">
              <Button className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80">
                <QrCode className="size-5" />
                扫描名片自动填单
              </Button>
            </div>

            {/* 表单 */}
            <div className="space-y-4 px-6 pb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">姓名</label>
                <Input
                  placeholder="请输入您的姓名"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">来访单位</label>
                <Input
                  placeholder="请输入您的公司/单位名称"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">手机号码</label>
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
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">被访人姓名</label>
                <div className="relative">
                  <Input
                    placeholder="请输入被访人姓名"
                    value={formData.host}
                    onChange={(e) => {
                      setFormData({ ...formData, host: e.target.value })
                      setShowHostSuggestions(e.target.value.length > 0)
                    }}
                    onFocus={() => setShowHostSuggestions(formData.host.length > 0)}
                  />
                  <ChevronDown className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  {showHostSuggestions && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-background shadow-lg">
                      {hostSuggestions
                        .filter((h) => h.includes(formData.host))
                        .map((host) => (
                          <button
                            key={host}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              setFormData({ ...formData, host })
                              setShowHostSuggestions(false)
                            }}
                          >
                            {host}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 提交按钮 */}
              <div className="pt-4">
                <Button className="w-full" size="lg" onClick={handleSubmit}>
                  提交登记
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* 成功页面 */
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-green-500/10">
              <Check className="size-10 text-green-500" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">登记成功</h2>
            <p className="mb-6 text-muted-foreground">
              已通知被访人，请在前台稍候
            </p>
            <div className="w-full rounded-lg border bg-muted/30 p-4 text-left">
              <div className="mb-3 text-sm font-medium">登记信息</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">姓名</span>
                  <span>{formData.name || "张明"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">单位</span>
                  <span>{formData.company || "华为技术"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">被访人</span>
                  <span>{formData.host || "李经理"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">登记时间</span>
                  <span>2024-03-20 09:41</span>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => {
                setStep(1)
                setFormData({ name: "", company: "", phone: "", host: "" })
              }}
            >
              返回首页
            </Button>
          </div>
        )}
      </div>

      {/* 底部导航栏模拟 */}
      <div className="h-8 bg-foreground/5" />
    </div>
  )
}
