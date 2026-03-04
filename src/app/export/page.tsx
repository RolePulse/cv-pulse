'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import CVPreviewHtml from '@/components/CVPreviewHtml'
import { createClient } from '@/lib/supabase/client'
import type { StructuredCV } from '@/types/database'

// ── Template definitions ──────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 'classic' as const,
    name: 'Clean Classic',
    description: 'Single column, ATS-safe, timeless. Works for every role and ATS system.',
  },
  {
    id: 'modern' as const,
    name: 'Modern Minimal',
    description: 'Single column, ATS-safe, contemporary styling with a clean accent line.',
  },
]

// ── Main content ──────────────────────────────────────────────────────────────

function ExportContent() {
  const searchParams = useSearchParams()
  const cvId = searchParams.get('cv')

  const [resolvedCvId, setResolvedCvId] = useState<string | null>(cvId)
  const [cvData, setCvData] = useState<{ structured: StructuredCV; rawText: string } | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  // Generate share link once we have a CV id
  useEffect(() => {
    if (!resolvedCvId) return
    fetch(`/api/cv/${resolvedCvId}/share`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.shareUrl) setShareUrl(data.shareUrl) })
      .catch(() => { /* non-fatal — share link is optional */ })
  }, [resolvedCvId])

  // Fetch CV data for live preview
  useEffect(() => {
    if (!resolvedCvId) return
    fetch(`/api/cv/${resolvedCvId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.structured && data?.rawText) {
          setCvData({ structured: data.structured, rawText: data.rawText })
        }
      })
      .catch(() => { /* non-fatal — preview falls back to skeleton */ })
  }, [resolvedCvId])

  async function handleCopy() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback: select input text
      const input = document.getElementById('share-url-input') as HTMLInputElement | null
      input?.select()
    }
  }

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
          <ProgressIndicator currentStep="export" cvId={resolvedCvId ?? undefined} />
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
              {/* Live preview */}
              <div
                className="border-b border-[#DDDDDD] overflow-hidden"
                style={{ height: '280px' }}
              >
                {cvData ? (
                  <CVPreviewHtml
                    structured={cvData.structured}
                    rawText={cvData.rawText}
                    template={template.id}
                    previewHeight={280}
                  />
                ) : (
                  // Skeleton while CV data loads
                  <div className="h-full bg-[#FAFAFA] flex flex-col gap-2 p-4 animate-pulse">
                    <div className="h-3.5 bg-[#E5E5E5] rounded w-2/5" />
                    <div className="h-2 bg-[#F0F0F0] rounded w-3/5" />
                    <div className="h-px bg-[#DDDDDD] my-1" />
                    <div className="h-2 bg-[#E5E5E5] rounded w-1/4" />
                    <div className="h-2 bg-[#F0F0F0] rounded w-1/2" />
                    <div className="h-2 bg-[#F0F0F0] rounded w-2/5" />
                    <div className="h-2 bg-[#EEEEEE] rounded w-full mt-1" />
                    <div className="h-2 bg-[#EEEEEE] rounded w-4/5" />
                    <div className="h-2 bg-[#EEEEEE] rounded w-3/4" />
                  </div>
                )}
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
            <input
              id="share-url-input"
              readOnly
              value={shareUrl ?? 'Generating link…'}
              className="flex-1 bg-[#FAFAFA] border border-[#DDDDDD] rounded-[6px] px-3 py-2 text-sm text-[#444444] truncate outline-none"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!shareUrl}
              onClick={handleCopy}
            >
              {copied ? '✓ Copied' : 'Copy'}
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
