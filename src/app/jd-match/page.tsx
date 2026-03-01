'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import { createClient } from '@/lib/supabase/client'
import type { JDMatchResult } from '@/lib/jdMatcher'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchResponse {
  ok: boolean
  checkId: string
  result: JDMatchResult
  checksUsed: number
  checksRemaining: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColour(score: number): string {
  if (score >= 75) return '#16A34A'  // green
  if (score >= 50) return '#D97706'  // amber
  return '#DC2626'                    // red
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'Strong match'
  if (score >= 50) return 'Partial match'
  if (score > 0)   return 'Weak match'
  return 'No match detected'
}

const SUBTYPE_LABELS: Record<string, string> = {
  'demand-gen': 'Demand generation',
  'content':    'Content marketing',
  'growth':     'Growth marketing',
  'brand':      'Brand & comms',
}

// ── Keyword chip ──────────────────────────────────────────────────────────────

function Chip({ label, variant }: { label: string; variant: 'matched' | 'missing' }) {
  const matched = variant === 'matched'
  return (
    <span
      className={`text-xs rounded-full px-2.5 py-1 border ${
        matched
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-red-50 text-[#DC2626] border-red-200'
      }`}
    >
      {label}
    </span>
  )
}

// ── Breakdown row ─────────────────────────────────────────────────────────────

function BreakdownSection({
  title,
  matched,
  missing,
}: {
  title: string
  matched: string[]
  missing: string[]
}) {
  const total = matched.length + missing.length
  if (total === 0) return null

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[#444444]">{title}</span>
        <span className="text-xs text-[#999999]">
          {matched.length}/{total} matched
        </span>
      </div>
      {total > 0 && (
        <div className="w-full bg-[#F0F0F0] rounded-full h-1.5 mb-2">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{
              width: `${Math.round((matched.length / total) * 100)}%`,
              backgroundColor: matched.length / total >= 0.75 ? '#16A34A' : matched.length / total >= 0.5 ? '#D97706' : '#DC2626',
            }}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {matched.map((kw) => <Chip key={kw} label={kw} variant="matched" />)}
        {missing.map((kw) => <Chip key={kw} label={kw} variant="missing" />)}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function JDMatchContent() {
  const searchParams = useSearchParams()
  const cvId = searchParams.get('cv')

  const [jdText, setJdText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MatchResponse | null>(null)
  const [checksRemaining, setChecksRemaining] = useState<number | null>(null)
  const [isPaywalled, setIsPaywalled] = useState(false)
  const [resolvedCvId, setResolvedCvId] = useState<string | null>(cvId)

  // If no cvId in URL, fetch the user's latest CV
  useEffect(() => {
    if (resolvedCvId) return

    async function fetchCurrentCV() {
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

    fetchCurrentCV()
  }, [resolvedCvId])

  // Fetch usage on mount to show remaining checks
  useEffect(() => {
    async function fetchUsage() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: usage } = await supabase
        .from('usage')
        .select('free_jd_checks_used, paid_status')
        .eq('user_id', user.id)
        .maybeSingle()

      if (usage) {
        const isPaid = usage.paid_status !== 'free'
        const used = usage.free_jd_checks_used ?? 0
        if (!isPaid) {
          setChecksRemaining(Math.max(2 - used, 0))
          if (used >= 2) setIsPaywalled(true)
        }
      }
    }
    fetchUsage()
  }, [])

  async function handleCheck() {
    if (!resolvedCvId) {
      setError('No CV found — upload your CV first.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`/api/cv/${resolvedCvId}/jd-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 402) {
          setIsPaywalled(true)
          setError(data.message ?? 'Free JD checks used up. Upgrade to continue.')
          return
        }
        setError(data.error ?? 'Something went wrong — please try again.')
        return
      }

      setResult(data)
      setChecksRemaining(data.checksRemaining)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  const canCheck = jdText.trim().length >= 100 && !loading && !isPaywalled && !!resolvedCvId

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-[#222222] mb-2 text-center">JD Match</h1>
        <p className="text-[#444444] text-center text-sm mb-2">
          Paste a job description to see how well your CV matches it. We'll surface missing keywords and give you a fit score.
        </p>

        {/* Usage indicator */}
        {checksRemaining !== null && !isPaywalled && (
          <p className="text-center text-xs text-[#999999] mb-6">
            {checksRemaining} free check{checksRemaining !== 1 ? 's' : ''} remaining
          </p>
        )}
        {isPaywalled && (
          <p className="text-center text-xs text-[#DC2626] mb-6 font-medium">
            Free JD checks used up
          </p>
        )}
        {checksRemaining === null && !isPaywalled && <div className="mb-6" />}

        {error && (
          <div className="mb-4">
            <AlertBanner type="error" message={error} />
          </div>
        )}

        {/* Input card */}
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
            disabled={isPaywalled}
            className="w-full text-sm text-[#222222] border border-[#DDDDDD] rounded-[6px] px-3 py-2.5 focus:outline-none focus:border-[#FF6B00] resize-none transition-colors placeholder:text-[#999999] disabled:bg-[#F8F8F8] disabled:cursor-not-allowed"
          />
          {jdText.length > 0 && jdText.trim().length < 100 && (
            <p className="text-xs text-[#999999] mt-1">
              {100 - jdText.trim().length} more characters needed
            </p>
          )}
          <Button
            variant="primary"
            size="md"
            disabled={!canCheck}
            onClick={handleCheck}
            className="mt-4 w-full justify-center"
          >
            {loading ? 'Checking…' : isPaywalled ? '🔒 Upgrade to check' : 'Check match'}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <MatchResults result={result.result} />
        )}

        {/* Paywall state */}
        {isPaywalled && !result && (
          <div
            className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 text-center"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="text-3xl mb-2">🔒</div>
            <p className="text-sm font-medium text-[#222222] mb-1">Free JD checks used up</p>
            <p className="text-sm text-[#666666]">
              You've used your 2 free JD checks. Upgrade to run unlimited checks.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

// ── Results component ─────────────────────────────────────────────────────────

function MatchResults({ result }: { result: JDMatchResult }) {
  const { matchScore, matchedKeywords, missingKeywords, breakdown, marketingSubtype } = result
  const colour = scoreColour(matchScore)

  const [showBreakdown, setShowBreakdown] = useState(false)

  return (
    <div
      className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      {/* Score header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-[15px] font-semibold text-[#222222]">Match score</h2>
          {marketingSubtype && (
            <p className="text-xs text-[#999999] mt-0.5">
              JD context: {SUBTYPE_LABELS[marketingSubtype] ?? marketingSubtype}
            </p>
          )}
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold" style={{ color: colour }}>
            {matchScore}
          </span>
          <span className="text-sm text-[#999999] font-normal">/100</span>
          <p className="text-xs font-medium mt-0.5" style={{ color: colour }}>
            {scoreLabel(matchScore)}
          </p>
        </div>
      </div>

      {/* Score bar */}
      <div className="w-full bg-[#F0F0F0] rounded-full h-2 mb-5">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${matchScore}%`, backgroundColor: colour }}
        />
      </div>

      {/* Keyword summary */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-green-50 rounded-[6px] border border-green-200 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{matchedKeywords.length}</p>
          <p className="text-xs text-green-700 mt-0.5">keywords matched</p>
        </div>
        <div className="bg-red-50 rounded-[6px] border border-red-200 p-3 text-center">
          <p className="text-2xl font-bold text-[#DC2626]">{missingKeywords.length}</p>
          <p className="text-xs text-[#DC2626] mt-0.5">keywords missing</p>
        </div>
      </div>

      {/* Missing keywords — always visible */}
      {missingKeywords.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-medium text-[#222222] mb-2">Missing from your CV</p>
          <div className="flex flex-wrap gap-1.5">
            {missingKeywords.map((kw) => (
              <Chip key={kw} label={kw} variant="missing" />
            ))}
          </div>
        </div>
      )}

      {/* Matched keywords — always visible */}
      {matchedKeywords.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-medium text-[#222222] mb-2">Already in your CV</p>
          <div className="flex flex-wrap gap-1.5">
            {matchedKeywords.map((kw) => (
              <Chip key={kw} label={kw} variant="matched" />
            ))}
          </div>
        </div>
      )}

      {/* Breakdown toggle */}
      {result.jdKeywords.length > 0 && (
        <div className="border-t border-[#DDDDDD] pt-4">
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            className="text-xs text-[#FF6B00] font-medium hover:underline focus:outline-none"
          >
            {showBreakdown ? 'Hide breakdown ↑' : 'Show breakdown by category ↓'}
          </button>

          {showBreakdown && (
            <div className="mt-4">
              <BreakdownSection
                title="Role keywords"
                matched={breakdown.roleKeywords.matched}
                missing={breakdown.roleKeywords.missing}
              />
              <BreakdownSection
                title="Tools & platforms"
                matched={breakdown.toolKeywords.matched}
                missing={breakdown.toolKeywords.missing}
              />
              <BreakdownSection
                title="Related terms"
                matched={breakdown.generalKeywords.matched}
                missing={breakdown.generalKeywords.missing}
              />
            </div>
          )}
        </div>
      )}

      {/* No keywords found */}
      {result.jdKeywords.length === 0 && (
        <p className="text-sm text-[#999999] text-center py-2">
          No standard GTM keywords detected in this JD. The role may use non-standard terminology.
        </p>
      )}
    </div>
  )
}

// ── Export with Suspense boundary ─────────────────────────────────────────────

export default function JDMatchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FFF7F2] flex items-center justify-center">
        <p className="text-sm text-[#999999]">Loading…</p>
      </div>
    }>
      <JDMatchContent />
    </Suspense>
  )
}
