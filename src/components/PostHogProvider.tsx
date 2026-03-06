'use client'

// CV Pulse — PostHog provider
// Wraps the app to initialise PostHog once on mount.

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { initPostHog, trackPage } from '@/lib/posthog'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Initialise once
  useEffect(() => {
    initPostHog()
  }, [])

  // Track page views on route changes
  useEffect(() => {
    if (pathname) {
      trackPage(pathname)
    }
  }, [pathname, searchParams])

  return <>{children}</>
}
