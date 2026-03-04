// CV Pulse — Data Access Helpers
// All queries go through these functions. Never query Supabase directly from components.
// Epic 1.2

import { createClient } from '@/lib/supabase/server'
import type { CV, Score, Usage } from '@/types/database'

// ─────────────────────────────────────────
// CVs
// ─────────────────────────────────────────

/**
 * Get the user's most recent CV.
 * Returns null if the user has no CVs.
 */
export async function getCurrentCV(userId: string): Promise<CV | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cvs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getCurrentCV] error:', error.message)
    return null
  }

  return data
}

// ─────────────────────────────────────────
// Scores
// ─────────────────────────────────────────

/**
 * Get the most recent score for a given CV.
 * Returns null if no scores exist.
 */
export async function getLatestScore(cvId: string): Promise<Score | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('scores')
    .select('*')
    .eq('cv_id', cvId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getLatestScore] error:', error.message)
    return null
  }

  return data
}

/**
 * Get all scores for a CV — for the history view.
 */
export async function getScoreHistory(cvId: string): Promise<Score[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('scores')
    .select('*')
    .eq('cv_id', cvId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[getScoreHistory] error:', error.message)
    return []
  }

  return data ?? []
}

// ─────────────────────────────────────────
// Usage / paywall
// ─────────────────────────────────────────

/**
 * Get the user's current usage record.
 * Returns null if not found (shouldn't happen — created on sign-in).
 */
export async function getUsage(userId: string): Promise<Usage | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('usage')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[getUsage] error:', error.message)
    return null
  }

  return data
}

/**
 * Increment the usage counter for re-scores or JD checks.
 * Returns the updated usage record.
 */
export async function incrementUsage(
  userId: string,
  type: 'rescore' | 'jd_check'
): Promise<Usage | null> {
  const supabase = await createClient()

  const field = type === 'rescore' ? 'free_rescores_used' : 'free_jd_checks_used'

  const { data, error } = await supabase.rpc('increment_usage', {
    p_user_id: userId,
    p_field: field,
  })

  if (error) {
    console.error('[incrementUsage] error:', error.message)
    return null
  }

  return data
}

/**
 * Check if a user has exceeded their free usage limits.
 *
 * Option C paywall model:
 * - Re-scores: unlimited for all users — never paywalled
 * - JD checks: 2 free, then paywalled
 * - Second CV upload: gated directly in /api/upload (not tracked via Usage)
 */
export function isPaywalled(usage: Usage, action: 'rescore' | 'jd_check'): boolean {
  if (usage.paid_status !== 'free') return false

  if (action === 'rescore') return false  // unlimited re-scores (Option C)
  if (action === 'jd_check') return usage.free_jd_checks_used >= 2

  return false
}

// ─────────────────────────────────────────
// Allowlist
// ─────────────────────────────────────────

/**
 * Check if an email is in the RolePulse allowlist.
 * Uses service role — called server-side only.
 */
export async function checkAllowlist(email: string): Promise<boolean> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('allowlist')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (error) {
    console.error('[checkAllowlist] error:', error.message)
    return false
  }

  return !!data
}

// ─────────────────────────────────────────
// Events (funnel analytics)
// ─────────────────────────────────────────

/**
 * Log a funnel event. Fire and forget — never await in critical paths.
 */
export async function logEvent(
  eventName: string,
  userId?: string,
  meta?: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient()

  await supabase.from('events').insert({
    event_name: eventName,
    user_id: userId ?? null,
    meta_json: meta ?? null,
  })
}
