'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABELS } from '@/lib/roleDetect'
import type { StructuredCV, ExperienceRole, EducationEntry } from '@/types/database'
import type { ScoreResult } from '@/lib/scorer'
import { detectAvailableFixes, applyFix } from '@/lib/cvFixes'
import type { AvailableFix } from '@/lib/cvFixes'
import SkillTagInput from '@/components/SkillTagInput'
import { DEMO_CV, DEMO_SCORE } from '@/lib/demoData'
import { track, identifyUser } from '@/lib/posthog'

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUCKET_CONFIG = [
  { key: 'proofOfImpact' as const, label: 'Proof of impact',    max: 47 },
  { key: 'formatting'    as const, label: 'Formatting',          max: 27 },
  { key: 'clarity'       as const, label: 'Clarity & structure', max: 26 },
]

const CATEGORY_LABELS: Record<string, string> = {
  critical:   'Critical concerns',
  impact:     'Proof of impact',
  formatting: 'Formatting',
  clarity:    'Clarity & structure',
}

function barColor(score: number, max: number): string {
  const pct = score / max
  if (pct >= 0.8) return '#16A34A'
  if (pct >= 0.5) return '#D97706'
  return '#DC2626'
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, pass }: { score: number; pass: boolean }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const color = pass ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626'

  const [displayScore, setDisplayScore] = useState(0)
  const [delta, setDelta] = useState<number | null>(null)
  const [deltaKey, setDeltaKey] = useState(0)

  const mountedRef  = useRef(false)
  const prevScoreRef = useRef<number>(0)
  const animRef     = useRef<number | null>(null)

  useEffect(() => {
    const isEntrance = !mountedRef.current
    mountedRef.current = true

    const from     = isEntrance ? 0 : prevScoreRef.current
    const to       = score
    const delay    = isEntrance ? 300 : 0
    const duration = 800

    // Show "+X pts" flash on re-score improvement
    if (!isEntrance && to > from) {
      setDelta(to - from)
      setDeltaKey((k) => k + 1)
    }

    prevScoreRef.current = to

    // Cancel any in-flight animation
    if (animRef.current !== null) cancelAnimationFrame(animRef.current)

    let startTime: number | null = null

    const tick = (ts: number) => {
      if (startTime === null) startTime = ts
      const elapsed  = ts - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased    = 1 - Math.pow(1 - progress, 3)
      setDisplayScore(Math.round(from + (to - from) * eased))
      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        animRef.current = null
      }
    }

    const timerId = setTimeout(() => {
      animRef.current = requestAnimationFrame(tick)
    }, delay)

    return () => {
      clearTimeout(timerId)
      if (animRef.current !== null) cancelAnimationFrame(animRef.current)
    }
  }, [score]) // eslint-disable-line react-hooks/exhaustive-deps

  const dash = (displayScore / 100) * circ

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* "+X pts" delta flash */}
      {delta !== null && (
        <span
          key={deltaKey}
          className="score-delta-flash absolute -top-7 text-sm font-bold text-[#16A34A]"
          onAnimationEnd={() => setDelta(null)}
        >
          +{delta} pts
        </span>
      )}

      <svg width="130" height="130" className="-rotate-90">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#F0F0F0" strokeWidth="10" />
        <circle
          cx="65" cy="65" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>

      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-[#222222] leading-none">{displayScore}</span>
        <span className="text-xs text-[#999999] mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

// ── Checklist item row ────────────────────────────────────────────────────────

function ChecklistItemRow({ item, isNewlyResolved }: { item: ScoreResult['checklist'][0]; isNewlyResolved?: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`border-b border-[#F0F0F0] last:border-0 ${item.done ? 'opacity-60' : ''} ${isNewlyResolved ? 'checklist-resolve-flash' : ''}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 py-2.5 text-left cursor-pointer hover:bg-[#FAFAFA] px-1 rounded transition-colors"
      >
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
          <p className={`text-xs ${item.done ? 'line-through text-[#999999]' : 'text-[#222222]'}`}>{item.action}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-1">
          {!item.done && item.potentialPoints > 0 && (
            <span className="text-[10px] font-semibold text-[#FF6B00] bg-[#FFF0E8] border border-[#FF6B00]/20 rounded-full px-1.5 py-0.5 whitespace-nowrap">
              +{item.potentialPoints}
            </span>
          )}
          <span className="text-[#BBBBBB] text-[10px]">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div className="pl-8 pr-1 pb-2.5">
          <p className="text-[11px] text-[#666666] leading-relaxed">{item.whyItMatters}</p>
        </div>
      )}
    </div>
  )
}

// ── Checklist category accordion ──────────────────────────────────────────────

function ChecklistCategory({
  category,
  items,
  newlyResolvedIds,
}: {
  category: string
  items: ScoreResult['checklist']
  newlyResolvedIds: Set<string>
}) {
  const [open, setOpen] = useState(category === 'critical' || category === 'impact')
  const done = items.filter((i) => i.done).length
  const total = items.length

  return (
    <div className="border-b border-[#EEEEEE] last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#FAFAFA] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${category === 'critical' && done < total ? 'text-[#DC2626]' : 'text-[#222222]'}`}>
            {CATEGORY_LABELS[category] ?? category}
          </span>
          <span className="text-[10px] text-[#999999]">
            {done}/{total} {done === total ? '✓' : ''}
          </span>
        </div>
        <span className="text-[#BBBBBB] text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-1">
          {items.map((item) => (
            <ChecklistItemRow key={item.id} item={item} isNewlyResolved={newlyResolvedIds.has(item.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Auto-resize textarea ──────────────────────────────────────────────────────

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// ── Placeholder detection — true if value contains [bracket content] ──────────

function hasPlaceholder(value: string): boolean {
  return /\[.+?\]/.test(value)
}

// ── Editable textarea ─────────────────────────────────────────────────────────

function EditableText({
  value,
  onChange,
  placeholder,
  rows = 1,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (ref.current) autoResize(ref.current) }, [value])
  const isPholder = hasPlaceholder(value)

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => { onChange(e.target.value); autoResize(e.target) }}
        className={[
          'w-full text-sm text-[#222222] border rounded-[4px] px-2 py-1',
          'hover:border-[#DDDDDD] focus:border-[#FF6B00] focus:outline-none',
          'resize-none transition-colors focus:bg-white',
          isPholder
            ? 'bg-amber-50 border-amber-300 border-l-4 border-l-amber-400 pr-14'
            : 'bg-[#F9F9F9] border-[#EEEEEE]',
        ].join(' ')}
      />
      {isPholder && (
        <span className="absolute right-1.5 top-1.5 text-[10px] text-amber-700 font-semibold pointer-events-none select-none bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 leading-none whitespace-nowrap">
          fill in ✏️
        </span>
      )}
    </div>
  )
}

// ── Editable inline input ─────────────────────────────────────────────────────

function EditableInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const isPholder = hasPlaceholder(value)
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'text-sm border rounded-[4px] px-2 py-0.5',
        'hover:border-[#DDDDDD] focus:border-[#FF6B00] focus:outline-none',
        'transition-colors focus:bg-white w-full',
        isPholder
          ? 'bg-amber-50 border-amber-300 border-l-4 border-l-amber-400 text-amber-900'
          : 'bg-[#F9F9F9] border-[#EEEEEE]',
        className,
      ].join(' ')}
    />
  )
}

// ── Experience role card ──────────────────────────────────────────────────────

function RoleCard({
  role,
  onChange,
}: {
  role: ExperienceRole
  index: number
  onChange: (updated: ExperienceRole) => void
}) {
  const updateBullet = (bi: number, val: string) => {
    const bullets = [...role.bullets]
    bullets[bi] = val
    onChange({ ...role, bullets })
  }
  const addBullet = () => onChange({ ...role, bullets: [...role.bullets, ''] })
  const removeBullet = (bi: number) => {
    if (role.bullets.length <= 1) return
    onChange({ ...role, bullets: role.bullets.filter((_, i) => i !== bi) })
  }

  return (
    <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div className="mb-4 space-y-1">
        <EditableInput value={role.title} onChange={(v) => onChange({ ...role, title: v })} placeholder="Job title" className="font-semibold text-[#222222] text-[15px]" />
        <div className="flex items-center gap-1 flex-wrap">
          <EditableInput value={role.company} onChange={(v) => onChange({ ...role, company: v })} placeholder="Company" className="text-[#555555]" />
          {role.company && role.company.trim() && <span className="text-[#BBBBBB] text-xs">·</span>}
          <EditableInput value={role.start} onChange={(v) => onChange({ ...role, start: v })} placeholder="Start" className="text-[#555555] w-24" />
          <span className="text-[#BBBBBB] text-xs">–</span>
          <EditableInput value={role.end ?? 'Present'} onChange={(v) => onChange({ ...role, end: v || null })} placeholder="End / Present" className="text-[#555555] w-24" />
        </div>
      </div>
      <div className="space-y-1.5">
        {role.bullets.map((bullet, bi) => (
          <div key={bi} className="flex items-start gap-1.5">
            <span className="text-[#FF6B00] mt-1.5 flex-shrink-0 text-sm">•</span>
            <EditableText value={bullet} onChange={(v) => updateBullet(bi, v)} placeholder="Add a bullet point…" className="flex-1" />
            {role.bullets.length > 1 && (
              <button onClick={() => removeBullet(bi)} className="text-[#CCCCCC] hover:text-[#DC2626] active:text-[#DC2626] transition-colors text-base flex-shrink-0 mt-0.5 cursor-pointer p-1 -mr-1" title="Remove bullet">×</button>
            )}
          </div>
        ))}
      </div>
      <button onClick={addBullet} className="mt-3 text-xs text-[#FF6B00] hover:text-[#E85F00] transition-colors cursor-pointer flex items-center gap-1">+ Add bullet</button>
    </div>
  )
}

// ── Critical banners block ────────────────────────────────────────────────────
// Collapses multiple critical issues into a single banner to avoid alarming
// users with a wall of red before they've even seen their score.

function CriticalBannersBlock({ concerns }: { concerns: string[] }) {
  const [expanded, setExpanded] = useState(false)

  if (concerns.length === 0) return null

  if (concerns.length === 1) {
    return <AlertBanner type="error" message={`Critical: ${concerns[0]}`} />
  }

  // 2+ issues — single collapsible banner
  return (
    <div className="w-full border-l-4 border-l-[#DC2626] bg-red-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-sm font-semibold mt-px text-red-800 flex-shrink-0">✕</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-red-800">
              {concerns.length} critical issues found
            </p>
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-red-700 hover:text-red-900 font-medium flex-shrink-0 transition-colors cursor-pointer"
            >
              {expanded ? 'Show less ▲' : 'Show all ▼'}
            </button>
          </div>
          <p className="text-sm text-red-800 mt-0.5">{concerns[0]}</p>
          {expanded ? (
            <ul className="mt-2 space-y-1">
              {concerns.slice(1).map((c, i) => (
                <li key={i} className="text-sm text-red-800 flex gap-1.5">
                  <span className="flex-shrink-0 mt-px">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-red-700 mt-1">
              +{concerns.length - 1} more — see checklist below or{' '}
              <button
                onClick={() => setExpanded(true)}
                className="underline cursor-pointer hover:no-underline"
              >
                show here
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Next fix nudge ────────────────────────────────────────────────────────────

function NextFixCard({ items, onFix }: { items: ScoreResult['checklist']; onFix?: () => void }) {
  const unfixed = items.filter(i => !i.done)
  if (unfixed.length === 0) return null

  // Critical issues surface first regardless of points, then sort by potentialPoints desc
  const sorted = [...unfixed].sort((a, b) => {
    if (a.category === 'critical' && b.category !== 'critical') return -1
    if (b.category === 'critical' && a.category !== 'critical') return 1
    return b.potentialPoints - a.potentialPoints
  })

  const next = sorted[0]
  const remaining = unfixed.length

  return (
    <div className="bg-[#FFF7F2] border border-[#FFD4A8] rounded-[8px] p-4 mb-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[10px] font-semibold text-[#FF6B00] uppercase tracking-wide">Best next move</p>
        <span className="text-[10px] text-[#BBBBBB]">{remaining} fix{remaining === 1 ? '' : 'es'} left</span>
      </div>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[13px] font-medium text-[#222222] leading-snug flex-1">{next.action}</p>
        {next.potentialPoints > 0 && (
          <span className="text-[10px] font-semibold text-[#FF6B00] bg-white border border-[#FF6B00]/30 rounded-full px-1.5 py-0.5 flex-shrink-0 mt-0.5">
            +{next.potentialPoints} pts
          </span>
        )}
      </div>
      {onFix && (
        <button
          onClick={onFix}
          className="text-xs font-semibold text-white bg-[#FF6B00] hover:bg-[#E05A00] rounded-[6px] px-3 py-1.5 transition-colors cursor-pointer"
        >
          Fix this in editor →
        </button>
      )}
    </div>
  )
}

// ── Quick fixes panel ─────────────────────────────────────────────────────────

function QuickFixesPanel({ fixes, onApply, noChangeFeedback }: {
  fixes: AvailableFix[]
  onApply: (id: AvailableFix['id']) => void
  noChangeFeedback: AvailableFix['id'] | null
}) {
  if (fixes.length === 0) return null
  return (
    <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h3 className="text-[13px] font-semibold text-[#222222] mb-1">Quick fixes</h3>
      <p className="text-[11px] text-[#888888] mb-3">One click. Re-score to see impact.</p>
      <div className="space-y-2">
        {fixes.map((fix) => (
          <div key={fix.id} className="flex flex-col gap-1">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#333333] leading-snug">{fix.label}</p>
                <p className="text-[10px] text-[#888888] mt-0.5">{fix.description}</p>
              </div>
              <button onClick={() => onApply(fix.id)} className="text-[11px] font-semibold text-[#FF6B00] hover:text-[#E85F00] border border-[#FF6B00] hover:border-[#E85F00] rounded-[4px] px-2 py-0.5 flex-shrink-0 transition-colors cursor-pointer whitespace-nowrap">Apply</button>
            </div>
            {noChangeFeedback === fix.id && (
              <p className="text-[10px] text-[#888888] bg-[#F5F5F5] rounded px-2 py-1">
                No sentence breaks found — edit the bullet manually to split it.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Placeholder reminder ──────────────────────────────────────────────────────

function countPlaceholders(cv: StructuredCV | null): number {
  if (!cv) return 0
  return cv.experience.reduce((total, role) => total + role.bullets.filter((b) => b.trim().startsWith('[')).length, 0)
}

function PlaceholderReminder({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div className="bg-[#FFF3E6] border border-[#FFCCA0] rounded-[8px] p-4">
      <p className="text-[12px] font-semibold text-[#CC5500] mb-1">{count} placeholder{count > 1 ? 's' : ''} to fill in</p>
      <p className="text-[11px] text-[#884400] leading-relaxed">Replace the <span className="font-mono bg-[#FFE8CC] px-0.5 rounded">[bracketed]</span> items with real content — that&apos;s what moves your score.</p>
    </div>
  )
}

// ── Save badge ────────────────────────────────────────────────────────────────

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  const config = {
    saving: { text: 'Saving…',   color: 'text-[#999999]' },
    saved:  { text: 'Saved ✓',   color: 'text-[#16A34A]' },
    error:  { text: 'Save failed', color: 'text-[#DC2626]' },
  }
  const { text, color } = config[status]
  return <span className={`text-xs font-medium ${color}`}>{text}</span>
}

// ── Score panel (left) ────────────────────────────────────────────────────────

function ScorePanel({
  result,
  initialScore,
  isRescoring,
  onRescore,
  cvId,
  showPassBanner,
  onDismissPassBanner,
  newlyResolvedIds,
  availableFixes,
  onApplyFix,
  fixNoChangeFeedback,
  hideMobileRescore = false,
  isDemo = false,
  noChangeFlash = false,
  onSwitchToEdit,
}: {
  result: ScoreResult
  initialScore: number
  isRescoring: boolean
  onRescore: () => void
  cvId: string
  showPassBanner: boolean
  onDismissPassBanner: () => void
  newlyResolvedIds: Set<string>
  availableFixes: AvailableFix[]
  onApplyFix: (id: AvailableFix['id']) => void
  fixNoChangeFeedback: AvailableFix['id'] | null
  hideMobileRescore?: boolean
  isDemo?: boolean
  noChangeFlash?: boolean
  onSwitchToEdit?: () => void
}) {
  // keywordsOpen removed — keywords moved to JD Match only (2026-03-06)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const { overallScore, passFail, criticalConcerns, buckets, checklist, targetRole } = result

  const improved = initialScore !== overallScore

  // Share trigger — used by both pass banner and the share section below
  const triggerShare = async () => {
    if (isDemo || shareUrl || shareLoading) return
    track('share_results_clicked', { cv_id: cvId, score: result?.overallScore })
    setShareLoading(true)
    setShareError(null)
    try {
      const res = await fetch(`/api/cv/${cvId}/share`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) setShareError(data.error || 'Could not create link')
      else {
        setShareUrl(data.shareUrl)
        track('share_link_created', { cv_id: cvId, score: result?.overallScore })
      }
    } catch { setShareError('Network error') }
    setShareLoading(false)
  }
  const doneItems = checklist.filter((i) => i.done).length
  const totalItems = checklist.length

  const categories = (['critical', 'impact', 'ats', 'formatting', 'clarity'] as const)
    .map((cat) => ({ category: cat as string, items: checklist.filter((i) => i.category === cat) }))
    .filter((g) => g.items.length > 0)

  const contextHint = (() => {
    if (criticalConcerns.length > 0) return 'Critical issues override the score. Fix these first.'
    if (passFail) return 'Passes the recruiter threshold. Fix the checklist items to push higher.'
    if (overallScore >= 55) return 'Close — tackle the top fixes to reach the 70-point pass mark.'
    if (overallScore >= 40) return 'Needs work — fix the checklist below to reach 70 points.'
    return 'Needs significant work. Start with the critical and impact fixes.'
  })()

  return (
    <div className="space-y-0">
      {/* Threshold banner — shown once when score first crosses 70 */}
      {showPassBanner && (
        <div className="mb-3 rounded-[8px] bg-green-50 border border-green-200 p-4">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className="text-sm font-semibold text-[#16A34A]">🎉 You&apos;ve hit the recruiter threshold!</p>
            <button
              onClick={onDismissPassBanner}
              className="text-green-400 hover:text-green-600 text-lg leading-none flex-shrink-0 cursor-pointer"
              aria-label="Dismiss"
            >×</button>
          </div>
          <p className="text-xs text-[#555555] mb-3 leading-relaxed">
            Your CV now scores 70+. Recruiters will take it seriously. Share your result.
          </p>
          {shareUrl ? (
            <div className="flex gap-2">
              <input type="text" readOnly value={shareUrl} className="flex-1 text-xs text-[#444444] bg-white border border-green-200 rounded-md px-2.5 py-1.5 truncate min-w-0" />
              <button
                onClick={async () => { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="text-xs font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-[6px] px-3 py-1.5 transition-colors cursor-pointer flex-shrink-0"
              >{copied ? 'Copied!' : 'Copy'}</button>
            </div>
          ) : (
            <button
              onClick={triggerShare}
              disabled={shareLoading}
              className="text-xs font-semibold text-[#16A34A] border border-green-300 bg-white hover:bg-green-50 rounded-[6px] px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              {shareLoading ? 'Creating link…' : 'Share results →'}
            </button>
          )}
          {shareError && <p className="text-[10px] text-[#DC2626] mt-1.5">{shareError}</p>}
        </div>
      )}

      {/* Score hero */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {/* Ring + badge */}
        <div className="flex flex-col items-center gap-3 mb-4">
          <ScoreRing score={overallScore} pass={passFail} />
          <div className="flex flex-col items-center gap-1.5">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${passFail ? 'bg-green-100 text-[#16A34A]' : 'bg-red-100 text-[#DC2626]'}`}>
              {passFail ? '✓ Recruiter-ready' : '✕ Needs work'}
            </span>
            {/* Threshold context — only shown when failing, so users know exactly what they're aiming for */}
            {!passFail && (
              <p className="text-[10px] text-[#AAAAAA] tracking-wide">
                Recruiter threshold: <span className="font-semibold text-[#888888]">70 / 100</span>
              </p>
            )}
            {/* Role label on its own line — prevents mid-phrase wrapping on narrow panels */}
            <p className="text-xs text-center">
              <span className="text-[#888888]">Scored for</span><br />
              <span className="font-semibold text-[#222222]">{ROLE_LABELS[targetRole]}</span>
            </p>
            {improved && (
              <p className="text-xs font-semibold text-[#FF6B00]">{initialScore} → {overallScore}</p>
            )}
            {noChangeFlash && (
              <p className="text-xs font-medium text-[#D97706]">Score unchanged — try a checklist fix ↓</p>
            )}
            <p className="text-[11px] text-[#888888] text-center leading-relaxed max-w-[200px]">{contextHint}</p>
          </div>
        </div>

        {/* Bucket bars */}
        <div className="space-y-3 mb-4">
          {BUCKET_CONFIG.map(({ key, label, max }) => {
            const sc = buckets[key].score
            const pct = Math.round((sc / max) * 100)
            const color = barColor(sc, max)
            return (
              <div key={key}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-[#555555]">{label}</span>
                  <span className="text-xs font-semibold" style={{ color }}>{sc}<span className="text-[#BBBBBB] font-normal">/{max}</span></span>
                </div>
                <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Fixes remaining */}
        {checklist.filter(i => !i.done).length > 0 && (
          <p className="text-xs text-[#888888] mb-3">
            <span className="font-semibold text-[#222222]">{checklist.filter(i => !i.done).length}</span> fix{checklist.filter(i => !i.done).length === 1 ? '' : 'es'} remaining — apply below, then re-score
          </p>
        )}

        {/* Quick fixes */}
        {availableFixes.length > 0 && (
          <div className="mb-4">
            <QuickFixesPanel fixes={availableFixes} onApply={onApplyFix} noChangeFeedback={fixNoChangeFeedback} />
          </div>
        )}

        {/* Separator */}
        <div className="border-t border-[#EEEEEE] mb-4" />

        {/* Re-score button — hidden on mobile (bottom bar owns it there) */}
        <div className={hideMobileRescore ? 'hidden md:block' : ''}>
          <Button variant="primary" size="md" className="w-full justify-center" onClick={onRescore} disabled={isRescoring}>
            {isDemo ? 'Sign in to score your own CV →' : isRescoring ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scoring…
              </span>
            ) : 'Re-score →'}
          </Button>
          <p className="text-[10px] text-[#BBBBBB] text-center mt-1.5">Saves automatically before re-scoring</p>
        </div>
      </div>

      {/* Next fix nudge */}
      {!isDemo && <NextFixCard items={checklist} onFix={onSwitchToEdit} />}

      {/* Checklist */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] overflow-hidden mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="px-4 py-3 border-b border-[#EEEEEE] flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[#222222]">Checklist</h3>
          <span className="text-[11px] text-[#999999]">{doneItems}/{totalItems}</span>
        </div>
        {categories.map(({ category, items }) => (
          <ChecklistCategory key={category} category={category} items={items} newlyResolvedIds={newlyResolvedIds} />
        ))}
      </div>

      {/* JD Match CTA — replaces the old keywords section (2026-03-06) */}
      {/* Keywords now only appear in JD Match, where advice is role-specific */}
      {!isDemo && cvId && (
        <Link
          href={`/jd-match?cv=${cvId}`}
          onClick={() => track('jd_match_clicked', { cv_id: cvId, score: result?.overallScore })}
          className="block bg-[#FFFAF7] rounded-[8px] border border-[#FFD4B3] p-4 mb-3 hover:border-[#FF6B00] hover:bg-[#FFF0E6] transition-all group"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-[#222222] mb-1">Have a specific role in mind?</p>
              <p className="text-[11px] text-[#888888] leading-relaxed">Paste the job description — get exact keyword gaps, a match score, and advice that&apos;s specific to <em>this</em> role.</p>
            </div>
            <span className="text-[#FF6B00] text-sm font-semibold whitespace-nowrap flex-shrink-0 group-hover:translate-x-0.5 transition-transform mt-0.5">
              Check fit →
            </span>
          </div>
        </Link>
      )}

      {/* Share (collapsible) */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {!shareUrl ? (
          <button
            onClick={triggerShare}
            className="w-full px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#FAFAFA] transition-colors"
          >
            <span className="text-[13px] font-semibold text-[#222222]">Share results</span>
            {shareLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-[10px] text-[#BBBBBB]">▼</span>
            )}
          </button>
        ) : (
          <div className="px-4 py-3">
            <p className="text-[13px] font-semibold text-[#222222] mb-2">Shareable link</p>
            <div className="flex gap-2 mb-1.5">
              <input type="text" readOnly value={shareUrl} className="flex-1 text-xs text-[#444444] bg-[#F8F8F8] border border-[#DDDDDD] rounded-md px-2.5 py-1.5 truncate min-w-0" />
              <Button variant="primary" size="sm" onClick={async () => { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <p className="text-[10px] text-[#999999]">Includes score and checklist — no personal data.</p>
          </div>
        )}
        {shareError && <p className="text-[11px] text-[#DC2626] px-4 pb-3">{shareError}</p>}
      </div>
    </div>
  )
}

// ── Editor panel (right) ──────────────────────────────────────────────────────

function EditorPanel({
  cv,
  saveStatus,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  onLocationChange,
  onLinkedInChange,
  onSummaryChange,
  onRoleChange,
  onSkillsChange,
  onEducationChange,
  onCertsChange,
  onAddRole,
  onAddEducation,
  cvId,
}: {
  cv: StructuredCV
  saveStatus: SaveStatus
  onNameChange: (v: string) => void
  onEmailChange: (v: string) => void
  onPhoneChange: (v: string) => void
  onLocationChange: (v: string) => void
  onLinkedInChange: (v: string) => void
  onSummaryChange: (v: string) => void
  onRoleChange: (i: number, r: ExperienceRole) => void
  onSkillsChange: (skills: string[]) => void
  onEducationChange: (i: number, e: EducationEntry) => void
  onCertsChange: (raw: string) => void
  onAddRole: () => void
  onAddEducation: () => void
  cvId: string
}) {
  const router = useRouter()
  const placeholders = countPlaceholders(cv)

  return (
    <div className="space-y-4">
      {/* Progress + save */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <ProgressIndicator currentStep="score" cvId={cvId ?? undefined} />
        </div>
        <SaveBadge status={saveStatus} />
      </div>

      {/* Edit hint */}
      <div className="flex items-center gap-2 text-[#888888] text-[12px] bg-[#F9F9F9] rounded-[6px] px-3 py-2 border border-[#EEEEEE]">
        <span className="text-[14px]">✏️</span>
        <span>All fields are editable — tap any field to make changes</span>
      </div>

      {/* Placeholder reminder */}
      {placeholders > 0 && <PlaceholderReminder count={placeholders} />}

      {/* Contact details */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Contact</h2>
        <div className="grid grid-cols-1 gap-2">
          <input type="text" value={cv.name ?? ''} onChange={e => onNameChange(e.target.value)} placeholder="Full name" className="w-full text-[13px] text-[#222222] bg-transparent border border-[#DDDDDD] rounded-[6px] px-3 py-2 focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]/20 placeholder:text-[#BBBBBB]" />
          <div className="grid grid-cols-2 gap-2">
            <input type="email" value={cv.email ?? ''} onChange={e => onEmailChange(e.target.value)} placeholder="Email address" className="w-full text-[13px] text-[#222222] bg-transparent border border-[#DDDDDD] rounded-[6px] px-3 py-2 focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]/20 placeholder:text-[#BBBBBB]" />
            <input type="tel" value={cv.phone ?? ''} onChange={e => onPhoneChange(e.target.value)} placeholder="Phone number" className="w-full text-[13px] text-[#222222] bg-transparent border border-[#DDDDDD] rounded-[6px] px-3 py-2 focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]/20 placeholder:text-[#BBBBBB]" />
          </div>
          <input type="text" value={cv.location ?? ''} onChange={e => onLocationChange(e.target.value)} placeholder="Location — e.g. London, UK" className="w-full text-[13px] text-[#222222] bg-transparent border border-[#DDDDDD] rounded-[6px] px-3 py-2 focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]/20 placeholder:text-[#BBBBBB]" />
        </div>
      </div>

      {/* LinkedIn URL */}
      <div id="editor-linkedin" className={`bg-white rounded-[8px] border p-4 ${!cv.linkedin?.trim() ? 'border-[#FCA5A5] bg-[#FFF5F5]' : 'border-[#DDDDDD]'}`} style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide">LinkedIn</h2>
          {!cv.linkedin?.trim() && (
            <span className="text-[10px] font-semibold text-red-600 bg-red-100 border border-red-200 rounded px-1.5 py-0.5 leading-none">CRITICAL</span>
          )}
        </div>
        <input
          id="linkedin-input"
          type="url"
          value={cv.linkedin ?? ''}
          onChange={e => onLinkedInChange(e.target.value)}
          placeholder="linkedin.com/in/yourname"
          className="w-full text-[13px] text-[#222222] bg-transparent border border-[#DDDDDD] rounded-[6px] px-3 py-2 focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]/20 placeholder:text-[#BBBBBB]"
        />
        {!cv.linkedin?.trim() && (
          <p className="text-[11px] text-red-500 mt-1.5">Recruiters check LinkedIn first — a missing URL costs you interviews.</p>
        )}
      </div>

      {/* Summary — always shown; nudge when missing */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Summary</h2>
        {!cv.summary?.trim() && (
          <div className="mb-3 flex items-start gap-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] px-3 py-2.5">
            <span className="text-[13px] flex-shrink-0">✍️</span>
            <p className="text-[11px] text-[#92400E] leading-relaxed">
              No summary detected — add one below to unlock up to <span className="font-semibold">+5 pts</span>
            </p>
          </div>
        )}
        <EditableText
          value={cv.summary ?? ''}
          onChange={onSummaryChange}
          placeholder="Write a 2–3 sentence professional summary targeting your chosen role…"
          rows={3}
        />
      </div>

      {/* Experience */}
      <div>
        <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide px-1 mb-3">Experience</h2>
        {cv.experience?.length > 0 ? (
          <div className="space-y-4">
            {cv.experience.map((role, i) => (
              <RoleCard key={i} role={role} index={i} onChange={(updated) => onRoleChange(i, updated)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#BBBBBB] px-1 mb-2">No experience added yet.</p>
        )}
        <button onClick={onAddRole} className="mt-3 text-xs text-[#FF6B00] hover:text-[#E85F00] transition-colors cursor-pointer flex items-center gap-1 px-1">
          + Add role
        </button>
      </div>

      {/* Skills */}
      {cv.skills !== undefined && (
        <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Skills</h2>
          <SkillTagInput value={cv.skills} onChange={onSkillsChange} placeholder="Salesforce, HubSpot, Gainsight…" />
          <p className="text-[10px] text-[#BBBBBB] mt-1.5">Press Enter or comma to add. Click × to remove.</p>
        </div>
      )}

      {/* Education */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Education</h2>
        {cv.education?.length > 0 ? (
          <div className="space-y-3 mb-3">
            {cv.education.map((edu, i) => (
              <div key={i} className="flex flex-wrap gap-1 items-center">
                <EditableInput value={edu.qualification} onChange={(v) => onEducationChange(i, { ...edu, qualification: v })} placeholder="Qualification" className="font-medium text-[#222222]" />
                <span className="text-[#BBBBBB] text-xs">·</span>
                <EditableInput value={edu.institution} onChange={(v) => onEducationChange(i, { ...edu, institution: v })} placeholder="Institution" className="text-[#555555]" />
                <span className="text-[#BBBBBB] text-xs">·</span>
                <EditableInput value={edu.year} onChange={(v) => onEducationChange(i, { ...edu, year: v })} placeholder="Year" className="text-[#555555] w-16" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#BBBBBB] mb-3">No education added yet.</p>
        )}
        <button onClick={onAddEducation} className="text-xs text-[#FF6B00] hover:text-[#E85F00] transition-colors cursor-pointer flex items-center gap-1">
          + Add education
        </button>
      </div>

      {/* Certifications — always shown so users can add them */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Certifications</h2>
        {(!cv.certifications || cv.certifications.length === 0) ? (
          <p className="text-[12px] text-[#BBBBBB] mb-2">No certifications added yet.</p>
        ) : null}
        <EditableText value={(cv.certifications ?? []).join('\n')} onChange={onCertsChange} placeholder="One certification per line — e.g. Salesforce Certified Administrator" rows={2} />
      </div>

      {/* Export CTA */}
      <div className="pt-2">
        <Button variant="secondary" size="md" className="w-full justify-center" onClick={() => { track('export_clicked', { cv_id: cvId }); router.push(`/export?cv=${cvId}`) }}>
          Export PDF →
        </Button>
      </div>
    </div>
  )
}

// ── Main page content ─────────────────────────────────────────────────────────

function ScorePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cvId = searchParams.get('cvId')
  const isDemo = searchParams.get('demo') === 'true'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cv, setCV] = useState<StructuredCV | null>(null)
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [initialScore, setInitialScore] = useState<number>(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isRescoring, setIsRescoring] = useState(false)
  const [fixNoChangeFeedback, setFixNoChangeFeedback] = useState<AvailableFix['id'] | null>(null)
  const [availableFixes, setAvailableFixes] = useState<AvailableFix[]>([])
  const [showPassBanner, setShowPassBanner] = useState(false)
  const [noChangeFlash, setNoChangeFlash] = useState(false)
  const [newlyResolvedIds, setNewlyResolvedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'edit' | 'score'>('score')

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestCV = useRef<StructuredCV | null>(null)
  const resultRef = useRef<ScoreResult | null>(null)

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Demo mode — load hardcoded data, skip auth + API entirely
    if (isDemo) {
      setCV(DEMO_CV)
      latestCV.current = DEMO_CV
      setResult(DEMO_SCORE)
      resultRef.current = DEMO_SCORE
      setInitialScore(DEMO_SCORE.overallScore)
      setLoading(false)
      return
    }

    if (!cvId) { router.replace('/upload'); return }

    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/upload'); return }
      identifyUser(user.id, user.email ?? undefined)

      try {
        const [cvRes, scoreRes] = await Promise.all([
          fetch(`/api/cv/${cvId}`),
          fetch(`/api/cv/${cvId}/score`, { method: 'POST' }),
        ])

        if (!cvRes.ok) {
          setError('Could not load your CV — please try again.')
          setLoading(false)
          return
        }

        if (scoreRes.status === 400) {
          const scoreData = await scoreRes.json()
          if (scoreData.error?.includes('Select a target role')) {
            router.replace(`/select-role?cvId=${cvId}`)
            return
          }
          setError(scoreData.error || 'Something went wrong scoring your CV.')
          setLoading(false)
          return
        }

        if (!scoreRes.ok) {
          const scoreData = await scoreRes.json()
          setError(scoreData.error || 'Could not score your CV — please try again.')
          setLoading(false)
          return
        }

        const [cvData, scoreData] = await Promise.all([cvRes.json(), scoreRes.json()])

        const structured = cvData.structured as StructuredCV
        const scoreResult = scoreData.result as ScoreResult

        setCV(structured)
        latestCV.current = structured
        setResult(scoreResult)
        resultRef.current = scoreResult
        // Seed from the API's initialScore (first-ever score for this CV)
        // so the "X → Y" arc persists across page refreshes and navigations.
        setInitialScore(scoreData.initialScore ?? scoreResult.overallScore)
        track('score_viewed', {
          score: scoreResult.overallScore,
          pass_fail: scoreResult.passFail,
          role: cvData.role ?? 'unknown',
          cv_id: cvId,
        })
      } catch {
        setError('Network error — please check your connection and try again.')
      }

      setLoading(false)
    }

    load()
  }, [cvId, router, isDemo])

  // ── Available fixes ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cv) setAvailableFixes(detectAvailableFixes(cv))
  }, [cv])

  // ── Debounced save ────────────────────────────────────────────────────────
  const scheduleSave = useCallback((updated: StructuredCV) => {
    if (isDemo) { latestCV.current = updated; setCV(updated); return }
    latestCV.current = updated
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!cvId || !latestCV.current) return
      try {
        const res = await fetch(`/api/cv/${cvId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structured: latestCV.current }),
        })
        setSaveStatus(res.ok ? 'saved' : 'error')
        setTimeout(() => setSaveStatus('idle'), 2500)
      } catch {
        setSaveStatus('error')
      }
    }, 800)
  }, [cvId])

  // ── Flush save ────────────────────────────────────────────────────────────
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (!cvId || !latestCV.current) return true
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/cv/${cvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structured: latestCV.current }),
      })
      setSaveStatus(res.ok ? 'saved' : 'error')
      setTimeout(() => setSaveStatus('idle'), 2500)
      return res.ok
    } catch {
      setSaveStatus('error')
      return false
    }
  }, [cvId])

  // ── Re-score ──────────────────────────────────────────────────────────────
  const handleRescore = useCallback(async () => {
    if (isDemo) { router.push('/upload'); return }
    if (!cvId || isRescoring) return
    track('rescore_clicked', { cv_id: cvId, current_score: resultRef.current?.overallScore })
    setIsRescoring(true)
    await flushSave()
    try {
      const res = await fetch(`/api/cv/${cvId}/score`, {
        method: 'POST',
        headers: { 'x-force-rescore': 'true' },
      })
      if (!res.ok) { setIsRescoring(false); return }
      const data = await res.json() as { result: ScoreResult }
      const newResult = data.result
      const oldResult = resultRef.current

      if (oldResult) {
        // Checklist items newly resolved after re-score
        const prevUnresolved = new Set(oldResult.checklist.filter(i => !i.done).map(i => i.id))
        const resolved = newResult.checklist.filter(i => i.done && prevUnresolved.has(i.id)).map(i => i.id)
        if (resolved.length > 0) {
          setNewlyResolvedIds(new Set(resolved))
          setTimeout(() => setNewlyResolvedIds(new Set()), 2200)
        }

        // First-time threshold crossing (below 70 → 70+)
        if (!oldResult.passFail && newResult.passFail) {
          setShowPassBanner(true)
        }

        // Score unchanged after re-score
        if (oldResult.overallScore === newResult.overallScore) {
          setNoChangeFlash(true)
          setTimeout(() => setNoChangeFlash(false), 3500)
        }
      }

      track('rescore_completed', {
        cv_id: cvId,
        old_score: oldResult?.overallScore ?? null,
        new_score: newResult.overallScore,
        delta: (oldResult ? newResult.overallScore - oldResult.overallScore : null),
        pass_fail: newResult.passFail,
      })
      resultRef.current = newResult
      setResult(newResult)
    } catch {
      // fail silently — score stays as-is
    } finally {
      setIsRescoring(false)
    }
  }, [cvId, isRescoring, isDemo, router, flushSave])

  // ── Apply fix ─────────────────────────────────────────────────────────────
  const handleApplyFix = useCallback((fixId: AvailableFix['id']) => {
    const current = latestCV.current
    if (!current) return
    const updated = applyFix(current, fixId)
    const changed = JSON.stringify(updated) !== JSON.stringify(current)
    if (!changed) {
      setFixNoChangeFeedback(fixId)
      setTimeout(() => setFixNoChangeFeedback(null), 4000)
      return
    }
    setFixNoChangeFeedback(null)
    latestCV.current = updated
    setCV(updated)
    scheduleSave(updated)
  }, [scheduleSave])

  // ── CV updaters ───────────────────────────────────────────────────────────
  const updateName = (name: string) => { const u = { ...cv!, name }; setCV(u); scheduleSave(u) }
  const updateEmail = (email: string) => { const u = { ...cv!, email }; setCV(u); scheduleSave(u) }
  const updatePhone = (phone: string) => { const u = { ...cv!, phone }; setCV(u); scheduleSave(u) }
  const updateLocation = (location: string) => { const u = { ...cv!, location }; setCV(u); scheduleSave(u) }
  const updateLinkedIn = (linkedin: string) => { const u = { ...cv!, linkedin }; setCV(u); scheduleSave(u) }
  const updateSummary = (summary: string) => { const u = { ...cv!, summary }; setCV(u); scheduleSave(u) }
  const updateRole = (index: number, role: ExperienceRole) => {
    const experience = [...(cv?.experience ?? [])]; experience[index] = role
    const u = { ...cv!, experience }; setCV(u); scheduleSave(u)
  }
  const updateSkills = (skills: string[]) => {
    const u = { ...cv!, skills }; setCV(u); scheduleSave(u)
  }
  const updateEducation = (index: number, edu: EducationEntry) => {
    const education = [...(cv?.education ?? [])]; education[index] = edu
    const u = { ...cv!, education }; setCV(u); scheduleSave(u)
  }
  const addRole = () => {
    const experience = [...(cv?.experience ?? []), { company: '', title: '', start: '', end: null, bullets: [''] }]
    const u = { ...cv!, experience }; setCV(u); scheduleSave(u)
  }
  const addEducation = () => {
    const education = [...(cv?.education ?? []), { institution: '', qualification: '', year: '' }]
    const u = { ...cv!, education }; setCV(u); scheduleSave(u)
  }
  const updateCerts = (raw: string) => {
    const certifications = raw.split('\n').map((s) => s.trim()).filter(Boolean)
    const u = { ...cv!, certifications }; setCV(u); scheduleSave(u)
  }

  // ── Loading ───────────────────────────────────────────────────────────────
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

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !result || !cv) {
    return (
      <main className="min-h-screen bg-[#FFF7F2] flex flex-col">
        <Header isSignedIn />
        <div className="max-w-xl mx-auto px-4 py-16 w-full">
          <AlertBanner type="error" message={error || 'Could not load your score. Please try again.'} />
          <div className="mt-6">
            <Button variant="primary" onClick={() => router.replace('/upload')}>Start again</Button>
          </div>
        </div>
      </main>
    )
  }

  // ── Critical banners ──────────────────────────────────────────────────────
  const criticalConcerns = result.criticalConcerns ?? []

  // ── Shared panel props ────────────────────────────────────────────────────
  const scorePanelProps = {
    result,
    initialScore,
    isRescoring,
    onRescore: handleRescore,
    cvId: cvId ?? 'demo',
    showPassBanner,
    onDismissPassBanner: () => setShowPassBanner(false),
    noChangeFlash,
    newlyResolvedIds,
    availableFixes,
    onApplyFix: handleApplyFix,
    fixNoChangeFeedback,
    isDemo,
    onSwitchToEdit: () => {
      track('fix_in_editor_clicked', { cv_id: cvId, score: result?.overallScore })
      if (window.innerWidth >= 768) {
        // Desktop: editor panel is always visible — scroll it into view then focus first input
        const panel = document.getElementById('desktop-editor-panel')
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
          // Focus the first editable field after the scroll animation settles
          setTimeout(() => {
            const firstInput = panel.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
            firstInput?.focus()
          }, 400)
        }
      } else {
        // Mobile: switch to the edit tab
        setActiveTab('edit')
      }
    },
  }

  const editorPanelProps = {
    cv,
    saveStatus,
    onNameChange: updateName,
    onEmailChange: updateEmail,
    onPhoneChange: updatePhone,
    onLocationChange: updateLocation,
    onLinkedInChange: updateLinkedIn,
    onSummaryChange: updateSummary,
    onRoleChange: updateRole,
    onSkillsChange: updateSkills,
    onEducationChange: updateEducation,
    onCertsChange: updateCerts,
    onAddRole: addRole,
    onAddEducation: addEducation,
    cvId: cvId!,
  } as const

  const ringColor = result.passFail ? '#16A34A' : result.overallScore >= 50 ? '#D97706' : '#DC2626'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#FFF7F2] pb-20 lg:pb-0">
      <Header isSignedIn={!isDemo} />

      {/* ── Demo banner ── */}
      {isDemo && (
        <div className="sticky top-0 z-30 bg-[#FF6B00] text-white px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm font-medium">
              👀 This is a demo score for an anonymised CV. Sign in to score your own.
            </p>
            <Link
              href="/upload"
              className="flex-shrink-0 bg-white text-[#FF6B00] text-sm font-semibold px-4 py-1.5 rounded-full hover:bg-[#FFF7F2] transition-colors"
            >
              Score my CV →
            </Link>
          </div>
        </div>
      )}

      {/* ── Mobile tab bar ── */}
      <div className={`md:hidden sticky z-20 bg-white border-b border-[#DDDDDD] ${isDemo ? 'top-[52px]' : 'top-0'}`}>
        <div className="max-w-7xl mx-auto px-4 flex">
          <button
            onClick={() => setActiveTab('score')}
            className={`flex-1 py-3.5 text-sm font-semibold text-center border-b-2 transition-colors ${activeTab === 'score' ? 'border-[#FF6B00] text-[#FF6B00]' : 'border-transparent text-[#999999]'}`}
          >
            Score &amp; Checklist
          </button>
          <button
            onClick={() => setActiveTab('edit')}
            className={`flex-1 py-3.5 text-sm font-semibold text-center border-b-2 transition-colors ${activeTab === 'edit' ? 'border-[#FF6B00] text-[#FF6B00]' : 'border-transparent text-[#999999]'}`}
          >
            Edit CV
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Critical banners — collapsed into single banner regardless of count */}
        {criticalConcerns.length > 0 && (
          <div className="mb-5">
            <CriticalBannersBlock concerns={criticalConcerns} />
          </div>
        )}

        {/* ── Mobile: single active tab ── */}
        <div className="md:hidden">
          {activeTab === 'score' ? (
            <>
              <ScorePanel {...scorePanelProps} hideMobileRescore />
              {/* Demo-only nudge: point users toward the Edit CV tab */}
              {isDemo && (
                <div className="mt-3 rounded-[8px] bg-[#FFF3E8] border border-[#FFD4A8] px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-[#CC5500] font-medium leading-snug">
                    See the gaps? Fix them in the CV editor.
                  </p>
                  <button
                    onClick={() => setActiveTab('edit')}
                    className="text-xs font-semibold text-white bg-[#FF6B00] hover:bg-[#E05A00] rounded-[6px] px-3 py-1.5 transition-colors cursor-pointer flex-shrink-0"
                  >
                    Edit CV →
                  </button>
                </div>
              )}
            </>
          ) : (
            <EditorPanel {...editorPanelProps} />
          )}
        </div>

        {/* ── Desktop: two-panel layout ── */}
        <div className="hidden md:flex gap-6 items-start">
          <div className="w-80 xl:w-96 flex-shrink-0 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <ScorePanel {...scorePanelProps} />
          </div>
          <div id="desktop-editor-panel" className="flex-1 min-w-0">
            <EditorPanel {...editorPanelProps} />
          </div>
        </div>
      </div>

      {/* ── Mobile sticky bottom bar ── */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#DDDDDD] px-4 py-2.5 flex items-center gap-3 z-30"
        style={{ boxShadow: '0 -2px 12px rgba(0,0,0,0.08)' }}
      >
        <div
          className="w-10 h-10 rounded-full border-[3px] flex items-center justify-center text-sm font-bold text-[#222222] flex-shrink-0"
          style={{ borderColor: ringColor }}
        >
          {result.overallScore}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: ringColor }}>
            {result.passFail ? '✓ Recruiter-ready' : '✕ Needs work'}
          </p>
          <p className="text-[10px] text-[#999999] truncate">{ROLE_LABELS[result.targetRole]}</p>
        </div>
        <Button variant="primary" size="sm" onClick={handleRescore} disabled={isRescoring} className="flex-shrink-0">
          {isDemo ? 'Sign in →' : isRescoring ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Scoring…
            </span>
          ) : 'Re-score →'}
        </Button>
      </div>

    </main>
  )
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function ScorePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FFF7F2] flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <ScorePageContent />
    </Suspense>
  )
}
