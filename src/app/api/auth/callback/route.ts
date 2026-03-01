import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Handles the OAuth callback from Google sign-in
// Supabase redirects here after successful auth: /api/auth/callback?code=...
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/results'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth error — send back to upload with error flag
  return NextResponse.redirect(`${origin}/upload?error=auth_failed`)
}
