'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import { createClient } from '@/lib/supabase/client'

// ── Template definitions ──────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 'classic' as const,
    name: 'Clean Classic',
    description: 'Single column, ATS-safe, timeless. Works for every role and ATS system.',
    preview: (
      <div className="flex flex-col gap-1.5 p-4">
        {/* Name bar */}
        <div className="h-4 bg-[#222222] rounded-sm w-36" />
        {/* Contact line */}
        <div className="h-2 bg-[#CCCCCC] rounded-sm w-48" />
        {/* Divider */}
        <div className="h-px bg-[#CCCCCC] w-full my-1" />
        {/* Section heading */}
        <div className="h-2 bg-[#444444] rounded-sm w-16" />
        {/* Role */}
        <div className="flex justify-between mt-0.5">
          <div className="h-2 bg-[#222222] rounded-sm w-28" />
          <div className="h-2 bg-[#BBBBBB] rounded-sm w-16" />
        </div>
        <div className="h-2 bg-[#DDDDDD] rounded-sm w-24" />
        {/* Bullets */}
        {[40, 52, 44].map((w, i) => (
          <div key={i} className="flex gap-1 items-center">
            <div className="h-1 w-1 rounded-full bg-[#444444] flex-shrink-0" />
            <div className={`h-1.5 bg-[#DDDDDD] rounded-sm`} style={{ width: `${w}%` }} />
          </div>
        ))}
        {/* Second section */}
        <div className="h-2 bg-[#444444] rounded-sm w-16 mt-2" />
        <div className="h-2 bg-[#DDDDDD] rounded-sm w-full" />
        <div className="h-2 bg-[#DDDDDD] rounded-sm w-3/4" />
      </div>
    ),
  },
  {
    id: 'modern' as const,
    name: 'Modern Minimal',
    description: 'Single column, ATS-safe, contemporary styling with a clean accent line.',
    preview: (
      <div className="flex flex-col gap-1.5 p-4">
        {/* Name bar — orange */}
        <div className="h-5 bg-[#FF6B00] rounded-sm w-40" />
        {/* Contact line */}
        <div className="h-2 bg-[#CCCCCC] rounded-sm w-48" />
        {/* Orange divider */}
        <div className="h-0.5 bg-[#FF6B00] w-full mt-1 mb-1" />
        {/* Section heading — orange */}
        <div className="h-2 bg-[#FF6B00] rounded-sm w-16 opacity-80" />
        {/* Role */}
        <div className="flex justify-between mt-0.5">
          <div className="h-2 bg-[#1A1A1A] rounded-sm w-28" />
          <div className="h-2 bg-[#BBBBBB] rounded-sm w-16" />
        </div>
        <div className="h-2 bg-[#CCCCCC] rounded-sm w-24" />
        {/* Bullets with orange dash */}
        {[42, 50, 38].map((w, i) => (
          <div key={i} className="flex gap-1 items-center">
            <div className="h-1.5 w-1.5 bg-[#FF6B00] rounded-sm flex-shrink-0" />
            <div className={`h-1.5 bg-[#DDDDDD] rounded-sm`} style={{ width: `${w}%` }} />
          </div>
        ))}
        {/* Second section heading */}
        <div className="h-2 bg-[#FF6B00] rounded-sm w-14 mt-2 opacity-80" />
        <div className="h-2 bg-[#DDDDDD] rounded-sm w-full" />
        <div className="h-2 bg-[#DDDDDD] rounded-sm w-2/3" />
      </div>
    ),
  },
]

// ── Main content ──────────────────────────────────────────────────────────────

function ExportContent() {
  const searchParams = useSearchParams()
  const cvId = searchParams.get('cv')

  const [resolvedCvId, setResolvedCvId] = useState<string | null>(cvId)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // If no cvId in URL, resolve from current user's latest CV
  useEffect(() => {
    if (resolvedCvId) return
    async function resolve() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: cv } = await supabase
        .from('cvs')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cv) setResolvedCvId(cv.id)
    }
    resolve()
  }, [resolvedCvId])

  async function handleDownload(templateId: 'classic' | 'modern') {
    if (!resolvedCvId) {
      setError('No CV found — upload your CV first.')
      return
    }

    setDownloading(templateId)
    setError(null)

    try {
      const res = await fetch(`/api/cv/${resolvedCvId}/export?template=${templateId}`)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Download failed — please try again.')
        return
      }

      // Trigger browser download
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cv-pulse-${templateId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="mb-10">
          <ProgressIndicator currentStep="export" />
        </div>

        <h1 className="text-2xl font-bold text-[#222222] mb-2 text-center">Export your CV</h1>
        <p className="text-[#444444] text-center text-sm mb-8">
          Two clean, ATS-safe templates. Both free in v1.
        </p>

        {error && (
          <div className="mb-5">
            <AlertBanner type="error" message={error} />
          </div>
        )}

        {/* Template cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-[8px] border border-[#DDDDDD] overflow-hidden"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              {/* Preview */}
              <div className="h-44 bg-[#FAFAFA] border-b border-[#DDDDDD] overflow-hidden">
                {template.preview}
              </div>

              <div className="p-5">
                <h3 className="text-[15px] font-semibold text-[#222222] mb-1">{template.name}</h3>
                <p className="text-xs text-[#444444] mb-4 leading-relaxed">{template.description}</p>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full justify-center"
                  disabled={downloading === template.id || !resolvedCvId}
                  onClick={() => handleDownload(template.id)}
                >
                  {downloading === template.id ? 'Generating…' : 'Download PDF'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* ATS safety note */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-5 mb-5"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[13px] font-semibold text-[#222222] mb-2">Both templates are ATS-safe</h2>
          <ul className="space-y-1">
            {[
              'Single column — no tables, no text boxes',
              'Machine-readable text — no images of text',
              'Standard section headings (Experience, Skills, Education)',
              'Helvetica font — universal support across all ATS systems',
            ].map((point) => (
              <li key={point} className="flex items-start gap-2 text-xs text-[#444444]">
                <span className="text-[#FF6B00] mt-0.5 flex-shrink-0">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Share section */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[15px] font-semibold text-[#222222] mb-2">Share your results</h2>
          <p className="text-sm text-[#444444] mb-4">
            Share a redacted link — score, pass/fail, and checklist titles only. No CV text, no contact info.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[#FAFAFA] border border-[#DDDDDD] rounded-[6px] px-3 py-2 text-sm text-[#999999] truncate">
              cvpulse.io/share/abc123… (coming in Epic 12)
            </div>
            <Button variant="secondary" size="sm" disabled>
              Copy
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function ExportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FFF7F2] flex items-center justify-center">
        <p className="text-sm text-[#999999]">Loading…</p>
      </div>
    }>
      <ExportContent />
    </Suspense>
  )
}
