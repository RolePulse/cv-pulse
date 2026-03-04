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

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn={isSignedIn} />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-white border border-[#DDDDDD] rounded-full px-4 py-1.5 mb-8 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse" />
          <span className="text-sm text-[#444444] font-medium">Built for GTM professionals</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#222222] leading-tight tracking-tight max-w-3xl mx-auto">
          Recruiter-grade CV scoring{' '}
          <span className="text-[#FF6B00]">for GTM roles</span>
        </h1>

        <p className="mt-6 text-lg text-[#444444] max-w-xl mx-auto leading-relaxed">
          Upload your CV, score it against your target role, fix the gaps, and download a polished PDF. Know exactly what a recruiter sees.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/upload">
            <Button variant="primary" size="lg">
              Score my CV →
            </Button>
          </Link>
          <Link
            href="/score?demo=true"
            className="text-sm font-medium text-[#FF6B00] hover:text-[#E05A00] underline underline-offset-2 transition-colors"
          >
            See a demo score first
          </Link>
        </div>
        <p className="mt-3 text-xs text-[#BBBBBB]">Free to start · No card required</p>
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
