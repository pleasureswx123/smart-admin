"use client"

import * as React from "react"
import {
  FileText,
  Sparkles,
  Download,
  Copy,
  Save,
  AlertTriangle,
  CheckCircle,
  Info,
  Wand2,
  Tag,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// 模板数据
const templates = {
  notice: [
    { id: 1, name: "通用通知模板", description: "适用于日常行政通知" },
    { id: 2, name: "紧急通知模板", description: "适用于紧急事项通知" },
    { id: 3, name: "节假日通知", description: "适用于节假日安排通知" },
  ],
  request: [
    { id: 4, name: "经费申请模板", description: "适用于项目经费申请" },
    { id: 5, name: "采购申请模板", description: "适用于物资采购申请" },
    { id: 6, name: "人员调动申请", description: "适用于人事调动申请" },
  ],
  reward: [
    { id: 7, name: "表彰通报模板", description: "适用于优秀员工表彰" },
    { id: 8, name: "处罚通报模板", description: "适用于违规行为通报" },
    { id: 9, name: "奖励决定模板", description: "适用于奖励决定发布" },
  ],
  meeting: [
    { id: 10, name: "会议纪要模板", description: "适用于常规会议记录" },
    { id: 11, name: "专题会议纪要", description: "适用于专题研讨会议" },
    { id: 12, name: "部门例会纪要", description: "适用于部门例会记录" },
  ],
}

const toneOptions = [
  { value: "formal", label: "正式", description: "官方正式语气" },
  { value: "friendly", label: "温馨", description: "亲切友好语气" },
  { value: "strict", label: "严厉", description: "严肃警示语气" },
]

// 模拟生成的内容
const mockGeneratedContent = `关于办公区域禁止吸烟的通知

各部门、全体员工：

为营造健康、文明、舒适的办公环境，保障全体员工的身心健康，根据《公共场所卫生管理条例》及公司相关规定，现就办公区域禁烟事项通知如下：

一、禁烟范围
公司所有办公区域，包括但不限于：办公室、会议室、走廊、电梯间、卫生间、茶水间等室内公共区域。

二、具体要求
1. 全体员工应自觉遵守禁烟规定，不得在禁烟区域内吸烟；
2. 员工如有吸烟需求，请前往指定吸烟区（负一层西侧露台）；
3. 各部门负责人应加强本部门禁烟管理，做好宣传教育工作；
4. 来访人员由接待部门负责告知禁烟规定。

三、监督管理
1. 行政部将不定期进行巡查，对违规吸烟行为进行记录；
2. 首次违规予以警告，二次违规通报批评，三次及以上违规按公司制度处理。

本通知自发布之日起执行，请各部门、全体员工认真遵照执行。

特此通知。

                                        行政管理部
                                        2024年3月20日`

// 模拟审计反馈
const mockAuditFeedback = [
  {
    type: "success",
    title: "格式规范",
    description: "公文格式符合标准，包含完整的标题、正文、落款等要素。",
  },
  {
    type: "info",
    title: "语气建议",
    description: "建议在「具体要求」部分增加正向激励措辞，提升员工配合度。",
  },
  {
    type: "warning",
    title: "敏感词提醒",
    description: "检测到「处理」一词较为模糊，建议明确具体的处理措施。",
  },
]

export default function DocumentPage() {
  const [activeTab, setActiveTab] = React.useState("notice")
  const [selectedTemplate, setSelectedTemplate] = React.useState<number | null>(null)
  const [topic, setTopic] = React.useState("")
  const [keywords, setKeywords] = React.useState<string[]>([])
  const [keywordInput, setKeywordInput] = React.useState("")
  const [tone, setTone] = React.useState("formal")
  const [generatedContent, setGeneratedContent] = React.useState("")
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [showAudit, setShowAudit] = React.useState(false)

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()])
      setKeywordInput("")
    }
  }

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword))
  }

  const handleGenerate = () => {
    if (!topic.trim()) return
    setIsGenerating(true)
    setShowAudit(false)

    // 模拟生成过程
    setTimeout(() => {
      setGeneratedContent(mockGeneratedContent)
      setIsGenerating(false)
      setShowAudit(true)
    }, 2000)
  }

  const handleOptimize = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setGeneratedContent(
        generatedContent.replace(
          "按公司制度处理",
          "按公司《员工行为规范》第三章相关条款处理，情节严重者将给予书面警告处分"
        )
      )
      setIsGenerating(false)
    }, 1000)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent)
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* 顶部：模板选择区 */}
      <div className="border-b bg-muted/30 px-6 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">公文 Copilot</h1>
              <p className="text-sm text-muted-foreground">AI 驱动的智能公文写作助手</p>
            </div>
            <TabsList>
              <TabsTrigger value="notice">行政通知</TabsTrigger>
              <TabsTrigger value="request">内部请示</TabsTrigger>
              <TabsTrigger value="reward">处罚/奖励</TabsTrigger>
              <TabsTrigger value="meeting">会议纪要</TabsTrigger>
            </TabsList>
          </div>

          {Object.entries(templates).map(([key, items]) => (
            <TabsContent key={key} value={key} className="mt-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {items.map((template) => (
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
                        <div className="text-xs text-muted-foreground">
                          {template.description}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：指令配置区 */}
        <div className="w-[400px] flex-shrink-0 border-r">
          <ScrollArea className="h-full">
            <div className="p-6">
              <div className="space-y-6">
                {/* 公文主题 */}
                <div className="space-y-2">
                  <Label htmlFor="topic">公文主题</Label>
                  <Input
                    id="topic"
                    placeholder="例如：关于办公区禁烟的通知"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>

                {/* 关键词 */}
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
                      {keywords.map((keyword) => (
                        <Badge key={keyword} variant="secondary" className="gap-1">
                          {keyword}
                          <button
                            onClick={() => handleRemoveKeyword(keyword)}
                            className="ml-1 rounded-full hover:bg-muted"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* 语气选择 */}
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

                {/* 操作按钮 */}
                <div className="flex gap-3">
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleGenerate}
                    disabled={isGenerating || !topic.trim()}
                  >
                    <Sparkles className="size-4" />
                    开始起草
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={handleOptimize}
                    disabled={isGenerating || !generatedContent}
                  >
                    <Wand2 className="size-4" />
                    AI 优化
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* 右侧：实时预览与审计 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* 上层：Markdown 编辑器 */}
          <div className="flex-1 overflow-hidden border-b">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="text-sm font-medium">内容预览</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!generatedContent}>
                    <Copy className="mr-1 size-3.5" />
                    复制
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {isGenerating ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="text-center">
                        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                          <Sparkles className="size-6 animate-pulse text-primary" />
                        </div>
                        <p className="text-sm text-muted-foreground">AI 正在生成内容...</p>
                      </div>
                    </div>
                  ) : generatedContent ? (
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      className="min-h-[400px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
                    />
                  ) : (
                    <div className="flex items-center justify-center py-20">
                      <div className="text-center text-muted-foreground">
                        <FileText className="mx-auto mb-4 size-12 opacity-30" />
                        <p>填写左侧配置信息</p>
                        <p className="text-sm">点击"开始起草"生成公文</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* 下层：AI 审计反馈 */}
          <div className="h-[200px] flex-shrink-0 overflow-hidden">
            <div className="flex h-full flex-col">
              <div className="flex items-center border-b px-4 py-2">
                <span className="text-sm font-medium">AI 审计反馈</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {showAudit ? (
                    <div className="space-y-3">
                      {mockAuditFeedback.map((feedback, index) => (
                        <Alert
                          key={index}
                          variant={feedback.type === "warning" ? "destructive" : "default"}
                          className={cn(
                            feedback.type === "success" && "border-green-500/50 bg-green-500/10",
                            feedback.type === "info" && "border-blue-500/50 bg-blue-500/10"
                          )}
                        >
                          {feedback.type === "success" && (
                            <CheckCircle className="size-4 text-green-500" />
                          )}
                          {feedback.type === "info" && (
                            <Info className="size-4 text-blue-500" />
                          )}
                          {feedback.type === "warning" && (
                            <AlertTriangle className="size-4" />
                          )}
                          <AlertTitle className="text-sm">{feedback.title}</AlertTitle>
                          <AlertDescription className="text-xs">
                            {feedback.description}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8 text-center text-sm text-muted-foreground">
                      生成公文后将显示审计结果
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* 底部动作栏 */}
          <div className="flex items-center justify-end gap-3 border-t bg-muted/30 px-4 py-3">
            <Button variant="outline" size="sm" disabled={!generatedContent}>
              <Download className="mr-2 size-4" />
              转为 PDF
            </Button>
            <Button variant="outline" size="sm" disabled={!generatedContent}>
              <Save className="mr-2 size-4" />
              保存为模板
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!generatedContent}>
              <Copy className="mr-2 size-4" />
              复制到剪贴板
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
