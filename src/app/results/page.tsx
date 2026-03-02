'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABELS } from '@/lib/roleDetect'
import type { TargetRole } from '@/lib/roleDetect'

// ── Types (mirror ScoreResult from scorer.ts) ─────────────────────────────────

interface BucketResult {
  score: number
  maxScore: number
  positives: string[]
  issues: string[]
}

interface ChecklistItem {
  id: string
  category: 'critical' | 'impact' | 'ats' | 'formatting' | 'clarity'
  action: string
  whyItMatters: string
  potentialPoints: number
  done: boolean
}

interface KeywordData {
  role: TargetRole
  total: number
  matched: string[]
  missing: string[]
}

interface ScoreResult {
  overallScore: number
  passFail: boolean
  criticalConcerns: string[]
  buckets: {
    proofOfImpact: BucketResult
    atsKeywords: BucketResult
    formatting: BucketResult
    clarity: BucketResult
  }
  checklist: ChecklistItem[]
  targetRole: TargetRole
  keywordData: KeywordData
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ChecklistItem['category'], string> = {
  critical: 'Critical concerns',
  impact:   'Proof of impact',
  ats:      'ATS & keywords',
  formatting: 'Formatting',
  clarity:  'Clarity & structure',
}

const BUCKET_CONFIG = [
  { key: 'proofOfImpact' as const, label: 'Proof of impact',  max: 35 },
  { key: 'atsKeywords'   as const, label: 'ATS & keywords',   max: 25 },
  { key: 'formatting'    as const, label: 'Formatting',        max: 20 },
  { key: 'clarity'       as const, label: 'Clarity & structure', max: 20 },
]

function barColor(score: number, max: number): string {
  const pct = score / max
  if (pct >= 0.8) return '#16A34A'   // green
  if (pct >= 0.5) return '#D97706'   // amber
  return '#DC2626'                    // red
}

// ── Score ring (SVG) ──────────────────────────────────────────────────────────

function ScoreRing({ score, pass }: { score: number; pass: boolean }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = pass ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#F0F0F0" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold text-[#222222] leading-none">{score}</span>
        <span className="text-xs text-[#999999] mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

// ── Checklist accordion item ──────────────────────────────────────────────────

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`border-b border-[#F0F0F0] last:border-0 ${item.done ? 'opacity-60' : ''}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 py-3 text-left cursor-pointer hover:bg-[#FAFAFA] px-1 rounded transition-colors"
      >
        {/* Status indicator */}
        <span className="flex-shrink-0 mt-0.5">
          {item.done ? (
            <span className="w-5 h-5 rounded-full bg-green-100 text-[#16A34A] flex items-center justify-center text-xs font-bold">✓</span>
          ) : item.category === 'critical' ? (
            <span className="w-5 h-5 rounded-full bg-red-100 text-[#DC2626] flex items-center justify-center text-xs font-bold">!</span>
          ) : (
            <span className="w-5 h-5 rounded-full border-2 border-[#DDDDDD] flex-shrink-0" />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <p className={`text-sm ${item.done ? 'line-through text-[#999999]' : 'text-[#222222]'}`}>
            {item.action}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {!item.done && item.potentialPoints > 0 && (
            <span className="text-[11px] font-semibold text-[#FF6B00] bg-[#FFF0E8] border border-[#FF6B00]/20 rounded-full px-2 py-0.5 whitespace-nowrap">
              up to +{item.potentialPoints} pts
            </span>
          )}
          <span className="text-[#BBBBBB] text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="pl-8 pr-1 pb-3">
          <p className="text-xs text-[#666666] leading-relaxed">{item.whyItMatters}</p>
        </div>
      )}
    </div>
  )
}

// ── Checklist category accordion ──────────────────────────────────────────────

function ChecklistCategory({ category, items }: { category: ChecklistItem['category']; items: ChecklistItem[] }) {
  const [open, setOpen] = useState(category === 'critical' || category === 'impact')
  const done = items.filter((i) => i.done).length
  const total = items.length

  return (
    <div className="border-b border-[#EEEEEE] last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#FAFAFA] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${category === 'critical' && done < total ? 'text-[#DC2626]' : 'text-[#222222]'}`}>
            {CATEGORY_LABELS[category]}
          </span>
          <span className="text-xs text-[#999999]">
            {done}/{total} {done === total ? '✓' : ''}
          </span>
        </div>
        <span className="text-[#BBBBBB] text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-2">
          {items.map((item) => (
            <ChecklistItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main results content ──────────────────────────────────────────────────────

function ResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cvId = searchParams.get('cvId')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScoreResult | null>(null)

  // Share link state
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!cvId) { router.replace('/upload'); return }

    async function generate() {
      // Auth check
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/upload'); return }

      try {
        const res = await fetch(`/api/cv/${cvId}/score`, { method: 'POST' })
        const data = await res.json()

        if (res.status === 400 && data.error?.includes('Select a target role')) {
          router.replace(`/select-role?cvId=${cvId}`)
          return
        }
        if (!res.ok || !data.ok) {
          setError(data.error || 'Something went wrong — please try again.')
          setLoading(false)
          return
        }

        setResult(data.result as ScoreResult)
      } catch {
        setError('Network error — please check your connection and try again.')
      }
      setLoading(false)
    }

    generate()
  }, [cvId, router])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF7F2] flex flex-col">
        <Header isSignedIn />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#555555] font-medium">Analysing your CV…</p>
          <p className="text-xs text-[#999999]">Checking 4 scoring categories</p>
        </div>
      </main>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !result) {
    return (
      <main className="min-h-screen bg-[#FFF7F2] flex flex-col">
        <Header isSignedIn />
        <div className="max-w-xl mx-auto px-4 py-16 w-full">
          <AlertBanner type="error" message={error || 'Could not load your score. Please try again.'} />
          <div className="mt-6">
            <Button variant="primary" onClick={() => router.replace(`/upload`)}>Start again</Button>
          </div>
        </div>
      </main>
    )
  }

  // ── Data derivations ───────────────────────────────────────────────────────
  const { overallScore, passFail, criticalConcerns, buckets, checklist, targetRole, keywordData } = result

  const topFixes = checklist
    .filter((i) => !i.done && i.potentialPoints > 0)
    .sort((a, b) => b.potentialPoints - a.potentialPoints)
    .slice(0, 3)

  const categories = (['critical', 'impact', 'ats', 'formatting', 'clarity'] as const)
    .map((cat) => ({ category: cat, items: checklist.filter((i) => i.category === cat) }))
    .filter((g) => g.items.length > 0)

  const totalItems = checklist.length
  const doneItems = checklist.filter((i) => i.done).length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        {/* Progress */}
        <div className="mb-8">
          <ProgressIndicator currentStep="score" />
        </div>

        {/* Critical concerns banner */}
        {criticalConcerns.length > 0 && (
          <div className="mb-5 flex flex-col gap-2">
            {criticalConcerns.map((concern, i) => (
              <AlertBanner key={i} type="error" message={`Critical: ${concern}`} />
            ))}
          </div>
        )}

        {/* Score hero */}
        <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-4 flex flex-col sm:flex-row items-center gap-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <ScoreRing score={overallScore} pass={passFail} />
          <div className="flex flex-col items-center sm:items-start gap-3">
            <span className={['inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold', passFail ? 'bg-green-100 text-[#16A34A]' : 'bg-red-100 text-[#DC2626]'].join(' ')}>
              {passFail ? '✓ Recruiter-ready' : '✕ Needs work'}
            </span>
            <p className="text-sm text-[#555555]">
              Scored for <span className="font-semibold text-[#222222]">{ROLE_LABELS[targetRole]}</span>
            </p>
            <p className="text-xs text-[#999999]">
              {passFail
                ? 'Your CV passes our recruiter threshold. Fixing the items below will push your score higher.'
                : criticalConcerns.length > 0
                ? 'Your CV has critical concerns that override the numeric score. Fix these first.'
                : overallScore >= 55
                ? 'Your CV is close — fix the top items below to reach the 70-point pass mark.'
                : overallScore >= 40
                ? 'Your CV needs work — tackle the fixes below to reach the 70-point pass mark.'
                : 'Your CV needs significant work to reach the 70-point pass mark. Start with the top fixes below.'}
            </p>
          </div>
        </div>

        {/* Bucket breakdown */}
        <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 className="text-[15px] font-semibold text-[#222222] mb-5">Score breakdown</h2>
          <div className="space-y-4">
            {BUCKET_CONFIG.map(({ key, label, max }) => {
              const score = buckets[key].score
              const pct = Math.round((score / max) * 100)
              const color = barColor(score, max)
              return (
                <div key={key}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm text-[#444444]">{label}</span>
                    <span className="text-sm font-semibold" style={{ color }}>
                      {score}
                      <span className="text-[#999999] font-normal">/{max}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  {/* Bucket issues (top 1 if score is below 80%) */}
                  {pct < 80 && buckets[key].issues[0] && (
                    <p className="text-[11px] text-[#999999] mt-1">{buckets[key].issues[0]}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Top fixes */}
        {topFixes.length > 0 && (
          <div className="bg-white rounded-[8px] border-l-4 border-l-[#FF6B00] border border-[#DDDDDD] p-6 mb-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h2 className="text-[15px] font-semibold text-[#222222] mb-4">Top {topFixes.length} fixes</h2>
            <div className="space-y-3">
              {topFixes.map((fix) => (
                <div key={fix.id} className="flex items-start gap-3">
                  <span className="flex-shrink-0 text-[11px] font-semibold text-[#FF6B00] bg-[#FFF0E8] border border-[#FF6B00]/20 rounded-full px-2 py-0.5 mt-0.5 whitespace-nowrap">
                    up to +{fix.potentialPoints} pts
                  </span>
                  <p className="text-sm text-[#333333]">{fix.action}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full checklist */}
        <div className="bg-white rounded-[8px] border border-[#DDDDDD] mb-4 overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#222222]">Full checklist</h2>
            <span className="text-xs text-[#999999]">{doneItems}/{totalItems} complete</span>
          </div>
          {categories.map(({ category, items }) => (
            <ChecklistCategory key={category} category={category} items={items} />
          ))}
        </div>

        {/* Keyword transparency */}
        {keywordData && (
          <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#222222]">Keyword check</h2>
              <span className="text-xs text-[#666666]">{keywordData.matched.length}/{keywordData.total} matched for {ROLE_LABELS[keywordData.role]}</span>
            </div>
            {keywordData.matched.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-[#16A34A] uppercase tracking-wide mb-2">Present</p>
                <div className="flex flex-wrap gap-1.5">
                  {keywordData.matched.map((kw) => (
                    <span key={kw} className="text-xs bg-green-50 text-[#16A34A] border border-green-200 rounded-full px-2.5 py-0.5">{kw}</span>
                  ))}
                </div>
              </div>
            )}
            {keywordData.missing.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[#DC2626] uppercase tracking-wide mb-2">Missing</p>
                <div className="flex flex-wrap gap-1.5">
                  {keywordData.missing.slice(0, 15).map((kw) => (
                    <span key={kw} className="text-xs bg-[#F8F8F8] text-[#888888] border border-[#E0E0E0] rounded-full px-2.5 py-0.5">{kw}</span>
                  ))}
                  {keywordData.missing.length > 15 && (
                    <span className="text-xs text-[#BBBBBB] self-center">+{keywordData.missing.length - 15} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Share results */}
        <div className="mb-4">
          {!shareUrl ? (
            <Button
              variant="secondary"
              size="md"
              className="w-full justify-center"
              loading={shareLoading}
              onClick={async () => {
                setShareLoading(true)
                setShareError(null)
                try {
                  const res = await fetch(`/api/cv/${cvId}/share`, { method: 'POST' })
                  const data = await res.json()
                  if (!res.ok || !data.ok) {
                    setShareError(data.error || 'Could not create share link')
                  } else {
                    setShareUrl(data.shareUrl)
                  }
                } catch {
                  setShareError('Network error — please try again')
                }
                setShareLoading(false)
              }}
            >
              Share results
            </Button>
          ) : (
            <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <p className="text-sm font-semibold text-[#222222] mb-2">Shareable link</p>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 text-sm text-[#444444] bg-[#F8F8F8] border border-[#DDDDDD] rounded-md px-3 py-2 truncate"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                >
                  {copied ? 'Copied!' : 'Copy link'}
                </Button>
              </div>
              <p className="text-xs text-[#999999]">
                Shared view includes your score and checklist — no personal info.
              </p>
            </div>
          )}
          {shareError && (
            <p className="text-xs text-[#DC2626] mt-2">{shareError}</p>
          )}
        </div>

        {/* CTA */}
        <Button variant="primary" size="lg" className="w-full justify-center" onClick={() => router.push(`/editor?cvId=${cvId}`)}>
          Edit my CV →
        </Button>
      </div>
    </main>
  )
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FFF7F2] flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <ResultsContent />
    </Suspense>
  )
}
