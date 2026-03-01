// CV Pulse — Score API
// Epic 4 | POST /api/cv/[id]/score — runs deterministic scoring engine, saves to DB
// Epic 10 | Usage gate: first score for a CV is always free. Re-score #2+ is gated.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scoreCV } from '@/lib/scorer'
import type { StructuredCV } from '@/types/database'
import type { TargetRole } from '@/lib/roleDetect'
import { ALL_ROLES } from '@/lib/roleDetect'

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

  // ── Fetch CV ──────────────────────────────────────────────────────────────
  const { data: cv } = await supabase
    .from('cvs')
    .select('id, raw_text, structured_json, target_role')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cv) {
    return NextResponse.json({ error: 'CV not found' }, { status: 404 })
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!cv.target_role || !(ALL_ROLES as string[]).includes(cv.target_role)) {
    return NextResponse.json(
      { error: 'Select a target role before scoring' },
      { status: 400 }
    )
  }

  if (!cv.structured_json || !cv.raw_text) {
    return NextResponse.json({ error: 'CV has no parseable content' }, { status: 400 })
  }

  // ── Usage gate (Epic 10) ──────────────────────────────────────────────────
  // First score for a CV is always free (no usage deducted).
  // Re-score #2+ is gated for free users (free_rescores_used >= 1).
  const { count: existingScoreCount } = await supabase
    .from('scores')
    .select('id', { count: 'exact', head: true })
    .eq('cv_id', id)

  const isFirstScore = (existingScoreCount ?? 0) === 0

  if (!isFirstScore) {
    const { data: usage } = await supabase
      .from('usage')
      .select('free_rescores_used, paid_status')
      .eq('user_id', user.id)
      .maybeSingle()

    const isPaid = usage?.paid_status !== 'free'
    const rescoresUsed = usage?.free_rescores_used ?? 0

    if (!isPaid && rescoresUsed >= 1) {
      // Log paywall hit event
      await supabase.from('events').insert({
        event_name: 'paywall_hit',
        user_id: user.id,
        meta_json: { action: 'rescore', cv_id: id, rescores_used: rescoresUsed },
      })
      return NextResponse.json(
        {
          error: 'paywall',
          rescoresUsed,
          rescoresRemaining: 0,
          message: "You've used your 1 free re-score. Upgrade to unlock unlimited re-scores.",
        },
        { status: 402 }
      )
    }
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const result = scoreCV(
    cv.structured_json as StructuredCV,
    cv.raw_text,
    cv.target_role as TargetRole,
  )

  // ── Save to scores table ──────────────────────────────────────────────────
  const bucketScores = {
    proof_of_impact: result.buckets.proofOfImpact.score,
    ats_keywords: result.buckets.atsKeywords.score,
    formatting: result.buckets.formatting.score,
    clarity: result.buckets.clarity.score,
  }

  // Build penalties from critical concerns
  const penalties = result.criticalConcerns.map((concern) => ({
    code: concern.replace(/\s+/g, '_').toLowerCase().slice(0, 50),
    reason: concern,
  }))

  // Checklist for DB (simplified schema)
  const checklistForDB = result.checklist.map((item) => ({
    id: item.id,
    done: item.done,
    action: item.action,
    why: item.whyItMatters,
    example: '',
    points: item.potentialPoints,
  }))

  const { data: score, error: insertError } = await supabase
    .from('scores')
    .insert({
      cv_id: id,
      overall_score: result.overallScore,
      pass_fail: result.passFail,
      bucket_scores_json: bucketScores,
      penalties_json: penalties,
      checklist_json: checklistForDB,
    })
    .select()
    .single()

  if (insertError || !score) {
    console.error('[score] Supabase insert error:', insertError?.message)
    return NextResponse.json({ error: 'Failed to save score — please try again' }, { status: 500 })
  }

  // ── Increment usage for re-scores (not first score) (Epic 10) ───────────
  // Uses the increment_usage RPC for atomic increment (no race conditions)
  if (!isFirstScore) {
    await supabase.rpc('increment_usage', {
      p_user_id: user.id,
      p_field: 'free_rescores_used',
    })
  }

  // ── Log event ─────────────────────────────────────────────────────────────
  await supabase.from('events').insert({
    event_name: isFirstScore ? 'cv_scored' : 'cv_rescored',
    user_id: user.id,
    meta_json: {
      cv_id: id,
      score_id: score.id,
      overall_score: result.overallScore,
      pass_fail: result.passFail,
      target_role: cv.target_role,
      is_first_score: isFirstScore,
    },
  })

  // ── Return full result ────────────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    scoreId: score.id,
    result,
  })
}

// ── GET — fetch existing score for this CV ────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  // Verify ownership + get lastEdited timestamp
  const { data: cv } = await supabase
    .from('cvs')
    .select('id, target_role, structured_json, raw_text, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cv) {
    return NextResponse.json({ error: 'CV not found' }, { status: 404 })
  }

  // Fetch ALL scores ordered ascending — gives us first (initial) and last (latest)
  const { data: allScores } = await supabase
    .from('scores')
    .select('id, overall_score, pass_fail, bucket_scores_json, penalties_json, checklist_json, created_at')
    .eq('cv_id', id)
    .order('created_at', { ascending: true })

  if (!allScores || allScores.length === 0) {
    return NextResponse.json({ hasScore: false })
  }

  const firstScore = allScores[0]
  const latestScore = allScores[allScores.length - 1]
  const checklist = (latestScore.checklist_json ?? []) as Array<{ done: boolean }>

  return NextResponse.json({
    hasScore: true,
    score: {
      id: latestScore.id,
      overallScore: latestScore.overall_score,
      passFail: latestScore.pass_fail,
      bucketScores: latestScore.bucket_scores_json,
      penalties: latestScore.penalties_json,
      checklist: latestScore.checklist_json,
      createdAt: latestScore.created_at,
    },
    // Score history data for the editor sidebar
    initialScore: firstScore.overall_score,
    resolvedCount: checklist.filter((i) => i.done).length,
    totalItems: checklist.length,
    lastEdited: (cv as { updated_at: string }).updated_at,
  })
}
