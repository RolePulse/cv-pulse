import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { createClient } from '@/lib/supabase/server'

const features = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M9 12l2 2 4-4" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="#FF6B00" strokeWidth="2" />
      </svg>
    ),
    title: 'Recruiter-grade score',
    description:
      'Get scored across four key buckets: proof of impact, ATS keywords, formatting, and clarity. Know exactly where you stand.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Fix it in the editor',
    description:
      'Edit your CV directly in the app. One-click fixes for common issues. Re-score and see your improvements in real time.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="7,10 12,15 17,10" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="15" x2="12" y2="3" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Export a polished PDF',
    description:
      'Download in two clean, ATS-safe templates. Share a redacted results link with recruiters or hiring managers.',
  },
]

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isSignedIn = !!user

  // For signed-in users who already have a CV — send them straight back to their score
  let existingCvId: string | null = null
  if (user) {
    const { data: existingCv } = await supabase
      .from('cvs')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingCv) existingCvId = existingCv.id
  }

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn={isSignedIn} />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-white border border-[#DDDDDD] rounded-full px-4 py-1.5 mb-8 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse" />
          <span className="text-sm text-[#444444] font-medium">From the team behind <a href="https://rolepulse.com" className="font-semibold text-[#FF6B00] hover:underline">RolePulse</a></span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#222222] leading-tight tracking-tight max-w-3xl mx-auto">
          Recruiter-grade CV scoring{' '}
          <span className="text-[#FF6B00]">for GTM roles</span>
        </h1>

        <p className="mt-6 text-lg text-[#444444] max-w-xl mx-auto leading-relaxed">
          Upload your CV, score it against your target role, fix the gaps, and download a polished PDF. Know exactly what a recruiter sees.
        </p>

        {/* Role pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {['SDR / BDR', 'Account Executive', 'CSM', 'GTM Marketing', 'RevOps'].map((role) => (
            <span
              key={role}
              className="text-xs font-medium text-[#555555] bg-white border border-[#DDDDDD] rounded-full px-3 py-1"
            >
              {role}
            </span>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          {existingCvId ? (
            <Link href={`/score?cvId=${existingCvId}`}>
              <Button variant="primary" size="lg">
                View my score →
              </Button>
            </Link>
          ) : (
            <Link href="/upload">
              <Button variant="primary" size="lg">
                Score my CV →
              </Button>
            </Link>
          )}
          {!existingCvId && (
            <Link
              href="/score?demo=true"
              className="text-sm font-medium text-[#FF6B00] hover:text-[#E05A00] underline underline-offset-2 transition-colors"
            >
              See a demo score first
            </Link>
          )}
        </div>
        <p className="mt-3 text-xs text-[#BBBBBB]">Free to start · No card required</p>
      </section>

      {/* Product mockup */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        {/* Browser frame */}
        <div
          className="rounded-[12px] border border-[#DDDDDD] overflow-hidden select-none"
          style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.13)' }}
        >
          {/* Chrome bar */}
          <div className="bg-[#F3F3F3] border-b border-[#DDDDDD] px-4 py-2.5 flex items-center gap-3">
            <div className="flex gap-1.5 flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
              <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
              <div className="w-3 h-3 rounded-full bg-[#28C840]" />
            </div>
            <div className="flex-1 bg-white rounded-[6px] border border-[#DDDDDD] px-3 py-1 text-[11px] text-[#888888] text-center max-w-xs mx-auto">
              cvpulse.io/score
            </div>
          </div>

          {/* App content */}
          <div className="bg-[#FFF7F2] p-4 flex gap-4 overflow-hidden">

            {/* Left panel — score */}
            <div className="w-[240px] flex-shrink-0 space-y-3">

              {/* Score card */}
              <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-4">
                {/* Ring */}
                <div className="flex justify-center mb-3">
                  <div className="relative w-[80px] h-[80px]">
                    <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#F0F0F0" strokeWidth="10" />
                      {/* 78/100 → dashoffset = 251.3 × 0.22 = 55.3 */}
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#FF6B00" strokeWidth="10"
                        strokeDasharray="251.3" strokeDashoffset="55.3" strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold text-[#222222] leading-none">78</span>
                      <span className="text-[9px] text-[#888888]">/ 100</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center mb-1.5">
                  <span className="text-[10px] font-semibold text-white bg-[#16A34A] rounded-full px-2.5 py-0.5">✓ Passes</span>
                </div>
                <p className="text-[9px] text-[#888888] text-center mb-0.5">Recruiter threshold: 70 / 100</p>
                <p className="text-[10px] text-[#444444] text-center">Scored for <strong>Account Executive</strong></p>
                {/* Buckets */}
                <div className="mt-3 space-y-2">
                  {[
                    { label: 'Proof of impact', score: 28, max: 35, color: '#FF6B00' },
                    { label: 'ATS & keywords', score: 21, max: 25, color: '#16A34A' },
                    { label: 'Formatting', score: 20, max: 20, color: '#16A34A' },
                    { label: 'Clarity & structure', score: 17, max: 20, color: '#16A34A' },
                  ].map(({ label, score, max, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-[9px] text-[#666666] mb-0.5">
                        <span>{label}</span>
                        <span style={{ color }} className="font-semibold">{score}/{max}</span>
                      </div>
                      <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ backgroundColor: color, width: `${(score / max) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Checklist */}
              <div className="bg-white rounded-[8px] border border-[#DDDDDD] overflow-hidden">
                <div className="px-3 py-2 border-b border-[#EEEEEE] flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-[#222222]">Checklist</span>
                  <span className="text-[9px] text-[#888888]">3/5</span>
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  {[
                    { text: 'Add measurable results to bullets', done: true },
                    { text: 'Professional summary present', done: true },
                    { text: 'ATS-friendly keywords included', done: true },
                    { text: 'Add LinkedIn profile URL', done: false },
                    { text: 'Address employment gap', done: false },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className={`text-[10px] font-bold flex-shrink-0 ${item.done ? 'text-[#16A34A]' : 'text-[#CCCCCC]'}`}>
                        {item.done ? '✓' : '○'}
                      </span>
                      <span className={`text-[9px] leading-snug ${item.done ? 'text-[#999999] line-through' : 'text-[#333333]'}`}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right panel — editor */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Summary */}
              <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-3">
                <p className="text-[8px] uppercase tracking-wider text-[#AAAAAA] font-semibold mb-1.5">Summary</p>
                <p className="text-[10px] text-[#333333] leading-relaxed">
                  Results-driven Account Executive with 5+ years of B2B SaaS experience. Consistently exceeded 115% of annual quota. Proven track record in outbound prospecting and deal closing across EMEA.
                </p>
              </div>
              {/* Experience */}
              <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-3">
                <p className="text-[8px] uppercase tracking-wider text-[#AAAAAA] font-semibold mb-2">Experience</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-[10px] font-semibold text-[#222222]">Senior Account Executive</span>
                      <span className="text-[9px] text-[#888888]">Jan 2022 — Present</span>
                    </div>
                    <p className="text-[9px] text-[#666666] mb-1">Acme Technologies · London, UK</p>
                    <ul className="space-y-0.5">
                      <li className="text-[9px] text-[#333333] flex gap-1.5"><span className="flex-shrink-0">•</span><span>Closed £1.2M ARR in FY2023, exceeding quota by 120% — ranked #1 in EMEA team</span></li>
                      <li className="text-[9px] text-[#333333] flex gap-1.5"><span className="flex-shrink-0">•</span><span>Managed and grew 35 enterprise accounts, achieving 97% retention rate</span></li>
                    </ul>
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-[10px] font-semibold text-[#222222]">Account Executive</span>
                      <span className="text-[9px] text-[#888888]">Mar 2019 — Dec 2021</span>
                    </div>
                    <p className="text-[9px] text-[#666666] mb-1">GlobalSales Ltd · Manchester, UK</p>
                    <ul className="space-y-0.5">
                      <li className="text-[9px] text-[#333333] flex gap-1.5"><span className="flex-shrink-0">•</span><span>Generated £800K new business in 2021, 108% of target</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="text-center text-[11px] text-[#AAAAAA] mt-3">Upload your CV — your score is ready in under 30 seconds</p>
      </section>

      {/* Trust strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="7" r="4" stroke="#FF6B00" strokeWidth="2" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
              stat: '1,600+ subscribers',
              label: 'Trust the RolePulse brand',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#FF6B00" strokeWidth="2" />
                  <circle cx="12" cy="12" r="3" stroke="#FF6B00" strokeWidth="2" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ),
              stat: 'GTM-specific',
              label: 'Scored for your exact role — not generic CV advice',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 12l2 2 4-4" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
              stat: 'Deterministic scoring',
              label: 'Same CV, same score, every time. No AI guesswork',
            },
          ].map((item) => (
            <div
              key={item.stat}
              className="bg-white rounded-[8px] border border-[#DDDDDD] px-5 py-4 flex items-start gap-3"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
              <div>
                <p className="text-[14px] font-semibold text-[#222222]">{item.stat}</p>
                <p className="text-xs text-[#666666] mt-0.5 leading-relaxed">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-[8px] p-6 border border-[#DDDDDD]"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-[15px] font-semibold text-[#222222] mb-2">{feature.title}</h3>
              <p className="text-sm text-[#444444] leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#DDDDDD] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-[#999999]">
          <span>© 2026 CV Pulse. A sister product of <a href="https://rolepulse.com" className="hover:text-[#222222] transition-colors">RolePulse</a>.</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-[#222222] transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-[#222222] transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
