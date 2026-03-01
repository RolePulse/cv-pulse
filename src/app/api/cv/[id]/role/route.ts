// CV Pulse — Target Role API
// Epic 3 | PATCH /api/cv/[id]/role — saves target role to cvs table

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { TargetRole } from '@/lib/roleDetect'
import { ALL_ROLES } from '@/lib/roleDetect'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  // ── Validate body ─────────────────────────────────────────────────────────
  let body: { targetRole?: TargetRole }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { targetRole } = body
  if (!targetRole || !(ALL_ROLES as string[]).includes(targetRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // ── Verify ownership ──────────────────────────────────────────────────────
  const { data: cv } = await supabase
    .from('cvs')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cv) {
    return NextResponse.json({ error: 'CV not found' }, { status: 404 })
  }

  // ── Update target_role ────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('cvs')
    .update({ target_role: targetRole })
    .eq('id', id)

  if (updateError) {
    console.error('[role] Supabase update error:', updateError.message)
    return NextResponse.json({ error: 'Failed to save role — please try again' }, { status: 500 })
  }

  // ── Log event ─────────────────────────────────────────────────────────────
  await supabase.from('events').insert({
    event_name: 'role_selected',
    user_id: user.id,
    meta_json: { cv_id: id, role: targetRole },
  })

  return NextResponse.json({ ok: true })
}
