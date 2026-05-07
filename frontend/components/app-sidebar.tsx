"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  FileText,
  PartyPopper,
  Users,
  ChevronDown,
  Sparkles,
  Building2,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const smartOfficeItems = [
  {
    title: "制度万事通",
    url: "/policy",
    icon: BookOpen,
    description: "公司制度问答",
  },
  {
    title: "公文 Copilot",
    url: "/document",
    icon: FileText,
    description: "智能公文写作",
  },
  {
    title: "团建策划师",
    url: "/event",
    icon: PartyPopper,
    description: "团建活动策划",
  },
  {
    title: "访客登记管理",
    url: "/visitor",
    icon: Users,
    description: "访客信息管理",
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const [isSmartOfficeOpen, setIsSmartOfficeOpen] = React.useState(true)

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">
              企业智能办公
            </span>
            <span className="text-xs text-sidebar-foreground/60">
              Enterprise Smart Office
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <Collapsible
            open={isSmartOfficeOpen}
            onOpenChange={setIsSmartOfficeOpen}
            className="group/collapsible"
          >
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70">
                <Sparkles className="size-3.5" />
                <span>灵办中心</span>
                <ChevronDown className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {smartOfficeItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === item.url}
                        tooltip={item.description}
                      >
                        <Link href={item.url}>
                          <item.icon className="size-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              管理
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sidebar-foreground">
              管理员
            </span>
            <span className="text-xs text-sidebar-foreground/60">
              admin@company.com
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
