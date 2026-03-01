// CV Pulse — Terms of Service
// Epic 14 | Static public page, no auth required

import Link from 'next/link'
import Header from '@/components/Header'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-[#222222] mb-2">Terms of Service</h1>
        <p className="text-sm text-[#999999] mb-10">Last updated: 1 March 2026</p>

        {/* Introduction */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Introduction</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>
              CV Pulse is a CV scoring and improvement tool built for go-to-market professionals.
              It is operated by CV Pulse Ltd. By using CV Pulse, you agree to these terms.
            </p>
            <p>
              We have written these terms in plain English. If something is unclear,
              please contact us at{' '}
              <a href="mailto:support@cvpulse.io" className="text-[#FF6B00] hover:text-[#E85F00] transition-colors">
                support@cvpulse.io
              </a>.
            </p>
          </div>
        </section>

        {/* What We Collect */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">What We Collect</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>When you use CV Pulse, we collect:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Your email address (via Google sign-in)</li>
              <li>The text extracted from your uploaded CV (we do not store the original PDF file)</li>
              <li>A structured version of your CV content (sections, roles, skills) stored as JSON</li>
              <li>Scores and checklist results generated from your CV</li>
              <li>Usage counters (re-scores used, JD checks used)</li>
              <li>Basic event logs (uploads, scores, exports) to keep the service running</li>
            </ul>
          </div>
        </section>

        {/* How We Use It */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">How We Use It</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>We use your data to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Score your CV against your chosen target role</li>
              <li>Show you a personalised checklist of improvements</li>
              <li>Let you edit, re-score, and export your CV</li>
              <li>Enforce usage limits (free tier / paid tier)</li>
              <li>Monitor service health and fix bugs</li>
            </ul>
            <p>
              We do not sell, share, or transfer your CV content to any third party.
              Your CV text is never used to train any model — all scoring is deterministic, rule-based code.
            </p>
          </div>
        </section>

        {/* Data Retention */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Data Retention</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>
              We keep your data for as long as your account is active. If you delete your CV data
              or your account, it is removed from our database immediately.
            </p>
            <p>
              Share links expire after 90 days and are automatically invalidated.
            </p>
          </div>
        </section>

        {/* Your Rights */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Your Rights</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Access</strong> — view your data at any time via the app</li>
              <li><strong>Correction</strong> — edit your CV content directly in the editor</li>
              <li><strong>Deletion</strong> — delete your CV data or your entire account via{' '}
                <Link href="/settings" className="text-[#FF6B00] hover:text-[#E85F00] transition-colors">Settings</Link>
              </li>
              <li><strong>Portability</strong> — export your CV as a PDF at any time (data portability beyond PDF is not yet supported)</li>
            </ul>
          </div>
        </section>

        {/* Contact */}
        <section className="mb-8">
          <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Contact</h2>
          <div className="text-sm text-[#444444] leading-relaxed space-y-3">
            <p>
              If you have any questions about these terms or your data, contact us at{' '}
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
