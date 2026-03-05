// CV Pulse — Share Link API
// Epic 12 | POST /api/cv/[id]/share — generate (or return existing) public share link
// Public share page shows redacted summary only — NO CV text, NO contact info, NO company names.

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildRedactedSummary, calculateExpiresAt, buildShareUrl } from '@/lib/share'
import type { ChecklistItem, BucketScores } from '@/types/database'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  // ── Fetch CV (must belong to this user) ────────────────────────────────────
  const { data: cv } = await supabase
    .from('cvs')
    .select('id, target_role')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cv) {
    return NextResponse.json({ error: 'CV not found' }, { status: 404 })
  }

  // ── Check for existing share link ──────────────────────────────────────────
  const { data: existing } = await supabase
    .from('share_links')
    .select('share_token')
    .eq('cv_id', id)
    .maybeSingle()

  if (existing) {
    // Refresh the redacted summary with the latest score so the share link
    // always reflects the user's most recent result after re-scoring.
    const { data: latestScoreForRefresh } = await supabase
      .from('scores')
      .select('overall_score, pass_fail, bucket_scores_json, checklist_json, created_at')
      .eq('cv_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestScoreForRefresh) {
      const freshSummary = buildRedactedSummary(
        {
          overall_score: latestScoreForRefresh.overall_score,
          pass_fail: latestScoreForRefresh.pass_fail,
          bucket_scores_json: latestScoreForRefresh.bucket_scores_json as BucketScores,
          checklist_json: (latestScoreForRefresh.checklist_json ?? []) as ChecklistItem[],
          created_at: latestScoreForRefresh.created_at,
        },
        cv.target_role
      )
      await supabase
        .from('share_links')
        .update({ redacted_summary_json: freshSummary })
        .eq('share_token', existing.share_token)
    }

    // Log fetch of existing link
    await supabase.from('events').insert({
      event_name: 'share_link_fetched',
      user_id: user.id,
      meta_json: { cv_id: id, token: existing.share_token },
    })

    return NextResponse.json({
      ok: true,
      shareUrl: buildShareUrl(existing.share_token),
      token: existing.share_token,
    })
  }

  // ── Fetch latest score ─────────────────────────────────────────────────────
  const { data: latestScore } = await supabase
    .from('scores')
    .select('overall_score, pass_fail, bucket_scores_json, checklist_json, created_at')
    .eq('cv_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestScore) {
    return NextResponse.json(
      { error: 'No score exists yet — score your CV before sharing' },
      { status: 400 }
    )
  }

  // ── Build redacted summary ─────────────────────────────────────────────────
  const redactedSummary = buildRedactedSummary(
    {
      overall_score: latestScore.overall_score,
      pass_fail: latestScore.pass_fail,
      bucket_scores_json: latestScore.bucket_scores_json as BucketScores,
      checklist_json: (latestScore.checklist_json ?? []) as ChecklistItem[],
      created_at: latestScore.created_at,
    },
    cv.target_role
  )

  // ── Generate token + insert share link ─────────────────────────────────────
  const token = crypto.randomUUID()
  const expiresAt = calculateExpiresAt()

  const { error: insertError } = await supabase
    .from('share_links')
    .insert({
      cv_id: id,
      share_token: token,
      redacted_summary_json: redactedSummary,
      expires_at: expiresAt,
    })

  if (insertError) {
    console.error('[share] Supabase insert error:', insertError.message)
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 })
  }

  // ── Log event ──────────────────────────────────────────────────────────────
  await supabase.from('events').insert({
    event_name: 'share_link_created',
    user_id: user.id,
    meta_json: { cv_id: id, token },
  })

  return NextResponse.json({
    ok: true,
    shareUrl: buildShareUrl(token),
    token,
  })
}
