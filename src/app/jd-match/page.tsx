'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Button from '@/components/Button'

export default function JDMatchPage() {
  const [jdText, setJdText] = useState('')
  const [checked, setChecked] = useState(false)

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-[#222222] mb-2 text-center">JD Match</h1>
        <p className="text-[#444444] text-center text-sm mb-8">
          Paste a job description to see how well your CV matches it. We'll surface missing keywords and give you a fit score.
        </p>

        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-5"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <label className="block text-sm font-medium text-[#222222] mb-2">
            Job description
          </label>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the full job description here…"
            rows={10}
            className="w-full text-sm text-[#222222] border border-[#DDDDDD] rounded-[6px] px-3 py-2.5 focus:outline-none focus:border-[#FF6B00] resize-none transition-colors placeholder:text-[#999999]"
          />
          <Button
            variant="primary"
            size="md"
            disabled={jdText.trim().length < 100}
            onClick={() => setChecked(true)}
            className="mt-4 w-full justify-center"
          >
            Check match
          </Button>
        </div>

        {/* Results placeholder */}
        {checked && (
          <div
            className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#222222]">Match score</h2>
              <span className="text-2xl font-bold text-[#FF6B00]">68<span className="text-sm text-[#999999] font-normal">/100</span></span>
            </div>
            <p className="text-sm text-[#444444] mb-4">Missing keywords from this JD:</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {['pipeline management', 'ARR', 'MEDDIC', 'outbound prospecting', 'Salesforce'].map((kw) => (
                <span key={kw} className="text-xs bg-red-50 text-[#DC2626] border border-red-200 rounded-full px-2.5 py-1">
                  {kw}
                </span>
              ))}
            </div>
            {/* Paywall gate placeholder */}
            <div className="flex items-center gap-2 text-sm text-[#999999] mt-4 pt-4 border-t border-[#DDDDDD]">
              <span>🔒</span>
              <span>Unlock full JD analysis — 2 free checks used. Upgrade to run more.</span>
            </div>
            {/* Real logic wired in Epic 9 + 10 */}
          </div>
        )}
      </main>
    </div>
  )
}
