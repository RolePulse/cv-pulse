// CV Pulse — CV data API
// GET  /api/cv/[id] — fetch CV data (structured_json + target_role)
// PATCH /api/cv/[id] — update structured_json, derive and save raw_text

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { StructuredCV } from '@/types/database'
import { structuredToRawText } from '@/lib/structuredToRawText'

// ─── Shared auth + ownership helper ──────────────────────────────────────────

async function resolveCV(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, cv: null }

  const { data: cv } = await supabase
    .from('cvs')
    .select('id, structured_json, target_role, raw_text')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  return { supabase, user, cv }
}

// ─── GET /api/cv/[id] ─────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user, cv } = await resolveCV(id)

  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!cv)   return NextResponse.json({ error: 'CV not found' }, { status: 404 })

  return NextResponse.json({
    id: cv.id,
    structured: cv.structured_json,
    targetRole: cv.target_role,
  })
}

// ─── PATCH /api/cv/[id] ───────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { supabase, user, cv } = await resolveCV(id)

  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!cv)   return NextResponse.json({ error: 'CV not found' }, { status: 404 })

  let body: { structured?: StructuredCV }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.structured) {
    return NextResponse.json({ error: 'structured is required' }, { status: 400 })
  }

  const rawText = structuredToRawText(body.structured)

  const { error } = await supabase
    .from('cvs')
    .update({
      structured_json: body.structured,
      raw_text: rawText,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('[cv patch] error:', error.message)
    return NextResponse.json({ error: 'Failed to save — please try again' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
