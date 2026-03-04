'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import PaywallModal from '@/components/PaywallModal'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABELS } from '@/lib/roleDetect'
import type { StructuredCV, ExperienceRole, EducationEntry } from '@/types/database'
import type { ScoreResult } from '@/lib/scorer'
import { detectAvailableFixes, applyFix } from '@/lib/cvFixes'
import type { AvailableFix } from '@/lib/cvFixes'

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUCKET_CONFIG = [
  { key: 'proofOfImpact' as const, label: 'Proof of impact',     max: 35 },
  { key: 'atsKeywords'   as const, label: 'ATS & keywords',      max: 25 },
  { key: 'formatting'    as const, label: 'Formatting',           max: 20 },
  { key: 'clarity'       as const, label: 'Clarity & structure',  max: 20 },
]

const CATEGORY_LABELS: Record<string, string> = {
  critical:   'Critical concerns',
  impact:     'Proof of impact',
  ats:        'ATS & keywords',
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

function ChecklistItemRow({ item }: { item: ScoreResult['checklist'][0] }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`border-b border-[#F0F0F0] last:border-0 ${item.done ? 'opacity-60' : ''}`}>
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
}: {
  category: string
  items: ScoreResult['checklist']
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
            <ChecklistItemRow key={item.id} item={item} />
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

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => { onChange(e.target.value); autoResize(e.target) }}
      className={[
        'w-full text-sm text-[#222222] border border-transparent rounded-[4px] px-2 py-1',
        'hover:border-[#DDDDDD] focus:border-[#FF6B00] focus:outline-none',
        'resize-none transition-colors bg-transparent focus:bg-white',
        className,
      ].join(' ')}
    />
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
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'text-sm border border-transparent rounded-[4px] px-2 py-0.5',
        'hover:border-[#DDDDDD] focus:border-[#FF6B00] focus:outline-none',
        'transition-colors bg-transparent focus:bg-white w-full',
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
          <span className="text-[#BBBBBB] text-xs">·</span>
          <EditableInput value={role.start} onChange={(v) => onChange({ ...role, start: v })} placeholder="Start" className="text-[#555555] w-24" />
          <span className="text-[#BBBBBB] text-xs">–</span>
          <EditableInput value={role.end ?? 'Present'} onChange={(v) => onChange({ ...role, end: v || null })} placeholder="End / Present" className="text-[#555555] w-24" />
        </div>
      </div>
      <div className="space-y-1.5">
        {role.bullets.map((bullet, bi) => (
          <div key={bi} className="flex items-start gap-1.5 group">
            <span className="text-[#FF6B00] mt-1.5 flex-shrink-0 text-sm">•</span>
            <EditableText value={bullet} onChange={(v) => updateBullet(bi, v)} placeholder="Add a bullet point…" className="flex-1" />
            {role.bullets.length > 1 && (
              <button onClick={() => removeBullet(bi)} className="opacity-0 group-hover:opacity-100 text-[#BBBBBB] hover:text-[#DC2626] transition-all text-sm flex-shrink-0 mt-1 cursor-pointer" title="Remove">×</button>
            )}
          </div>
        ))}
      </div>
      <button onClick={addBullet} className="mt-3 text-xs text-[#FF6B00] hover:text-[#E85F00] transition-colors cursor-pointer flex items-center gap-1">+ Add bullet</button>
    </div>
  )
}

// ── Quick fixes panel ─────────────────────────────────────────────────────────

function QuickFixesPanel({ fixes, onApply }: { fixes: AvailableFix[]; onApply: (id: AvailableFix['id']) => void }) {
  if (fixes.length === 0) return null
  return (
    <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h3 className="text-[13px] font-semibold text-[#222222] mb-1">Quick fixes</h3>
      <p className="text-[11px] text-[#888888] mb-3">One click. Re-score to see impact.</p>
      <div className="space-y-2">
        {fixes.map((fix) => (
          <div key={fix.id} className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#333333] leading-snug">{fix.label}</p>
              <p className="text-[10px] text-[#888888] mt-0.5">{fix.description}</p>
            </div>
            <button onClick={() => onApply(fix.id)} className="text-[11px] font-semibold text-[#FF6B00] hover:text-[#E85F00] border border-[#FF6B00] hover:border-[#E85F00] rounded-[4px] px-2 py-0.5 flex-shrink-0 transition-colors cursor-pointer whitespace-nowrap">Apply</button>
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
}: {
  result: ScoreResult
  initialScore: number
  isRescoring: boolean
  onRescore: () => void
  cvId: string
}) {
  const [keywordsOpen, setKeywordsOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const { overallScore, passFail, criticalConcerns, buckets, checklist, targetRole, keywordData } = result

  const improved = initialScore !== overallScore
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
      {/* Score hero */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {/* Ring + badge */}
        <div className="flex flex-col items-center gap-3 mb-4">
          <ScoreRing score={overallScore} pass={passFail} />
          <div className="flex flex-col items-center gap-1.5">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${passFail ? 'bg-green-100 text-[#16A34A]' : 'bg-red-100 text-[#DC2626]'}`}>
              {passFail ? '✓ Recruiter-ready' : '✕ Needs work'}
            </span>
            <p className="text-xs text-[#666666]">
              Scored for <span className="font-semibold text-[#222222]">{ROLE_LABELS[targetRole]}</span>
            </p>
            {improved && (
              <p className="text-xs font-semibold text-[#FF6B00]">{initialScore} → {overallScore}</p>
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

        {/* Re-score button */}
        <Button variant="primary" size="md" className="w-full justify-center" onClick={onRescore} disabled={isRescoring}>
          {isRescoring ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Scoring…
            </span>
          ) : 'Re-score →'}
        </Button>
        <p className="text-[10px] text-[#BBBBBB] text-center mt-1.5">Saves automatically before re-scoring</p>
      </div>

      {/* Checklist */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] overflow-hidden mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="px-4 py-3 border-b border-[#EEEEEE] flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[#222222]">Checklist</h3>
          <span className="text-[11px] text-[#999999]">{doneItems}/{totalItems}</span>
        </div>
        {categories.map(({ category, items }) => (
          <ChecklistCategory key={category} category={category} items={items} />
        ))}
      </div>

      {/* Keywords (collapsible) */}
      {keywordData && (
        <div className="bg-white rounded-[8px] border border-[#DDDDDD] overflow-hidden mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <button onClick={() => setKeywordsOpen((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#FAFAFA] transition-colors">
            <span className="text-[13px] font-semibold text-[#222222]">Keywords</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#999999]">{keywordData.matched.length}/{keywordData.total}</span>
              <span className="text-[#BBBBBB] text-[10px]">{keywordsOpen ? '▲' : '▼'}</span>
            </div>
          </button>
          {keywordsOpen && (
            <div className="px-4 pb-4">
              {keywordData.matched.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-[#16A34A] uppercase tracking-wide mb-1.5">Present</p>
                  <div className="flex flex-wrap gap-1">
                    {keywordData.matched.map((kw) => (
                      <span key={kw} className="text-[11px] bg-green-50 text-[#16A34A] border border-green-200 rounded-full px-2 py-0.5">{kw}</span>
                    ))}
                  </div>
                </div>
              )}
              {keywordData.missing.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-[#DC2626] uppercase tracking-wide mb-1.5">Missing</p>
                  <div className="flex flex-wrap gap-1">
                    {keywordData.missing.slice(0, 12).map((kw) => (
                      <span key={kw} className="text-[11px] bg-[#F8F8F8] text-[#888888] border border-[#E0E0E0] rounded-full px-2 py-0.5">{kw}</span>
                    ))}
                    {keywordData.missing.length > 12 && (
                      <span className="text-[11px] text-[#BBBBBB] self-center">+{keywordData.missing.length - 12} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Share (collapsible) */}
      <div className="bg-white rounded-[8px] border border-[#DDDDDD] overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {!shareUrl ? (
          <button
            onClick={async () => {
              if (shareOpen) { setShareOpen(false); return }
              setShareLoading(true)
              setShareError(null)
              try {
                const res = await fetch(`/api/cv/${cvId}/share`, { method: 'POST' })
                const data = await res.json()
                if (!res.ok || !data.ok) setShareError(data.error || 'Could not create link')
                else setShareUrl(data.shareUrl)
              } catch { setShareError('Network error') }
              setShareLoading(false)
            }}
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
  availableFixes,
  onSummaryChange,
  onRoleChange,
  onSkillsChange,
  onEducationChange,
  onCertsChange,
  onApplyFix,
  cvId,
}: {
  cv: StructuredCV
  saveStatus: SaveStatus
  availableFixes: AvailableFix[]
  onSummaryChange: (v: string) => void
  onRoleChange: (i: number, r: ExperienceRole) => void
  onSkillsChange: (raw: string) => void
  onEducationChange: (i: number, e: EducationEntry) => void
  onCertsChange: (raw: string) => void
  onApplyFix: (id: AvailableFix['id']) => void
  cvId: string
}) {
  const router = useRouter()
  const placeholders = countPlaceholders(cv)

  return (
    <div className="space-y-4">
      {/* Progress + save */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <ProgressIndicator currentStep="score" />
        </div>
        <SaveBadge status={saveStatus} />
      </div>

      {/* Placeholder reminder */}
      {placeholders > 0 && <PlaceholderReminder count={placeholders} />}

      {/* Quick fixes */}
      <QuickFixesPanel fixes={availableFixes} onApply={onApplyFix} />

      {/* Summary */}
      {cv.summary !== undefined && (
        <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Summary</h2>
          <EditableText value={cv.summary} onChange={onSummaryChange} placeholder="Write a 2–3 sentence professional summary targeting your chosen role…" rows={3} />
        </div>
      )}

      {/* Experience */}
      {cv.experience?.length > 0 && (
        <div>
          <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide px-1 mb-3">Experience</h2>
          <div className="space-y-4">
            {cv.experience.map((role, i) => (
              <RoleCard key={i} role={role} index={i} onChange={(updated) => onRoleChange(i, updated)} />
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {cv.skills !== undefined && (
        <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Skills</h2>
          <EditableText value={cv.skills.join(', ')} onChange={onSkillsChange} placeholder="Salesforce, HubSpot, Gainsight…" rows={2} />
          <p className="text-[10px] text-[#BBBBBB] mt-1.5">Comma-separated. Used in ATS keyword matching.</p>
        </div>
      )}

      {/* Education */}
      {cv.education?.length > 0 && (
        <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Education</h2>
          <div className="space-y-3">
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
        </div>
      )}

      {/* Certifications */}
      {cv.certifications?.length > 0 && (
        <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Certifications</h2>
          <EditableText value={cv.certifications.join('\n')} onChange={onCertsChange} placeholder="One certification per line…" rows={2} />
        </div>
      )}

      {/* Export CTA */}
      <div className="pt-2">
        <Button variant="secondary" size="md" className="w-full justify-center" onClick={() => router.push(`/export?cvId=${cvId}`)}>
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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cv, setCV] = useState<StructuredCV | null>(null)
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [initialScore, setInitialScore] = useState<number>(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isRescoring, setIsRescoring] = useState(false)
  const [availableFixes, setAvailableFixes] = useState<AvailableFix[]>([])
  const [paywallOpen, setPaywallOpen] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestCV = useRef<StructuredCV | null>(null)

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cvId) { router.replace('/upload'); return }

    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/upload'); return }

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
        setInitialScore(scoreResult.overallScore)
      } catch {
        setError('Network error — please check your connection and try again.')
      }

      setLoading(false)
    }

    load()
  }, [cvId, router])

  // ── Available fixes ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cv) setAvailableFixes(detectAvailableFixes(cv))
  }, [cv])

  // ── Debounced save ────────────────────────────────────────────────────────
  const scheduleSave = useCallback((updated: StructuredCV) => {
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
    if (!cvId || isRescoring) return
    setIsRescoring(true)
    await flushSave()
    try {
      const res = await fetch(`/api/cv/${cvId}/score`, {
        method: 'POST',
        headers: { 'x-force-rescore': 'true' },
      })
      if (res.status === 402) {
        setPaywallOpen(true)
        setIsRescoring(false)
        return
      }
      if (!res.ok) { setIsRescoring(false); return }
      const data = await res.json() as { result: ScoreResult }
      setResult(data.result)
    } catch {
      // fail silently — score stays as-is
    } finally {
      setIsRescoring(false)
    }
  }, [cvId, isRescoring, flushSave])

  // ── Apply fix ─────────────────────────────────────────────────────────────
  const handleApplyFix = useCallback((fixId: AvailableFix['id']) => {
    const current = latestCV.current
    if (!current) return
    const updated = applyFix(current, fixId)
    latestCV.current = updated
    setCV(updated)
    scheduleSave(updated)
  }, [scheduleSave])

  // ── CV updaters ───────────────────────────────────────────────────────────
  const updateSummary = (summary: string) => { const u = { ...cv!, summary }; setCV(u); scheduleSave(u) }
  const updateRole = (index: number, role: ExperienceRole) => {
    const experience = [...(cv?.experience ?? [])]; experience[index] = role
    const u = { ...cv!, experience }; setCV(u); scheduleSave(u)
  }
  const updateSkills = (raw: string) => {
    const skills = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
    const u = { ...cv!, skills }; setCV(u); scheduleSave(u)
  }
  const updateEducation = (index: number, edu: EducationEntry) => {
    const education = [...(cv?.education ?? [])]; education[index] = edu
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Critical banners */}
        {criticalConcerns.length > 0 && (
          <div className="mb-5 flex flex-col gap-2">
            {criticalConcerns.map((concern, i) => (
              <AlertBanner key={i} type="error" message={`Critical: ${concern}`} />
            ))}
          </div>
        )}

        {/* Two-panel layout */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left: score panel */}
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <ScorePanel
              result={result}
              initialScore={initialScore}
              isRescoring={isRescoring}
              onRescore={handleRescore}
              cvId={cvId!}
            />
          </div>

          {/* Right: editor panel */}
          <div className="flex-1 min-w-0">
            <EditorPanel
              cv={cv}
              saveStatus={saveStatus}
              availableFixes={availableFixes}
              onSummaryChange={updateSummary}
              onRoleChange={updateRole}
              onSkillsChange={updateSkills}
              onEducationChange={updateEducation}
              onCertsChange={updateCerts}
              onApplyFix={handleApplyFix}
              cvId={cvId!}
            />
          </div>
        </div>
      </div>

      <PaywallModal isOpen={paywallOpen} onClose={() => setPaywallOpen(false)} action="rescore" />
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
