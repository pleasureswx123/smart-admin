// 与后端 schemas 对齐的 TypeScript 类型镜像。

// ===== Policy =====
export interface KnowledgeFile {
  id: string
  name: string
  category: string
  access_level: string
  file_path: string
  size_bytes: number
  page_count: number | null
  status: string
  chunk_count: number
  created_at: string
  updated_at: string
}

export interface CategoryItem {
  category: string
  file_count: number
}

export interface QuickQuestion {
  text: string
  category: string | null
}

export interface PolicyCitation {
  id: number
  source: string
  text: string
  file_id: string
  page: number | null
  score: number
}

// ===== Document =====
export type DocType = "notice" | "request" | "reward" | "meeting"
export type DocTone = "formal" | "friendly" | "strict"
export type AuditLevel = "success" | "info" | "warning"

export interface DocTemplate {
  id: string
  type: string
  name: string
  description: string
  body: string
  is_system: boolean
}

export interface AuditItem {
  type: AuditLevel
  title: string
  description: string
}

export interface ExportPdfResponse {
  download_url: string
  file_path: string
  size_bytes: number
}

// ===== Visitor =====
export interface HostMatch {
  id: string
  name: string
  nickname: string | null
  department: string
  title: string | null
  score: number
}

export interface OcrCardResponse {
  name: string
  company: string
  phone: string
  title: string
  confidence: number
}

export type VisitorStatus = "registered" | "entered" | "left"

export interface VisitorOut {
  id: string
  name: string
  company: string
  phone_masked: string
  purpose: string | null
  host_employee_id: string | null
  host_name: string
  host_match_score: number
  status: VisitorStatus
  check_in_at: string | null
  check_out_at: string | null
  push_status: string
  source: string
  created_at: string
}

export interface VisitorListResponse {
  items: VisitorOut[]
  total: number
  page: number
  page_size: number
}

export interface VisitorStats {
  today_total: number
  today_entered: number
  today_left: number
  weekly_total: number
}

export interface WeeklyTrendPoint {
  day: string
  date: string
  count: number
}

export interface WeeklyTrendResponse {
  points: WeeklyTrendPoint[]
}

// ===== Event =====
export interface CityItem {
  code: string
  name: string
}

export interface ActivityTypeItem {
  id: string
  label: string
}

export interface ScheduleItem {
  time: string
  activity: string
  location: string
}

export interface VenueItem {
  name: string
  address: string
  phone: string
  rating: number
  map_url: string
}

export interface BudgetLine {
  item: string
  unit_price: number
  quantity: number
  total: number
}

export interface PlanDetail {
  name: string
  description: string
  schedule: ScheduleItem[]
  venues: VenueItem[]
  budget: BudgetLine[]
  total: number
}

export interface PlanRead {
  id: string
  participants: number
  per_capita_budget: number
  city: string
  activity_types: string[]
  plan_a: PlanDetail
  plan_b: PlanDetail
  created_at: string
}
