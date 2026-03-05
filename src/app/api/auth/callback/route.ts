import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Handles both OAuth (Google) and magic link callbacks from Supabase
// OAuth:      /api/auth/callback?code=...
// Magic link: /api/auth/callback?token_hash=...&type=magiclink
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  const next       = searchParams.get('next') ?? '/upload'

  const supabase = await createClient()

  // OAuth flow (Google)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  // Magic link / OTP flow
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'magiclink' | 'email',
    })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  // Auth error — send back to upload with error flag
  return NextResponse.redirect(`${origin}/upload?error=auth_failed`)
}
