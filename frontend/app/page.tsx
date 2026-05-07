import Link from "next/link"
import { BookOpen, FileText, PartyPopper, Users, ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const features = [
  {
    title: "制度万事通",
    description: "基于 RAG 技术的公司制度智能问答，快速查询人事、财务、行政等各类制度",
    icon: BookOpen,
    href: "/policy",
    color: "bg-chart-1/10 text-chart-1",
  },
  {
    title: "公文 Copilot",
    description: "AI 驱动的公文写作助手，支持行政通知、内部请示、会议纪要等多种模板",
    icon: FileText,
    href: "/document",
    color: "bg-chart-2/10 text-chart-2",
  },
  {
    title: "团建策划师",
    description: "智能团建方案生成器，根据预算和需求自动规划完整活动方案",
    icon: PartyPopper,
    href: "/event",
    color: "bg-chart-3/10 text-chart-3",
  },
  {
    title: "访客登记管理",
    description: "数字化访客管理系统，支持扫码登记、智能填单、访客统计分析",
    icon: Users,
    href: "/visitor",
    color: "bg-chart-4/10 text-chart-4",
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b bg-muted/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
        <div className="container relative mx-auto px-4 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm">
              <Sparkles className="size-4 text-primary" />
              <span>企业智能办公平台</span>
            </div>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              灵办中心
            </h1>
            <p className="mt-6 text-pretty text-lg text-muted-foreground sm:text-xl">
              AI 赋能企业办公，让工作更高效、更智能。集成制度问答、公文写作、团建策划、访客管理四大核心功能模块。
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/policy">
                  开始使用
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#features">
                  了解更多
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            四大核心功能
          </h2>
          <p className="mt-4 text-muted-foreground">
            覆盖企业办公全场景，AI 助力提升工作效率
          </p>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Link key={feature.title} href={feature.href}>
              <Card className="group h-full transition-all hover:border-primary/50 hover:shadow-lg">
                <CardHeader>
                  <div className={`mb-4 inline-flex size-12 items-center justify-center rounded-lg ${feature.color}`}>
                    <feature.icon className="size-6" />
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    {feature.title}
                    <ArrowRight className="size-4 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-16">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">98%</div>
              <div className="mt-2 text-sm text-muted-foreground">问答准确率</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">5x</div>
              <div className="mt-2 text-sm text-muted-foreground">公文起草效率提升</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">1000+</div>
              <div className="mt-2 text-sm text-muted-foreground">团建方案生成</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">10万+</div>
              <div className="mt-2 text-sm text-muted-foreground">访客登记处理</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2024 灵办中心 - 企业智能办公平台</p>
        </div>
      </footer>
    </div>
  )
}
