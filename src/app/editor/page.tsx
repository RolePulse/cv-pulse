// Auth gate: real auth wired in Epic 1. Redirect unauthenticated users to /upload.
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'

// Placeholder CV content — real data from Supabase wired in Epic 6
const PLACEHOLDER_CV = {
  summary: 'Results-driven Account Executive with 5+ years in B2B SaaS, specialising in mid-market GTM. Consistent quota attainment, strong pipeline discipline.',
  experience: [
    {
      company: 'Acme Corp',
      title: 'Senior Account Executive',
      period: 'Jan 2022 – Present',
      bullets: ['Managed a $1.2M ARR book of business', 'Closed $800K in new ARR in FY23', 'Collaborated with CSM team to reduce churn by 12%'],
    },
    {
      company: 'Beta SaaS',
      title: 'Account Executive',
      period: 'Mar 2019 – Dec 2021',
      bullets: ['Exceeded quota by 115% in FY21', 'Sourced and closed 40+ new logo deals'],
    },
  ],
  skills: 'Salesforce · Outreach · Gong · HubSpot · MEDDIC · SaaS · Pipeline management · Forecasting',
}

const PLACEHOLDER_CHECKLIST = [
  { done: true, text: 'Name and contact info present' },
  { done: false, text: 'Add quantified metrics to all roles' },
  { done: false, text: 'Add missing keywords: ARR, pipeline, quota attainment' },
  { done: true, text: 'Consistent date formatting' },
  { done: false, text: 'Shorten bullet points to 1–2 lines' },
]

export default function EditorPage() {
  const [summary, setSummary] = useState(PLACEHOLDER_CV.summary)
  const [skills, setSkills] = useState(PLACEHOLDER_CV.skills)

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        {/* Progress */}
        <div className="mb-10 max-w-lg mx-auto">
          <ProgressIndicator currentStep="edit" />
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          {/* Left: editor */}
          <div className="flex-1 space-y-4">
            <div
              className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              <h2 className="text-[15px] font-semibold text-[#222222] mb-4">Summary</h2>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                className="w-full text-sm text-[#222222] border border-[#DDDDDD] rounded-[6px] px-3 py-2.5 focus:outline-none focus:border-[#FF6B00] resize-none transition-colors"
              />
            </div>

            {/* Experience */}
            {PLACEHOLDER_CV.experience.map((role, i) => (
              <div
                key={i}
                className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#222222]">{role.title}</h3>
                    <p className="text-sm text-[#444444]">{role.company} · {role.period}</p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {role.bullets.map((bullet, j) => (
                    <li key={j} className="flex gap-2 text-sm text-[#444444]">
                      <span className="text-[#FF6B00] flex-shrink-0 mt-0.5">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Skills */}
            <div
              className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Skills</h2>
              <textarea
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                rows={2}
                className="w-full text-sm text-[#222222] border border-[#DDDDDD] rounded-[6px] px-3 py-2.5 focus:outline-none focus:border-[#FF6B00] resize-none transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="primary" size="md" className="flex-1 justify-center">
                Re-score my CV
              </Button>
              <Link href="/export" className="flex-1">
                <Button variant="secondary" size="md" className="w-full justify-center">
                  Export PDF →
                </Button>
              </Link>
            </div>
          </div>

          {/* Right: checklist */}
          <div className="w-full lg:w-72 flex-shrink-0">
            <div
              className="bg-white rounded-[8px] border border-[#DDDDDD] p-5 sticky top-20"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              <h2 className="text-[14px] font-semibold text-[#222222] mb-4">Checklist</h2>
              <ul className="space-y-2.5">
                {PLACEHOLDER_CHECKLIST.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div
                      className={[
                        'w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border',
                        item.done
                          ? 'bg-[#16A34A] border-[#16A34A]'
                          : 'border-[#DDDDDD] bg-white',
                      ].join(' ')}
                    >
                      {item.done && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-xs ${item.done ? 'text-[#999999] line-through' : 'text-[#444444]'}`}>
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-[#999999] mt-4">Real checklist wired in Epic 8.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
