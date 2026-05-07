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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// 活动类型选项
const activityTypes = [
  { id: "bbq", label: "烧烤", icon: Utensils },
  { id: "outdoor", label: "户外", icon: TreePine },
  { id: "script", label: "剧本杀", icon: Drama },
  { id: "camping", label: "露营", icon: Tent },
  { id: "indoor", label: "室内", icon: Building2 },
  { id: "party", label: "派对", icon: PartyPopper },
]

// 城市列表
const cities = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京"]

// 模拟 Agent 节点状态
interface AgentNode {
  id: number
  title: string
  description: string
  status: "pending" | "loading" | "success" | "retry"
  message?: string
}

const initialNodes: AgentNode[] = [
  { id: 1, title: "联网搜索周边地点", description: "正在搜索符合条件的场地...", status: "pending" },
  { id: 2, title: "预算匹配核验", description: "验证方案预算是否符合要求...", status: "pending" },
  { id: 3, title: "生成行程方案", description: "整合信息生成完整方案...", status: "pending" },
]

// 模拟方案数据
const mockPlanA = {
  name: "精选方案 A",
  description: "城郊烧烤 + 草坪团建",
  schedule: [
    { time: "09:00", activity: "公司集合出发", location: "公司门口" },
    { time: "10:30", activity: "抵达目的地", location: "阳光农庄" },
    { time: "11:00", activity: "团队破冰游戏", location: "草坪活动区" },
    { time: "12:00", activity: "自助烧烤午餐", location: "烧烤区" },
    { time: "14:00", activity: "团建拓展活动", location: "拓展基地" },
    { time: "16:30", activity: "自由活动时间", location: "休闲区" },
    { time: "17:30", activity: "返程", location: "" },
  ],
  venues: [
    {
      name: "阳光农庄",
      address: "朝阳区东五环外沿",
      phone: "010-8888-6666",
      rating: 4.8,
      mapUrl: "#",
    },
  ],
  budget: [
    { item: "场地费", unitPrice: 30, quantity: 30, total: 900 },
    { item: "烧烤食材", unitPrice: 80, quantity: 30, total: 2400 },
    { item: "饮料零食", unitPrice: 20, quantity: 30, total: 600 },
    { item: "拓展教练", unitPrice: 800, quantity: 1, total: 800 },
    { item: "往返大巴", unitPrice: 50, quantity: 30, total: 1500 },
  ],
}

const mockPlanB = {
  name: "备选方案 B",
  description: "室内剧本杀 + 聚餐",
  schedule: [
    { time: "13:00", activity: "餐厅集合", location: "望京新世界" },
    { time: "13:30", activity: "午餐聚餐", location: "川味轩" },
    { time: "15:00", activity: "剧本杀体验", location: "谜题空间" },
    { time: "18:00", activity: "活动结束", location: "" },
  ],
  venues: [
    {
      name: "谜题空间剧本杀",
      address: "望京SOHO T1-1502",
      phone: "010-5678-1234",
      rating: 4.6,
      mapUrl: "#",
    },
    {
      name: "川味轩",
      address: "望京新世界3层",
      phone: "010-5678-5678",
      rating: 4.5,
      mapUrl: "#",
    },
  ],
  budget: [
    { item: "午餐聚餐", unitPrice: 100, quantity: 30, total: 3000 },
    { item: "剧本杀", unitPrice: 128, quantity: 30, total: 3840 },
    { item: "茶歇饮料", unitPrice: 15, quantity: 30, total: 450 },
  ],
}

export default function EventPage() {
  const [participants, setParticipants] = React.useState([30])
  const [budget, setBudget] = React.useState("")
  const [city, setCity] = React.useState("")
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([])
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [nodes, setNodes] = React.useState<AgentNode[]>(initialNodes)
  const [showPlan, setShowPlan] = React.useState(false)
  const [activePlan, setActivePlan] = React.useState("a")

  const toggleActivityType = (id: string) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  const handleGenerate = () => {
    if (!budget || !city || selectedTypes.length === 0) return

    setIsGenerating(true)
    setShowPlan(false)
    setNodes(initialNodes.map((n) => ({ ...n, status: "pending" as const })))

    // 模拟 Agent 执行过程
    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === 1 ? { ...n, status: "loading" as const, message: "正在搜索..." } : n
        )
      )
    }, 500)

    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === 1 ? { ...n, status: "success" as const, message: "已找到 12 个符合条件的场地" } : n
        )
      )
    }, 2000)

    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === 2 ? { ...n, status: "loading" as const, message: "正在核验预算..." } : n
        )
      )
    }, 2500)

    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === 2
            ? { ...n, status: "retry" as const, message: "初选方案超标，正在重新规划..." }
            : n
        )
      )
    }, 3500)

    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === 2 ? { ...n, status: "success" as const, message: "预算匹配成功" } : n
        )
      )
    }, 5000)

    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === 3 ? { ...n, status: "loading" as const, message: "正在生成方案..." } : n
        )
      )
    }, 5500)

    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === 3 ? { ...n, status: "success" as const, message: "方案生成完成" } : n
        )
      )
      setIsGenerating(false)
      setShowPlan(true)
    }, 7000)
  }

  const currentPlan = activePlan === "a" ? mockPlanA : mockPlanB
  const totalBudget = currentPlan.budget.reduce((sum, item) => sum + item.total, 0)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* 左侧：需求配置 */}
      <div className="w-[320px] flex-shrink-0 border-r">
        <div className="flex h-full flex-col">
          <div className="border-b p-4">
            <h1 className="text-lg font-semibold">团建策划师</h1>
            <p className="text-sm text-muted-foreground">AI 智能生成团建方案</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-6 p-4">
              {/* 参与人数 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    参与人数
                  </Label>
                  <span className="text-sm font-medium">{participants[0]} 人</span>
                </div>
                <Slider
                  value={participants}
                  onValueChange={setParticipants}
                  min={5}
                  max={100}
                  step={5}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5人</span>
                  <span>100人</span>
                </div>
              </div>

              {/* 人均预算 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Wallet className="size-4 text-muted-foreground" />
                  人均预算
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    ¥
                  </span>
                  <Input
                    type="number"
                    placeholder="例如：200"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* 活动城市 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" />
                  活动城市
                </Label>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择城市" />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 活动类型 */}
              <div className="space-y-2">
                <Label>活动类型（多选）</Label>
                <div className="grid grid-cols-3 gap-2">
                  {activityTypes.map((type) => (
                    <Badge
                      key={type.id}
                      variant={selectedTypes.includes(type.id) ? "default" : "outline"}
                      className="cursor-pointer justify-center gap-1 py-2"
                      onClick={() => toggleActivityType(type.id)}
                    >
                      <type.icon className="size-3.5" />
                      {type.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              {/* 生成按钮 */}
              <Button
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={isGenerating || !budget || !city || selectedTypes.length === 0}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    正在生成...
                  </>
                ) : (
                  <>
                    <PartyPopper className="size-4" />
                    生成全案
                  </>
                )}
              </Button>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 中间：Agent 思考/搜索流 */}
      <div className="w-[320px] flex-shrink-0 border-r bg-muted/30">
        <div className="flex h-full flex-col">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold">Agent 执行状态</h2>
            <p className="text-xs text-muted-foreground">LangGraph 工作流程</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              <div className="relative space-y-0">
                {nodes.map((node, index) => (
                  <div key={node.id} className="relative pb-8 last:pb-0">
                    {/* 连接线 */}
                    {index < nodes.length - 1 && (
                      <div
                        className={cn(
                          "absolute left-[15px] top-[30px] h-full w-0.5",
                          node.status === "success" ? "bg-primary" : "bg-border"
                        )}
                      />
                    )}

                    {/* 节点内容 */}
                    <div className="flex gap-3">
                      {/* 状态图标 */}
                      <div
                        className={cn(
                          "relative z-10 flex size-8 flex-shrink-0 items-center justify-center rounded-full border-2 bg-background",
                          node.status === "pending" && "border-muted-foreground/30",
                          node.status === "loading" && "border-primary",
                          node.status === "success" && "border-primary bg-primary",
                          node.status === "retry" && "border-orange-500"
                        )}
                      >
                        {node.status === "pending" && (
                          <span className="text-xs text-muted-foreground">{node.id}</span>
                        )}
                        {node.status === "loading" && (
                          <Loader2 className="size-4 animate-spin text-primary" />
                        )}
                        {node.status === "success" && (
                          <Check className="size-4 text-primary-foreground" />
                        )}
                        {node.status === "retry" && (
                          <RefreshCw className="size-4 animate-spin text-orange-500" />
                        )}
                      </div>

                      {/* 节点信息 */}
                      <div className="flex-1 pt-1">
                        <div className="text-sm font-medium">{node.title}</div>
                        <div
                          className={cn(
                            "mt-1 text-xs",
                            node.status === "retry"
                              ? "text-orange-500"
                              : node.status === "success"
                                ? "text-primary"
                                : "text-muted-foreground"
                          )}
                        >
                          {node.message || node.description}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 右侧：最终方案展示 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {showPlan ? (
          <>
            <div className="border-b p-4">
              <Tabs value={activePlan} onValueChange={setActivePlan}>
                <TabsList>
                  <TabsTrigger value="a">精选方案 A</TabsTrigger>
                  <TabsTrigger value="b">备选方案 B</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold">{currentPlan.name}</h2>
                  <p className="text-muted-foreground">{currentPlan.description}</p>
                </div>

                {/* 日程卡片 */}
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
                          <div className="flex-shrink-0 text-sm font-medium text-primary">
                            {item.time}
                          </div>
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

                {/* 地点明细 */}
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
                        <div
                          key={index}
                          className="flex items-start justify-between rounded-lg border p-4"
                        >
                          <div>
                            <div className="font-medium">{venue.name}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{venue.address}</div>
                            <div className="mt-2 flex items-center gap-4 text-sm">
                              <span className="flex items-center gap-1">
                                <Phone className="size-3.5" />
                                {venue.phone}
                              </span>
                              <span className="flex items-center gap-1">
                                <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
                                {venue.rating}
                              </span>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" asChild>
                            <a href={venue.mapUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="size-4" />
                            </a>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* 预算明细表 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Wallet className="size-4" />
                      预算明细
                    </CardTitle>
                    <CardDescription>
                      总预算：¥{totalBudget.toLocaleString()} | 人均：¥
                      {Math.round(totalBudget / participants[0])}
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
                            <TableCell className="text-right">¥{item.unitPrice}</TableCell>
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
                          <TableCell className="text-right font-semibold">
                            ¥{totalBudget.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
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
