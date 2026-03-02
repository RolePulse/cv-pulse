// CV Pulse — Share Link Helpers
// Epic 12 | Pure functions for building redacted summaries and share link logic.
// These are extracted from the API route so they can be unit-tested without Supabase.

import type { BucketScores, ChecklistItem, RedactedSummary } from '@/types/database'

/**
 * Build a redacted summary from a score row + target role.
 * ONLY includes: score, pass_fail, bucket_scores, checklist_titles (action text only), target_role, scored_at.
 * NEVER includes: raw_text, structured_json, contact info, company names, checklist descriptions.
 */
export function buildRedactedSummary(
  score: {
    overall_score: number
    pass_fail: boolean
    bucket_scores_json: BucketScores
    checklist_json: ChecklistItem[]
    created_at: string
  },
  targetRole: string | null
): RedactedSummary {
  return {
    score: score.overall_score,
    pass_fail: score.pass_fail,
    target_role: targetRole,
    bucket_scores: {
      proof_of_impact: score.bucket_scores_json.proof_of_impact,
      ats_keywords: score.bucket_scores_json.ats_keywords,
      formatting: score.bucket_scores_json.formatting,
      clarity: score.bucket_scores_json.clarity,
    },
    checklist_titles: score.checklist_json.map((item) => item.action),
    scored_at: score.created_at,
  }
}

/**
 * Calculate the expiry date for a share link (90 days from now).
 */
export function calculateExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Check whether a share link has expired.
 */
export function isShareExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < now
}

/**
 * Build the public share URL from a token.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_BASE_URL   — explicitly configured (preferred)
 *   2. VERCEL_URL             — automatically set by Vercel on every deployment
 *   3. https://cvpulse.io     — production fallback
 */
export function buildShareUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://cvpulse.io')
  return `${base}/share/${token}`
}
