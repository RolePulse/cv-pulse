// Public page — no auth required
import Link from 'next/link'
import Button from '@/components/Button'

interface SharePageProps {
  params: { token: string }
}

// Placeholder data — real data from Supabase wired in Epic 12
const PLACEHOLDER_SHARE = {
  score: 72,
  pass: true,
  role: 'Account Executive',
  buckets: [
    { name: 'Proof of impact', score: 24, max: 35 },
    { name: 'ATS / Keywords', score: 18, max: 25 },
    { name: 'Formatting', score: 16, max: 20 },
    { name: 'Clarity', score: 14, max: 20 },
  ],
  checklistTitles: [
    'Add quantified metrics to last 3 roles',
    'Include missing ATS keywords',
    'Shorten bullet points to 1–2 lines',
    'Add company context under each role',
  ],
}

export default function SharePage({ params }: SharePageProps) {
  const { score, pass, role, buckets, checklistTitles } = PLACEHOLDER_SHARE

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      {/* Minimal header */}
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

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <p className="text-xs text-[#999999] text-center mb-6 uppercase tracking-wide font-medium">
          Shared CV Score Report
        </p>

        {/* Score */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-8 mb-4 text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <p className="text-sm text-[#999999] mb-2">Target role: {role}</p>
          <div className="text-7xl font-bold text-[#222222] leading-none mb-2">{score}</div>
          <div className="text-[#999999] text-sm mb-3">out of 100</div>
          <span
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold',
              pass ? 'bg-green-100 text-[#16A34A]' : 'bg-red-100 text-[#DC2626]',
            ].join(' ')}
          >
            {pass ? '✓ Pass' : '✕ Needs work'}
          </span>
        </div>

        {/* Buckets */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-4"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          {buckets.map((b) => (
            <div key={b.name} className="mb-4 last:mb-0">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-[#444444]">{b.name}</span>
                <span className="font-semibold text-[#222222]">{b.score}<span className="text-[#999999] font-normal">/{b.max}</span></span>
              </div>
              <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                <div className="h-full bg-[#FF6B00] rounded-full" style={{ width: `${Math.round((b.score / b.max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Checklist titles only */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-8"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[14px] font-semibold text-[#222222] mb-3">Key improvements</h2>
          <ul className="space-y-2">
            {checklistTitles.map((item, i) => (
              <li key={i} className="text-sm text-[#444444] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00] flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#999999] mt-4">Personal data and full CV text not included in this share link.</p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-sm text-[#444444] mb-4">Want to know how your CV compares?</p>
          <Link href="/">
            <Button variant="primary" size="md">Get your own CV score →</Button>
          </Link>
        </div>
      </main>
    </div>
  )
}
