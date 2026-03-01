// CV Pulse — Export API
// Epic 11 | GET /api/cv/[id]/export?template=classic|modern
//
// Returns application/pdf with correct Content-Disposition for download.
// Server-side only — @react-pdf/renderer never runs in the browser.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePDF } from '@/lib/pdfTemplates'
import type { StructuredCV } from '@/types/database'
import type { PDFTemplate } from '@/lib/pdfTemplates'

const VALID_TEMPLATES: PDFTemplate[] = ['classic', 'modern']

export async function GET(
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

  // ── Template param ────────────────────────────────────────────────────────
  const templateParam = request.nextUrl.searchParams.get('template') ?? 'classic'
  const template = VALID_TEMPLATES.includes(templateParam as PDFTemplate)
    ? (templateParam as PDFTemplate)
    : 'classic'

  // ── Fetch CV (verify ownership) ───────────────────────────────────────────
  const { data: cv } = await supabase
    .from('cvs')
    .select('id, raw_text, structured_json')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cv) {
    return NextResponse.json({ error: 'CV not found' }, { status: 404 })
  }

  if (!cv.structured_json || !cv.raw_text) {
    return NextResponse.json({ error: 'CV has no parseable content' }, { status: 400 })
  }

  // ── Generate PDF ──────────────────────────────────────────────────────────
  let pdfBytes: Buffer
  try {
    pdfBytes = await generatePDF(
      cv.structured_json as StructuredCV,
      cv.raw_text,
      template,
    )
  } catch (err) {
    console.error('[export] PDF generation failed:', err)
    return NextResponse.json({ error: 'PDF generation failed — please try again' }, { status: 500 })
  }

  // ── Log event ─────────────────────────────────────────────────────────────
  await supabase.from('events').insert({
    event_name: 'cv_exported',
    user_id: user.id,
    meta_json: { cv_id: id, template },
  })

  // ── Return PDF ────────────────────────────────────────────────────────────
  const templateLabel = template === 'classic' ? 'Classic' : 'Modern'
  const filename = `cv-pulse-${templateLabel.toLowerCase()}.pdf`

  // Extract a plain ArrayBuffer — required by TS5 strict BlobPart / BodyInit types
  const arrayBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBytes.byteLength.toString(),
      'Cache-Control': 'no-store',
    },
  })
}
