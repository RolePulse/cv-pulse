// CV Pulse — PostHog analytics client
// Lazy-initialises PostHog once on the client. Safe to call on server (returns no-op).

import posthog from 'posthog-js'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ''
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

let initialised = false

export function initPostHog() {
  if (typeof window === 'undefined') return
  if (initialised || !POSTHOG_KEY) return
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',   // no anonymous profiles = stays free longer
    capture_pageview: false,              // we fire manually so we can attach user_id
    capture_pageleave: true,
    autocapture: false,                   // explicit events only — no noise
    session_recording: {
      maskAllInputs: true,                // GDPR: mask text inputs in recordings
    },
  })
  initialised = true
}

export function identifyUser(userId: string, email?: string) {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return
  posthog.identify(userId, { email })
}

export function resetUser() {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return
  posthog.reset()
}

export function trackPage(pageName: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return
  posthog.capture('$pageview', { page: pageName, ...props })
}

export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return
  posthog.capture(event, props)
}
