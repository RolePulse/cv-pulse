'use client'

// CV Pulse — Upgrade / Pricing Page
// CTA reads NEXT_PUBLIC_STRIPE_CHECKOUT_URL at build time.
// If not set, falls back to a mailto interest link.
// When Stripe is ready: set NEXT_PUBLIC_STRIPE_CHECKOUT_URL in Vercel env vars — no code changes needed.

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'

const STRIPE_URL = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL ?? null

const FREE_FEATURES = [
  '1 CV upload',
  'Unlimited re-scores',
  '2 JD match checks',
  'PDF export (both templates)',
  'Shareable results link',
]

const PRO_FEATURES = [
  'Unlimited CV uploads',
  'Unlimited re-scores',
  'Unlimited JD match checks',
  'PDF export (both templates)',
  'Shareable results link',
  'Priority support',
]

export default function UpgradePage() {
  const router = useRouter()

  const handleUpgrade = () => {
    if (STRIPE_URL) {
      window.location.href = STRIPE_URL
    } else {
      window.location.href =
        'mailto:hello@cvpulse.io?subject=CV%20Pulse%20Pro%20%E2%80%94%20Upgrade%20interest&body=I%27d%20like%20to%20upgrade%20to%20CV%20Pulse%20Pro.'
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {/* Back */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm text-[#888888] hover:text-[#FF6B00] transition-colors cursor-pointer"
          >
            <span className="text-base leading-none">←</span>
            <span>Back</span>
          </button>
        </div>

        {/* Heading */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-[#222222] mb-3">Simple, honest pricing</h1>
          <p className="text-[#555555] text-sm leading-relaxed">
            Free to start. Upgrade when you need more.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
          {/* Free */}
          <div
            className="bg-white rounded-[10px] border border-[#DDDDDD] p-6 flex flex-col"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="mb-5">
              <p className="text-xs font-semibold text-[#999999] uppercase tracking-wide mb-1">Free</p>
              <p className="text-3xl font-bold text-[#222222]">
                £0
                <span className="text-base font-normal text-[#999999]"> / month</span>
              </p>
              <p className="text-xs text-[#999999] mt-1">No card required</p>
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#444444]">
                  <span className="text-[#BBBBBB] mt-0.5 flex-shrink-0">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="text-center py-2.5 rounded-[6px] border border-[#DDDDDD] bg-[#F8F8F8]">
              <span className="text-sm font-medium text-[#999999]">Current plan</span>
            </div>
          </div>

          {/* Pro */}
          <div
            className="bg-white rounded-[10px] border-2 border-[#FF6B00] p-6 flex flex-col relative"
            style={{ boxShadow: '0 4px 12px rgba(255,107,0,0.12)' }}
          >
            {/* Badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-[#FF6B00] text-white text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full">
                Most popular
              </span>
            </div>

            <div className="mb-5">
              <p className="text-xs font-semibold text-[#FF6B00] uppercase tracking-wide mb-1">Pro</p>
              <p className="text-3xl font-bold text-[#222222]">
                $9
                <span className="text-base font-normal text-[#999999]"> / month</span>
              </p>
              <p className="text-xs text-[#999999] mt-1">Cancel anytime</p>
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#333333]">
                  <span className="text-[#FF6B00] mt-0.5 flex-shrink-0 font-semibold">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={handleUpgrade}
              className="w-full py-2.5 bg-[#FF6B00] hover:bg-[#E85F00] text-white font-semibold rounded-[6px] transition-colors cursor-pointer text-sm"
            >
              {STRIPE_URL ? 'Upgrade now →' : 'Get early access →'}
            </button>

            {!STRIPE_URL && (
              <p className="text-[10px] text-[#BBBBBB] text-center mt-2">
                Pro launching soon — we'll be in touch
              </p>
            )}
          </div>
        </div>

        {/* RolePulse member note */}
        <div
          className="bg-[#FFFAF7] rounded-[8px] border border-[#FFD4B3] p-4"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl flex-shrink-0">🎯</span>
            <div>
              <p className="text-[13px] font-semibold text-[#222222] mb-0.5">
                Already a RolePulse paid subscriber?
              </p>
              <p className="text-xs text-[#555555] leading-relaxed">
                You get CV Pulse Pro automatically. Sign in with the same email address you use for RolePulse and your account will be upgraded instantly.{' '}
                <a
                  href="https://rolepulse.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FF6B00] hover:underline font-medium"
                >
                  Learn about RolePulse →
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* FAQ teaser */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#999999]">
            Questions?{' '}
            <a
              href="mailto:hello@cvpulse.io"
              className="text-[#FF6B00] hover:underline"
            >
              hello@cvpulse.io
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
