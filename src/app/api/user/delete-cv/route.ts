// CV Pulse — Delete CV Data API
// Epic 13 | DELETE /api/user/delete-cv — delete all CV data, keep account
// Deletion order is foreign-key safe: jd_checks → scores → share_links → cvs → events → reset usage

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteCvData } from '@/lib/deletion'

export async function DELETE() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  // ── Get all CV IDs for this user ──────────────────────────────────────────
  const { data: cvs } = await supabase
    .from('cvs')
    .select('id')
    .eq('user_id', user.id)

  const cvIds = (cvs ?? []).map((cv: { id: string }) => cv.id)

  // ── Delete in foreign-key safe order ──────────────────────────────────────
  await deleteCvData(supabase, user.id, cvIds)

  return NextResponse.json({ success: true })
}
