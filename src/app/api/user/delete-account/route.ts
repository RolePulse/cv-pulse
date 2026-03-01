// CV Pulse — Delete Account API
// Epic 13 | DELETE /api/user/delete-account — delete ALL user data including account
// Deletion order is foreign-key safe:
//   jd_checks → scores → share_links → cvs → events → usage → allowlist → users

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteAccountData } from '@/lib/deletion'

export async function DELETE() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  // ── Get user email (for allowlist cleanup) ────────────────────────────────
  const { data: dbUser } = await supabase
    .from('users')
    .select('email')
    .eq('id', user.id)
    .single()

  // ── Get all CV IDs for this user ──────────────────────────────────────────
  const { data: cvs } = await supabase
    .from('cvs')
    .select('id')
    .eq('user_id', user.id)

  const cvIds = (cvs ?? []).map((cv: { id: string }) => cv.id)

  // ── Delete in foreign-key safe order ──────────────────────────────────────
  await deleteAccountData(supabase, user.id, dbUser?.email ?? null, cvIds)

  return NextResponse.json({ success: true })
}
