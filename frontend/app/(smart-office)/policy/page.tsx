"use client"

import * as React from "react"
import { Send, Trash2, BookOpen, Clock, Upload, FileText, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// 模拟知识库数据
const knowledgeCategories = [
  {
    name: "人事类",
    files: [
      { name: "员工手册 v3.2.pdf", updatedAt: "2024-03-15" },
      { name: "考勤管理制度.pdf", updatedAt: "2024-02-20" },
      { name: "薪酬福利制度.pdf", updatedAt: "2024-01-10" },
    ],
  },
  {
    name: "财务类",
    files: [
      { name: "报销管理办法.pdf", updatedAt: "2024-03-01" },
      { name: "差旅费用标准.pdf", updatedAt: "2024-02-15" },
      { name: "预算管理制度.pdf", updatedAt: "2024-01-20" },
    ],
  },
  {
    name: "行政类",
    files: [
      { name: "办公用品管理.pdf", updatedAt: "2024-03-10" },
      { name: "会议室使用规定.pdf", updatedAt: "2024-02-28" },
      { name: "车辆使用管理.pdf", updatedAt: "2024-01-15" },
    ],
  },
]

// 常用问题
const quickQuestions = [
  "年假有多少天？",
  "报销流程是什么？",
  "加班如何计算？",
  "请假需要提前多久？",
]

// 模拟对话数据
interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: { id: number; source: string; text: string }[]
}

const initialMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "您好！我是制度万事通，您可以向我咨询公司的各项规章制度。请问有什么可以帮助您的？",
  },
]

export default function PolicyPage() {
  const [messages, setMessages] = React.useState<Message[]>(initialMessages)
  const [input, setInput] = React.useState("")
  const [selectedCitation, setSelectedCitation] = React.useState<{
    id: number
    source: string
    text: string
  } | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  React.useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    // 模拟 AI 响应
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `根据《员工手册 v3.2》的规定，关于您咨询的"${input}"问题：

1. **基本规定**：员工入职满一年后，可享受带薪年假。年假天数根据工龄计算[1]。

2. **具体标准**：
   - 工龄1-10年：5天/年
   - 工龄10-20年：10天/年  
   - 工龄20年以上：15天/年[2]

3. **使用说明**：年假需提前3个工作日申请，经直属上级批准后方可休假[1]。

如需了解更多详情，请参考右侧的原文溯源。`,
        citations: [
          {
            id: 1,
            source: "员工手册 v3.2.pdf - 第四章 休假制度",
            text: "第十五条 员工入职满一年后，根据国家规定享受带薪年休假。年休假天数根据员工累计工龄计算，员工需提前3个工作日提交休假申请，经部门负责人审批后生效。",
          },
          {
            id: 2,
            source: "员工手册 v3.2.pdf - 第四章 休假制度",
            text: "第十六条 年休假天数标准：（一）职工累计工作已满1年不满10年的，年休假5天；（二）已满10年不满20年的，年休假10天；（三）已满20年的，年休假15天。",
          },
        ],
      }
      setMessages((prev) => [...prev, aiResponse])
      setIsLoading(false)
    }, 1500)
  }

  const handleClearChat = () => {
    setMessages(initialMessages)
    setSelectedCitation(null)
  }

  const handleQuickQuestion = (question: string) => {
    setInput(question)
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* 左侧：知识库目录 */}
      <div className="hidden w-[280px] flex-shrink-0 border-r bg-muted/30 lg:block">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-sm font-semibold">知识库目录</h2>
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <Upload className="size-3.5" />
              上传
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              {knowledgeCategories.map((category) => (
                <div key={category.name} className="mb-6">
                  <div className="mb-2 flex items-center gap-2">
                    <BookOpen className="size-4 text-primary" />
                    <span className="text-sm font-medium">{category.name}</span>
                  </div>
                  <div className="space-y-1 pl-6">
                    {category.files.map((file) => (
                      <div
                        key={file.name}
                        className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <FileText className="size-3.5 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-muted-foreground group-hover:text-foreground">
                          {file.name}
                        </span>
                        <Badge variant="secondary" className="hidden text-[10px] group-hover:inline-flex">
                          <Clock className="mr-1 size-2.5" />
                          {file.updatedAt}
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

        {/* 对话内容 */}
        <ScrollArea className="flex-1 p-4">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {message.content.split("\n").map((line, i) => (
                      <p key={i} className="mb-2 last:mb-0">
                        {line.split(/\[(\d+)\]/).map((part, j) => {
                          if (/^\d+$/.test(part)) {
                            const citationId = parseInt(part)
                            const citation = message.citations?.find(
                              (c) => c.id === citationId
                            )
                            return citation ? (
                              <button
                                key={j}
                                onClick={() => setSelectedCitation(citation)}
                                className={cn(
                                  "mx-0.5 inline-flex size-5 items-center justify-center rounded text-xs font-medium transition-colors",
                                  message.role === "user"
                                    ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
                                    : "bg-primary/10 text-primary hover:bg-primary/20"
                                )}
                              >
                                {citationId}
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
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg bg-muted px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                    <div className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                    <div className="size-2 animate-bounce rounded-full bg-primary" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* 快捷问题 */}
        <div className="border-t bg-muted/30 px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 text-xs text-muted-foreground">常用问题</div>
            <div className="flex flex-wrap gap-2">
              {quickQuestions.map((question) => (
                <Button
                  key={question}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleQuickQuestion(question)}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* 输入框 */}
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
              />
              <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：原文溯源面板 */}
      <div className="hidden w-[320px] flex-shrink-0 border-l bg-muted/30 xl:block">
        <div className="flex h-full flex-col">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold">参考来源</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              点击对话中的引用标签查看原文
            </p>
          </div>
          <ScrollArea className="flex-1">
            {selectedCitation ? (
              <div className="p-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Badge className="size-5 justify-center p-0 text-xs">
                        {selectedCitation.id}
                      </Badge>
                      <CardTitle className="text-sm font-medium">
                        引用来源
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="size-3.5" />
                      <span>{selectedCitation.source}</span>
                    </div>
                    <Separator />
                    <div className="rounded-md bg-accent/50 p-3">
                      <p className="text-sm leading-relaxed">
                        {selectedCitation.text}
                      </p>
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
    </div>
  )
}
