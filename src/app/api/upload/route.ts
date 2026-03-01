// CV Pulse — Upload API
// Epic 2 | Accepts PDF (multipart) or plain text (JSON). Parses, gates on confidence, saves to Supabase.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCV, parseText, CONFIDENCE_THRESHOLD } from '@/lib/parser'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  let result

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    // PDF upload path
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Could not read form data' }, { status: 400 })
    }

    const file = formData.get('cv') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large — maximum size is 10MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    result = await parseCV(buffer)

  } else {
    // Text paste path
    let body: { text?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const text = body?.text?.trim() || ''
    if (text.length < 100) {
      return NextResponse.json({ error: 'Pasted text is too short (minimum 100 characters)' }, { status: 400 })
    }
    result = parseText(text)
  }

  // ── Confidence gate ───────────────────────────────────────────────────────
  if (result.confidence < CONFIDENCE_THRESHOLD) {
    return NextResponse.json({
      ok: false,
      confidence: result.confidence,
      failReason: result.failReason,
    })
  }

  // ── Save to Supabase ──────────────────────────────────────────────────────
  const { data: cv, error } = await supabase
    .from('cvs')
    .insert({
      user_id: user.id,
      raw_text: result.rawText,
      structured_json: result.structured,
      parse_confidence: result.confidence,
      parse_fail_reason: null,
    })
    .select()
    .single()

  if (error || !cv) {
    console.error('[upload] Supabase insert error:', error?.message)
    return NextResponse.json({ error: 'Failed to save CV — please try again' }, { status: 500 })
  }

  // ── Log event ─────────────────────────────────────────────────────────────
  await supabase.from('events').insert({
    event_name: 'cv_uploaded',
    user_id: user.id,
    meta_json: { cv_id: cv.id, confidence: result.confidence },
  })

  return NextResponse.json({ ok: true, cvId: cv.id, confidence: result.confidence })
}
