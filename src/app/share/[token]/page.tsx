// CV Pulse — Public Share Page
// Epic 12 | /share/[token] — public, no auth required
// Shows redacted summary only — NO CV text, NO contact info, NO company names.

import Link from 'next/link'
import Button from '@/components/Button'
import { createAdminClient } from '@/lib/supabase/server'
import type { RedactedSummary, BucketScores } from '@/types/database'

interface SharePageProps {
  params: Promise<{ token: string }>
}

// ── Bucket display config ───────────────────────────────────────────────────

const BUCKET_CONFIG: { key: keyof BucketScores; label: string; max: number }[] = [
  { key: 'proof_of_impact', label: 'Proof of impact', max: 35 },
  { key: 'ats_keywords',    label: 'ATS / Keywords',  max: 25 },
  { key: 'formatting',      label: 'Formatting',       max: 20 },
  { key: 'clarity',         label: 'Clarity',          max: 20 },
]

// ── Score colour helper ─────────────────────────────────────────────────────

function scoreColour(score: number): string {
  if (score >= 70) return '#16A34A'  // green
  if (score >= 50) return '#D97706'  // amber
  return '#DC2626'                    // red
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params

  // Fetch share link using admin client (bypasses RLS — this page is public by design)
  const supabase = await createAdminClient()
  const { data: shareLink } = await supabase
    .from('share_links')
    .select('redacted_summary_json, expires_at')
    .eq('share_token', token)
    .maybeSingle()

  // ── Expired or not found ────────────────────────────────────────────────
  const isExpired = shareLink?.expires_at && new Date(shareLink.expires_at) < new Date()

  if (!shareLink || isExpired) {
    return (
      <div className="min-h-screen bg-[#FFF7F2]">
        <ShareHeader />
        <main className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-8" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div className="w-12 h-12 rounded-full bg-[#F0F0F0] flex items-center justify-center mx-auto mb-4">
              <span className="text-lg text-[#999999]">⏱</span>
            </div>
            <h1 className="text-lg font-semibold text-[#222222] mb-2">
              This link has expired or does not exist
            </h1>
            <p className="text-sm text-[#666666] mb-6">
              Share links are valid for 90 days. The owner can generate a new one.
            </p>
            <Link href="/">
              <Button variant="primary" size="md">Go to CV Pulse →</Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  // ── Valid share link ────────────────────────────────────────────────────────
  const summary = shareLink.redacted_summary_json as RedactedSummary
  const { score, pass_fail, target_role, bucket_scores, checklist_titles } = summary
  const colour = scoreColour(score)

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <ShareHeader />

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <p className="text-xs text-[#999999] text-center mb-6 uppercase tracking-wide font-medium">
          Shared CV Score Report
        </p>

        {/* Score + pass/fail + role */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-8 mb-4 text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          {target_role && (
            <span className="inline-block text-xs font-medium text-[#555555] bg-[#F0F0F0] rounded-full px-3 py-1 mb-4">
              {target_role}
            </span>
          )}
          <div className="text-7xl font-bold leading-none mb-2" style={{ color: colour }}>
            {score}
          </div>
          <div className="text-[#999999] text-sm mb-3">out of 100</div>
          <span
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold',
              pass_fail ? 'bg-green-100 text-[#16A34A]' : 'bg-red-100 text-[#DC2626]',
            ].join(' ')}
          >
            {pass_fail ? '✓ Pass' : '✕ Needs work'}
          </span>
        </div>

        {/* Bucket score bars */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-4"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          {BUCKET_CONFIG.map((b) => {
            const val = bucket_scores[b.key]
            const pct = Math.round((val / b.max) * 100)
            return (
              <div key={b.key} className="mb-4 last:mb-0">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[#444444]">{b.label}</span>
                  <span className="font-semibold text-[#222222]">
                    {val}<span className="text-[#999999] font-normal">/{b.max}</span>
                  </span>
                </div>
                <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                  <div className="h-full bg-[#FF6B00] rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Checklist titles only */}
        {checklist_titles.length > 0 && (
          <div
            className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-8"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <h2 className="text-[14px] font-semibold text-[#222222] mb-3">Key improvements</h2>
            <ul className="space-y-2">
              {checklist_titles.map((item, i) => (
                <li key={i} className="text-sm text-[#444444] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00] flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#999999] mt-4">
              Personal data and full CV text not included in this share link.
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="text-center">
          <p className="text-sm text-[#444444] mb-4">Want to score your own CV?</p>
          <Link href="/upload">
            <Button variant="primary" size="md">Get your own CV score →</Button>
          </Link>
        </div>
      </main>
    </div>
  )
}

// ── Shared header (branding only) ───────────────────────────────────────────

function ShareHeader() {
  return (
    <header className="bg-white border-b border-[#DDDDDD]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-[6px] bg-[#FF6B00] flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M2 12h3l2-7 3 14 3-10 2 6 2-3h5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-[#222222] font-semibold text-[15px]">CV Pulse</span>
      </div>
    </header>
  )
}
