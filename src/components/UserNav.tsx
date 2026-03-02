'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function UserNav() {
  const [initial, setInitial] = useState<string>('?')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setInitial(user.email[0].toUpperCase())
      }
    })
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <>
      <div className="w-8 h-8 rounded-full bg-[#FF6B00] flex items-center justify-center text-white text-sm font-semibold">
        {initial}
      </div>
      <button
        onClick={handleSignOut}
        className="text-sm text-[#444444] hover:text-[#222222] transition-colors"
      >
        Sign out
      </button>
    </>
  )
}
