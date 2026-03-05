// CV Pulse — Admin: Send Nudge Emails
// POST /api/admin/send-nudge-emails
//
// Finds users whose latest CV score is below 70 and who haven't received a
// nudge email in the last 7 days. Sends each a personalised email via Resend
// with their top 3 unfixed checklist items and a direct link back to /score.
//
// Auth: CRON_SECRET header (for Vercel Cron) OR signed-in admin session.
// Requires env: RESEND_API_KEY, ADMIN_EMAIL, NEXT_PUBLIC_SITE_URL.

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buildNudgeEmail } from '@/lib/email/nudge'
import type { ChecklistItem } from '@/types/database'

const SCORE_THRESHOLD   = 70
const NUDGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
const BATCH_LIMIT       = 100                        // max emails per run
const FROM_ADDRESS      = 'CV Pulse <hello@cvpulse.io>'

async function handleNudge(req: NextRequest) {
  // ── Auth: Vercel Cron secret OR admin session ────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL ?? ''
  const cronSecret = process.env.CRON_SECRET  ?? ''
  const resendKey  = process.env.RESEND_API_KEY ?? ''

  const authHeader = req.headers.get('authorization') ?? ''
  const isCronCall = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCronCall) {
    // Fall back to checking a signed-in admin session
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== adminEmail) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
  }

  if (!resendKey) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY not configured — add it to your environment variables.' },
      { status: 503 },
    )
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cvpulse.io').replace(/\/$/, '')
  const resend  = new Resend(resendKey)
  const admin   = await createAdminClient()

  // ── 1. Find all scores below threshold ───────────────────────────────────
  const { data: allScores, error: scoresErr } = await admin
    .from('scores')
    .select('id, cv_id, overall_score, checklist_json, created_at')
    .lt('overall_score', SCORE_THRESHOLD)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (scoresErr) {
    return NextResponse.json({ error: 'DB error fetching scores', detail: scoresErr.message }, { status: 500 })
  }

  // Latest score per CV (list is already ordered newest-first)
  const latestByCvId = new Map<string, typeof allScores[0]>()
  for (const score of allScores ?? []) {
    if (!latestByCvId.has(score.cv_id)) {
      latestByCvId.set(score.cv_id, score)
    }
  }

  if (latestByCvId.size === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, message: 'No users below threshold.' })
  }

  const cvIds = [...latestByCvId.keys()]

  // ── 2. Get CV info ────────────────────────────────────────────────────────
  const { data: cvs } = await admin
    .from('cvs')
    .select('id, user_id, target_role')
    .in('id', cvIds)

  if (!cvs?.length) {
    return NextResponse.json({ sent: 0, skipped: 0, message: 'No CVs found.' })
  }

  const userIds = [...new Set(cvs.map((c) => c.user_id))]

  // ── 3. Get user info ──────────────────────────────────────────────────────
  const { data: users } = await admin
    .from('users')
    .select('id, email, name')
    .in('id', userIds)

  const userMap = new Map((users ?? []).map((u) => [u.id, u]))

  // ── 4. Find recently nudged users (last 7 days) ───────────────────────────
  const cutoff = new Date(Date.now() - NUDGE_INTERVAL_MS).toISOString()
  const { data: recentNudges } = await admin
    .from('events')
    .select('user_id')
    .eq('event_name', 'nudge_email_sent')
    .gte('created_at', cutoff)

  const nudgedUserIds = new Set((recentNudges ?? []).map((e) => e.user_id))

  // ── 5. Build list to nudge ────────────────────────────────────────────────
  type NudgeTarget = {
    userId:     string
    email:      string
    name:       string | null
    cvId:       string
    targetRole: string
    score:      number
    topFixes:   ChecklistItem[]
  }

  const toNudge: NudgeTarget[] = []

  for (const cv of cvs) {
    if (nudgedUserIds.has(cv.user_id)) continue
    if (toNudge.length >= BATCH_LIMIT) break

    const user  = userMap.get(cv.user_id)
    const score = latestByCvId.get(cv.id)
    if (!user?.email || !score) continue

    // Top 3 unfixed checklist items, highest points first
    const unfixed: ChecklistItem[] = ((score.checklist_json ?? []) as ChecklistItem[])
      .filter((item) => !item.done)
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)

    toNudge.push({
      userId:     cv.user_id,
      email:      user.email,
      name:       user.name,
      cvId:       cv.id,
      targetRole: cv.target_role ?? 'ae',
      score:      score.overall_score,
      topFixes:   unfixed,
    })
  }

  if (toNudge.length === 0) {
    return NextResponse.json({ sent: 0, skipped: cvIds.length, message: 'All eligible users nudged recently.' })
  }

  // ── 6. Send emails & log events ───────────────────────────────────────────
  let sent    = 0
  let failed  = 0
  const errors: string[] = []

  for (const target of toNudge) {
    const { subject, html, text } = buildNudgeEmail({
      userName:    target.name,
      targetRole:  target.targetRole,
      score:       target.score,
      topFixes:    target.topFixes,
      scoreUrl:    `${siteUrl}/score?cvId=${target.cvId}`,
      settingsUrl: `${siteUrl}/settings`,
    })

    try {
      const { error: sendErr } = await resend.emails.send({
        from:    FROM_ADDRESS,
        to:      [target.email],
        subject,
        html,
        text,
      })

      if (sendErr) {
        failed++
        errors.push(`${target.email}: ${sendErr.message}`)
        continue
      }

      // Log nudge event so we don't re-send within 7 days
      await admin.from('events').insert({
        user_id:    target.userId,
        event_name: 'nudge_email_sent',
        meta_json:  { cv_id: target.cvId, score: target.score, role: target.targetRole },
      })

      sent++
    } catch (err) {
      failed++
      errors.push(`${target.email}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  return NextResponse.json({
    sent,
    failed,
    skipped: cvIds.length - toNudge.length,
    total_eligible: toNudge.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}

// Vercel Cron sends GET; manual admin trigger uses POST — both call the same handler.
export const GET  = handleNudge
export const POST = handleNudge
