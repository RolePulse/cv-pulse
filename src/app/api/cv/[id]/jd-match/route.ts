// CV Pulse — JD Match API
// Epic 9 | POST /api/cv/[id]/jd-match
//
// Request body: { jdText: string }
// Response:     { ok, result, checkId, checksUsed, checksRemaining }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchJD } from '@/lib/jdMatcher'
import type { StructuredCV } from '@/types/database'
import type { TargetRole } from '@/lib/roleDetect'
import { ALL_ROLES } from '@/lib/roleDetect'

const FREE_JD_CHECKS = 2

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let jdText: string
  try {
    const body = await request.json()
    jdText = (body?.jdText ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (jdText.length < 100) {
    return NextResponse.json(
      { error: 'Job description is too short — paste the full JD (100+ characters)' },
      { status: 400 }
    )
  }

  // ── Fetch CV (verify ownership) ───────────────────────────────────────────
  const { data: cv } = await supabase
    .from('cvs')
    .select('id, raw_text, structured_json, target_role')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cv) {
    return NextResponse.json({ error: 'CV not found' }, { status: 404 })
  }

  if (!cv.target_role || !(ALL_ROLES as string[]).includes(cv.target_role)) {
    return NextResponse.json(
      { error: 'Select a target role before running JD match' },
      { status: 400 }
    )
  }

  if (!cv.raw_text) {
    return NextResponse.json({ error: 'CV has no parseable content' }, { status: 400 })
  }

  // ── Usage check ───────────────────────────────────────────────────────────
  const { data: usage } = await supabase
    .from('usage')
    .select('free_jd_checks_used, paid_status')
    .eq('user_id', user.id)
    .maybeSingle()

  const checksUsed = usage?.free_jd_checks_used ?? 0
  const isPaid = usage?.paid_status !== 'free'

  if (!isPaid && checksUsed >= FREE_JD_CHECKS) {
    return NextResponse.json(
      {
        error: 'paywall',
        checksUsed,
        checksRemaining: 0,
        message: `You've used all ${FREE_JD_CHECKS} free JD checks. Upgrade to run more.`,
      },
      { status: 402 }
    )
  }

  // ── Run JD match ──────────────────────────────────────────────────────────
  const result = matchJD(
    cv.raw_text,
    jdText,
    cv.target_role as TargetRole,
  )

  // ── Save to jd_checks ─────────────────────────────────────────────────────
  const { data: check, error: insertError } = await supabase
    .from('jd_checks')
    .insert({
      user_id: user.id,
      cv_id: id,
      jd_text: jdText,
      match_score: result.matchScore,
      missing_keywords_json: result.missingKeywords,
    })
    .select('id')
    .single()

  if (insertError || !check) {
    console.error('[jd-match] insert error:', insertError?.message)
    return NextResponse.json({ error: 'Failed to save JD check — please try again' }, { status: 500 })
  }

  // ── Increment usage ───────────────────────────────────────────────────────
  if (!isPaid) {
    await supabase
      .from('usage')
      .update({
        free_jd_checks_used: checksUsed + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
  }

  // ── Log event ─────────────────────────────────────────────────────────────
  await supabase.from('events').insert({
    event_name: 'jd_match_run',
    user_id: user.id,
    meta_json: {
      cv_id: id,
      check_id: check.id,
      match_score: result.matchScore,
      target_role: cv.target_role,
      jd_keyword_count: result.jdKeywords.length,
      matched_count: result.matchedKeywords.length,
      missing_count: result.missingKeywords.length,
    },
  })

  const newChecksUsed = isPaid ? checksUsed : checksUsed + 1
  const checksRemaining = isPaid ? null : Math.max(FREE_JD_CHECKS - newChecksUsed, 0)

  return NextResponse.json({
    ok: true,
    checkId: check.id,
    result,
    checksUsed: newChecksUsed,
    checksRemaining,
  })
}
