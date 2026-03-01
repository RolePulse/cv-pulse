// Auth gate: real auth wired in Epic 1. Redirect unauthenticated users to /upload.
import Link from 'next/link'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'

// Placeholder data — real data from Supabase wired in Epic 5
const PLACEHOLDER_SCORE = {
  overall: 72,
  pass: true,
  buckets: [
    { name: 'Proof of impact', score: 24, max: 35 },
    { name: 'ATS / Keywords', score: 18, max: 25 },
    { name: 'Formatting', score: 16, max: 20 },
    { name: 'Clarity', score: 14, max: 20 },
  ],
  topFixes: [
    { points: 8, text: 'Add quantified metrics to your last 3 roles' },
    { points: 5, text: 'Include missing keywords: pipeline, ARR, quota attainment' },
    { points: 4, text: 'Shorten bullet points — several exceed 2 lines' },
  ],
}

export default function ResultsPage() {
  const { overall, pass, buckets, topFixes } = PLACEHOLDER_SCORE

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {/* Progress */}
        <div className="mb-10">
          <ProgressIndicator currentStep="score" />
        </div>

        {/* Score hero */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-8 mb-5 text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <div className="text-7xl font-bold text-[#222222] leading-none mb-2">{overall}</div>
          <div className="text-[#999999] text-sm mb-4">out of 100</div>
          <span
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold',
              pass
                ? 'bg-green-100 text-[#16A34A]'
                : 'bg-red-100 text-[#DC2626]',
            ].join(' ')}
          >
            {pass ? '✓ Pass' : '✕ Needs work'}
          </span>
          <p className="text-xs text-[#999999] mt-3">Pass threshold: 70+ with no critical concerns</p>
        </div>

        {/* Bucket breakdown */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-5"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[15px] font-semibold text-[#222222] mb-5">Score breakdown</h2>
          <div className="space-y-4">
            {buckets.map((bucket) => {
              const pct = Math.round((bucket.score / bucket.max) * 100)
              return (
                <div key={bucket.name}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm text-[#222222]">{bucket.name}</span>
                    <span className="text-sm font-semibold text-[#222222]">
                      {bucket.score}
                      <span className="text-[#999999] font-normal">/{bucket.max}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FF6B00] rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top 3 fixes */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-5"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[15px] font-semibold text-[#222222] mb-4">Top fixes</h2>
          <div className="space-y-3">
            {topFixes.map((fix, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 mt-0.5 text-xs font-semibold text-[#FF6B00] bg-[#FFF7F2] border border-[#FF6B00]/20 rounded-full px-2 py-0.5">
                  +{fix.points} pts
                </span>
                <p className="text-sm text-[#444444]">{fix.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Full checklist (collapsed placeholder) */}
        <details className="bg-white rounded-[8px] border border-[#DDDDDD] mb-8" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <summary className="px-6 py-4 cursor-pointer text-[15px] font-semibold text-[#222222] select-none hover:bg-[#FAFAFA] rounded-[8px] transition-colors">
            View full checklist (12 items)
          </summary>
          <div className="px-6 pb-5 pt-2 text-sm text-[#999999]">
            Full checklist wired in Epic 5.
          </div>
        </details>

        {/* CTA */}
        <Link href="/editor">
          <Button variant="primary" size="lg" className="w-full justify-center">
            Edit my CV →
          </Button>
        </Link>
      </main>
    </div>
  )
}
