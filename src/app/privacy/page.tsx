// CV Pulse — Privacy Policy
// Epic 14 | Static public page, no auth required

import Link from 'next/link'
import Header from '@/components/Header'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-[#222222] mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#999999] mb-10">Last updated: 1 March 2026</p>

        {/* What data we collect */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">What data we collect</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Your email address (from Google sign-in — we do not store a password)</li>
              <li>The text extracted from your CV (the original PDF is never stored)</li>
              <li>A structured breakdown of your CV (roles, skills, education) as JSON</li>
              <li>Scores, checklist results, and JD match results</li>
              <li>Usage counters and basic event logs</li>
            </ul>
          </div>
        </section>

        {/* Why we collect it */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Why we collect it</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>
              We collect this data solely to provide the CV scoring, editing, and export service.
              We use it to score your CV, show you improvements, and let you download a polished PDF.
            </p>
          </div>
        </section>

        {/* How long we keep it */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">How long we keep it</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>
              Your data is kept for as long as your account is active. When you delete your CV data
              or your account, it is removed from our database immediately. Share links expire after 90 days.
            </p>
          </div>
        </section>

        {/* Who sees your data */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Who sees your data</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>
              Your CV text is never shared with third parties. It is never used to train any model.
              All scoring is done by deterministic, rule-based code — there is no AI or language model involved.
            </p>
            <p>
              Share links are opt-in and show redacted data only — no contact information, no CV text,
              and no company names are visible on shared pages.
            </p>
          </div>
        </section>

        {/* How to delete your data */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">How to delete your data</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>
              You can delete your CV data or your entire account at any time from{' '}
              <Link href="/settings" className="text-[#FF6B00] hover:text-[#E85F00] transition-colors">Settings</Link>.
              Deletion is immediate and permanent. All associated data (CVs, scores, JD checks, share links,
              events, and usage records) is removed.
            </p>
          </div>
        </section>

        {/* Google OAuth */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Authentication</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>
              CV Pulse uses Google OAuth for sign-in. We receive your email address and display name
              from Google. We do not store any password and do not request access to your Google Drive,
              contacts, or any other Google service.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Contact</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>
              Questions about your privacy? Contact us at{' '}
              <a href="mailto:support@cvpulse.io" className="text-[#FF6B00] hover:text-[#E85F00] transition-colors">
                support@cvpulse.io
              </a>.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#DDDDDD] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-[#999999]">
          <span>&copy; 2026 CV Pulse</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-[#222222] transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-[#222222] transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
