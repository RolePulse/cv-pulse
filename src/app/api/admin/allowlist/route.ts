// CV Pulse — Admin: Allowlist CSV Upload
// Epic 10 | POST /api/admin/allowlist
//
// Accepts a multipart/form-data POST with a CSV file (field name: "file").
// Parses email addresses, upserts to allowlist table.
// Also updates paid_status on any existing users whose email matches.
//
// Auth: requires signed-in user with matching ADMIN_EMAIL env var.
// Full admin auth wired in Epic 15.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseAllowlistCSV } from '@/lib/parseAllowlistCSV'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? ''

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  // Basic admin guard — full admin role check in Epic 15
  if (ADMIN_EMAIL && user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // ── Parse form data ───────────────────────────────────────────────────────
  let csvText: string
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded — attach a CSV file' }, { status: 400 })
    }

    csvText = await (file as File).text()
  } catch {
    return NextResponse.json({ error: 'Failed to read uploaded file' }, { status: 400 })
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 })
  }

  // ── Parse emails ──────────────────────────────────────────────────────────
  const emails = parseAllowlistCSV(csvText)

  if (emails.length === 0) {
    return NextResponse.json(
      { error: 'No valid email addresses found in the CSV' },
      { status: 400 }
    )
  }

  // ── Upsert to allowlist ───────────────────────────────────────────────────
  const now = new Date().toISOString()
  const rows = emails.map((email) => ({
    email,
    added_at: now,
    source: 'admin_csv_upload',
  }))

  const { error: upsertError } = await supabase
    .from('allowlist')
    .upsert(rows, { onConflict: 'email', ignoreDuplicates: false })

  if (upsertError) {
    console.error('[allowlist] upsert error:', upsertError.message)
    return NextResponse.json({ error: 'Database error — please try again' }, { status: 500 })
  }

  // ── Update paid_status for any existing users whose email matches ─────────
  // Find users in the users table whose email is in the allowlist
  const { data: matchedUsers } = await supabase
    .from('users')
    .select('id')
    .in('email', emails)

  if (matchedUsers && matchedUsers.length > 0) {
    const userIds = matchedUsers.map((u) => u.id)

    await supabase
      .from('usage')
      .update({ paid_status: 'rolepulse_paid', updated_at: now })
      .in('user_id', userIds)
  }

  // ── Log event ─────────────────────────────────────────────────────────────
  await supabase.from('events').insert({
    event_name: 'allowlist_uploaded',
    user_id: user.id,
    meta_json: {
      emails_parsed: emails.length,
      users_upgraded: matchedUsers?.length ?? 0,
    },
  })

  return NextResponse.json({
    ok: true,
    emailsParsed: emails.length,
    usersUpgraded: matchedUsers?.length ?? 0,
    message: `${emails.length} emails added to allowlist. ${matchedUsers?.length ?? 0} existing user(s) upgraded.`,
  })
}
