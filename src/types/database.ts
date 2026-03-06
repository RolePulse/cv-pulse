// CV Pulse — Database Types
// Matches the Supabase schema in supabase/migrations/001_initial_schema.sql

export type PaidStatus = 'free' | 'rolepulse_paid' | 'paid_stripe'

export interface User {
  id: string
  email: string
  name: string | null
  rolepulse_paid: boolean
  created_at: string
}

export interface CV {
  id: string
  user_id: string
  raw_text: string
  structured_json: StructuredCV | null
  parse_confidence: number | null
  parse_fail_reason: string | null
  target_role: string | null
  created_at: string
  updated_at: string
}

export interface StructuredCV {
  name?: string              // Full name
  email?: string             // Contact email
  phone?: string             // Contact phone
  location?: string          // City, Country/State
  linkedin?: string          // e.g. "linkedin.com/in/jamesfowles" or full URL
  summary: string
  experience: ExperienceRole[]
  skills: string[]
  education: EducationEntry[]
  certifications: string[]
}

export interface ExperienceRole {
  company: string
  title: string
  start: string
  end: string | null  // null = present
  bullets: string[]
}

export interface EducationEntry {
  institution: string
  qualification: string
  year: string
}

export interface BucketScores {
  proof_of_impact: number   // max 35
  ats_keywords: number      // max 25
  formatting: number        // max 20
  clarity: number           // max 20
}

export interface Penalty {
  code: string
  reason: string
}

export interface ChecklistItem {
  id: string
  done: boolean
  action: string
  why: string
  example: string
  points: number
}

export interface Score {
  id: string
  cv_id: string
  overall_score: number
  pass_fail: boolean
  bucket_scores_json: BucketScores
  penalties_json: Penalty[]
  checklist_json: ChecklistItem[]
  created_at: string
}

export interface JDCheck {
  id: string
  user_id: string
  cv_id: string | null
  jd_text: string
  match_score: number | null
  missing_keywords_json: string[] | null
  created_at: string
}

export interface Usage {
  user_id: string
  free_rescores_used: number
  free_jd_checks_used: number
  paid_status: PaidStatus
  updated_at: string
}

export interface AllowlistEntry {
  email: string
  added_at: string
  source: string | null
}

export interface Event {
  id: string
  user_id: string | null
  event_name: string
  meta_json: Record<string, unknown> | null
  created_at: string
}

export interface ShareLink {
  id: string
  cv_id: string
  share_token: string
  redacted_summary_json: RedactedSummary
  created_at: string
  expires_at: string | null
}

export interface RedactedSummary {
  score: number
  pass_fail: boolean
  target_role: string | null
  bucket_scores: BucketScores
  checklist_titles: string[]
  scored_at: string
}
