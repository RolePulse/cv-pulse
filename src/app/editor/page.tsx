'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import { createClient } from '@/lib/supabase/client'
import type { StructuredCV, ExperienceRole, EducationEntry } from '@/types/database'
import type { ScoreResult } from '@/lib/scorer'
import { detectAvailableFixes, applyFix } from '@/lib/cvFixes'
import type { AvailableFix } from '@/lib/cvFixes'
import PaywallModal from '@/components/PaywallModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface ChecklistItem {
  id: string
  category: string
  action: string
  potentialPoints: number
  done: boolean
}

// ── Auto-resize textarea helper ───────────────────────────────────────────────

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

  useEffect(() => {
    if (ref.current) autoResize(ref.current)
  }, [value])

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
  index,
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
    const bullets = role.bullets.filter((_, i) => i !== bi)
    onChange({ ...role, bullets })
  }

  return (
    <div
      className="bg-white rounded-[8px] border border-[#DDDDDD] p-5"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      {/* Role header */}
      <div className="mb-4 space-y-1">
        <EditableInput
          value={role.title}
          onChange={(v) => onChange({ ...role, title: v })}
          placeholder="Job title"
          className="font-semibold text-[#222222] text-[15px]"
        />
        <div className="flex items-center gap-1 flex-wrap">
          <EditableInput
            value={role.company}
            onChange={(v) => onChange({ ...role, company: v })}
            placeholder="Company"
            className="text-[#555555]"
          />
          <span className="text-[#BBBBBB] text-xs">·</span>
          <EditableInput
            value={role.start}
            onChange={(v) => onChange({ ...role, start: v })}
            placeholder="Start date"
            className="text-[#555555] w-24"
          />
          <span className="text-[#BBBBBB] text-xs">–</span>
          <EditableInput
            value={role.end ?? 'Present'}
            onChange={(v) => onChange({ ...role, end: v || null })}
            placeholder="End / Present"
            className="text-[#555555] w-24"
          />
        </div>
      </div>

      {/* Bullets */}
      <div className="space-y-1.5">
        {role.bullets.map((bullet, bi) => (
          <div key={bi} className="flex items-start gap-1.5 group">
            <span className="text-[#FF6B00] mt-1.5 flex-shrink-0 text-sm">•</span>
            <EditableText
              value={bullet}
              onChange={(v) => updateBullet(bi, v)}
              placeholder="Add a bullet point..."
              className="flex-1"
            />
            {role.bullets.length > 1 && (
              <button
                onClick={() => removeBullet(bi)}
                className="opacity-0 group-hover:opacity-100 text-[#BBBBBB] hover:text-[#DC2626] transition-all text-sm flex-shrink-0 mt-1 cursor-pointer"
                title="Remove bullet"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addBullet}
        className="mt-3 text-xs text-[#FF6B00] hover:text-[#E85F00] transition-colors cursor-pointer flex items-center gap-1"
      >
        + Add bullet
      </button>
    </div>
  )
}

// ── Score history strip ───────────────────────────────────────────────────────

function ScoreHistoryStrip({
  initialScore,
  currentScore,
  resolvedCount,
  totalItems,
  lastEdited,
  passFail,
}: {
  initialScore: number | null
  currentScore: number | null
  resolvedCount: number
  totalItems: number
  lastEdited: string | null
  passFail: boolean | null
}) {
  if (currentScore === null) return null

  const improved = initialScore !== null && initialScore !== currentScore
  const editedTime = lastEdited
    ? new Date(lastEdited).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="bg-[#F9F4F0] rounded-[6px] px-4 py-3 mb-4 space-y-2 text-xs">
      {/* Score trend */}
      <div className="flex items-center justify-between">
        <span className="text-[#888888]">Score</span>
        <span className="font-semibold text-[#222222]">
          {improved ? `${initialScore} → ${currentScore}` : `${currentScore}`}
          <span className="font-normal text-[#999999]">/100</span>
        </span>
      </div>

      {/* Items resolved */}
      {totalItems > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[#888888]">Fixed</span>
          <span className={resolvedCount > 0 ? 'font-medium text-[#16A34A]' : 'text-[#AAAAAA]'}>
            {resolvedCount} of {totalItems}
          </span>
        </div>
      )}

      {/* Pass/fail badge */}
      <div className="flex items-center justify-between">
        <span className="text-[#888888]">Status</span>
        <span className={[
          'font-semibold px-2 py-0.5 rounded-full',
          passFail ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600',
        ].join(' ')}>
          {passFail ? 'Pass ✓' : 'Needs work'}
        </span>
      </div>

      {/* Last edited */}
      {editedTime && (
        <div className="flex items-center justify-between">
          <span className="text-[#888888]">Saved</span>
          <span className="text-[#AAAAAA]">{editedTime}</span>
        </div>
      )}
    </div>
  )
}

// ── Quick fixes panel ─────────────────────────────────────────────────────────

function QuickFixesPanel({
  fixes,
  onApply,
}: {
  fixes: AvailableFix[]
  onApply: (fixId: AvailableFix['id']) => void
}) {
  if (fixes.length === 0) return null

  return (
    <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5 mt-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h3 className="text-[13px] font-semibold text-[#222222] mb-1">Quick fixes</h3>
      <p className="text-[11px] text-[#888888] mb-3">One click — applies immediately. Re-score to see impact.</p>
      <div className="space-y-2">
        {fixes.map((fix) => (
          <div key={fix.id} className="flex items-start gap-3 group">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#333333] leading-snug">{fix.label}</p>
              <p className="text-[10px] text-[#888888] leading-snug mt-0.5">{fix.description}</p>
            </div>
            <button
              onClick={() => onApply(fix.id)}
              className="text-[11px] font-semibold text-[#FF6B00] hover:text-[#E85F00] border border-[#FF6B00] hover:border-[#E85F00] rounded-[4px] px-2 py-0.5 flex-shrink-0 transition-colors cursor-pointer whitespace-nowrap"
            >
              Apply
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Checklist sidebar ─────────────────────────────────────────────────────────

function ChecklistSidebar({
  items,
  score,
  onRescore,
  isRescoring,
  initialScore,
  resolvedCount,
  totalItems,
  lastEdited,
  passFail,
}: {
  items: ChecklistItem[]
  score: number | null
  onRescore: () => void
  isRescoring: boolean
  initialScore: number | null
  resolvedCount: number
  totalItems: number
  lastEdited: string | null
  passFail: boolean | null
}) {
  const todo = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)

  return (
    <div
      className="bg-white rounded-[8px] border border-[#DDDDDD] p-5 sticky top-20"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      {/* Score history strip */}
      <ScoreHistoryStrip
        initialScore={initialScore}
        currentScore={score}
        resolvedCount={resolvedCount}
        totalItems={totalItems}
        lastEdited={lastEdited}
        passFail={passFail}
      />

      <h3 className="text-[13px] font-semibold text-[#222222] mb-3">
        Fixes remaining ({todo.length})
      </h3>

      <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
        {todo.slice(0, 8).map((item) => (
          <div key={item.id} className="flex items-start gap-2">
            <span className={[
              'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5',
              item.category === 'critical' ? 'border-[#DC2626]' : 'border-[#DDDDDD]',
            ].join(' ')} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#444444] leading-snug">{item.action}</p>
              {item.potentialPoints > 0 && (
                <span className="text-[10px] text-[#FF6B00] font-medium">up to +{item.potentialPoints} pts</span>
              )}
            </div>
          </div>
        ))}

        {done.slice(0, 3).map((item) => (
          <div key={item.id} className="flex items-start gap-2 opacity-50">
            <span className="w-4 h-4 rounded-full bg-green-500 flex-shrink-0 mt-0.5 flex items-center justify-center">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <p className="text-xs text-[#999999] line-through leading-snug">{item.action}</p>
          </div>
        ))}
      </div>

      <Button
        variant="primary"
        size="sm"
        className="w-full justify-center"
        onClick={onRescore}
        disabled={isRescoring}
      >
        {isRescoring ? (
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Scoring…
          </span>
        ) : 'Re-score →'}
      </Button>

      <p className="text-[10px] text-[#BBBBBB] text-center mt-2">Saves automatically before re-scoring</p>
    </div>
  )
}

// ── Save indicator ────────────────────────────────────────────────────────────

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  const config = {
    saving: { text: 'Saving…', color: 'text-[#999999]' },
    saved:  { text: 'Saved ✓',  color: 'text-[#16A34A]' },
    error:  { text: 'Save failed', color: 'text-[#DC2626]' },
  }
  const { text, color } = config[status]
  return <span className={`text-xs font-medium ${color}`}>{text}</span>
}

// ── Main editor ───────────────────────────────────────────────────────────────

function EditorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cvId = searchParams.get('cvId')

  const [cv, setCV] = useState<StructuredCV | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [score, setScore] = useState<number | null>(null)
  const [passFail, setPassFail] = useState<boolean | null>(null)
  const [isRescoring, setIsRescoring] = useState(false)
  const [initialScore, setInitialScore] = useState<number | null>(null)
  const [resolvedCount, setResolvedCount] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [lastEdited, setLastEdited] = useState<string | null>(null)
  const [availableFixes, setAvailableFixes] = useState<AvailableFix[]>([])
  const [paywallOpen, setPaywallOpen] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestCV = useRef<StructuredCV | null>(null)

  // ── Load CV + checklist on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!cvId) { router.replace('/upload'); return }

    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/upload'); return }

      const [cvRes, scoreRes] = await Promise.all([
        fetch(`/api/cv/${cvId}`),
        fetch(`/api/cv/${cvId}/score`),
      ])

      if (!cvRes.ok) { setError('Could not load your CV — please go back.'); setLoading(false); return }

      const cvData = await cvRes.json()
      const structured = cvData.structured as StructuredCV

      setCV(structured)
      latestCV.current = structured

      if (scoreRes.ok) {
        const scoreData = await scoreRes.json()
        if (scoreData.hasScore) {
          setScore(scoreData.score.overallScore)
          setPassFail(scoreData.score.passFail ?? null)
          setChecklist(scoreData.score.checklist ?? [])
          setInitialScore(scoreData.initialScore ?? scoreData.score.overallScore)
          setResolvedCount(scoreData.resolvedCount ?? 0)
          setTotalItems(scoreData.totalItems ?? 0)
          setLastEdited(scoreData.lastEdited ?? null)
        }
      }

      setLoading(false)
    }

    load()
  }, [cvId, router])

  // ── Recompute available fixes whenever CV content changes ────────────────
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

  // ── Flush pending save immediately (used before re-score) ────────────────
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (!cvId || !latestCV.current) return true
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
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

  // ── In-editor re-score ────────────────────────────────────────────────────
  const handleRescore = useCallback(async () => {
    if (!cvId || isRescoring) return
    setIsRescoring(true)

    // Flush any pending auto-save before scoring
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

      const newChecklist: ChecklistItem[] = data.result.checklist.map((item) => ({
        id: item.id,
        category: item.category,
        action: item.action,
        potentialPoints: item.potentialPoints,
        done: item.done,
      }))

      const resolved = newChecklist.filter((i) => i.done).length

      setScore(data.result.overallScore)
      setPassFail(data.result.passFail)
      setChecklist(newChecklist)
      setResolvedCount(resolved)
      setTotalItems(newChecklist.length)
      setLastEdited(new Date().toISOString())
    } catch {
      // Fail silently — score stays as-is
    } finally {
      setIsRescoring(false)
    }
  }, [cvId, isRescoring, flushSave])

  // ── Apply one-click fix ───────────────────────────────────────────────────
  const handleApplyFix = useCallback((fixId: AvailableFix['id']) => {
    if (!cv) return
    const updated = applyFix(cv, fixId)
    setCV(updated)
    scheduleSave(updated)
    // Fixes list recomputes via the useEffect watching cv
  }, [cv, scheduleSave])

  // ── CV field updaters ─────────────────────────────────────────────────────
  const updateSummary = (summary: string) => {
    const updated = { ...cv!, summary }
    setCV(updated)
    scheduleSave(updated)
  }

  const updateRole = (index: number, role: ExperienceRole) => {
    const experience = [...(cv?.experience ?? [])]
    experience[index] = role
    const updated = { ...cv!, experience }
    setCV(updated)
    scheduleSave(updated)
  }

  const updateSkills = (raw: string) => {
    const skills = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
    const updated = { ...cv!, skills }
    setCV(updated)
    scheduleSave(updated)
  }

  const updateEducation = (index: number, edu: EducationEntry) => {
    const education = [...(cv?.education ?? [])]
    education[index] = edu
    const updated = { ...cv!, education }
    setCV(updated)
    scheduleSave(updated)
  }

  const updateCerts = (raw: string) => {
    const certifications = raw.split('\n').map((s) => s.trim()).filter(Boolean)
    const updated = { ...cv!, certifications }
    setCV(updated)
    scheduleSave(updated)
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF7F2] flex flex-col">
        <Header isSignedIn />
        <div className="flex-1 flex items-center justify-center gap-4 flex-col">
          <div className="w-8 h-8 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#555555]">Loading your CV…</p>
        </div>
      </main>
    )
  }

  if (error || !cv) {
    return (
      <main className="min-h-screen bg-[#FFF7F2] flex flex-col">
        <Header isSignedIn />
        <div className="max-w-xl mx-auto px-4 py-16 w-full">
          <AlertBanner type="error" message={error ?? 'Could not load CV.'} />
          <div className="mt-6"><Button variant="secondary" onClick={() => router.back()}>Go back</Button></div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Progress + save indicator */}
        <div className="mb-8 max-w-lg mx-auto flex flex-col items-center gap-2">
          <ProgressIndicator currentStep="edit" />
          <SaveBadge status={saveStatus} />
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          {/* ── Left: editor ───────────────────────────────────────────── */}
          <div className="flex-1 space-y-4 min-w-0">

            {/* Summary */}
            {(cv.summary !== undefined) && (
              <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Summary</h2>
                <EditableText
                  value={cv.summary}
                  onChange={updateSummary}
                  placeholder="Write a 2–3 sentence professional summary targeting your chosen role…"
                  rows={3}
                />
              </div>
            )}

            {/* Experience */}
            {cv.experience?.length > 0 && (
              <div>
                <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide px-1 mb-3">Experience</h2>
                <div className="space-y-4">
                  {cv.experience.map((role, i) => (
                    <RoleCard
                      key={i}
                      role={role}
                      index={i}
                      onChange={(updated) => updateRole(i, updated)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {cv.skills !== undefined && (
              <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Skills</h2>
                <EditableText
                  value={cv.skills.join(', ')}
                  onChange={updateSkills}
                  placeholder="Salesforce, HubSpot, Gainsight, Customer Success, Retention…"
                  rows={2}
                />
                <p className="text-[10px] text-[#BBBBBB] mt-1.5">Comma-separated. All skills are used in ATS keyword matching.</p>
              </div>
            )}

            {/* Education */}
            {cv.education?.length > 0 && (
              <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Education</h2>
                <div className="space-y-3">
                  {cv.education.map((edu, i) => (
                    <div key={i} className="flex flex-wrap gap-1 items-center">
                      <EditableInput
                        value={edu.qualification}
                        onChange={(v) => updateEducation(i, { ...edu, qualification: v })}
                        placeholder="Qualification"
                        className="font-medium text-[#222222]"
                      />
                      <span className="text-[#BBBBBB] text-xs">·</span>
                      <EditableInput
                        value={edu.institution}
                        onChange={(v) => updateEducation(i, { ...edu, institution: v })}
                        placeholder="Institution"
                        className="text-[#555555]"
                      />
                      <span className="text-[#BBBBBB] text-xs">·</span>
                      <EditableInput
                        value={edu.year}
                        onChange={(v) => updateEducation(i, { ...edu, year: v })}
                        placeholder="Year"
                        className="text-[#555555] w-16"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {cv.certifications?.length > 0 && (
              <div className="bg-white rounded-[8px] border border-[#DDDDDD] p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h2 className="text-[13px] font-semibold text-[#999999] uppercase tracking-wide mb-3">Certifications</h2>
                <EditableText
                  value={cv.certifications.join('\n')}
                  onChange={updateCerts}
                  placeholder="One certification per line…"
                  rows={2}
                />
              </div>
            )}

            {/* Bottom CTA */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="primary"
                size="md"
                className="flex-1 justify-center"
                onClick={handleRescore}
                disabled={isRescoring}
              >
                {isRescoring ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Scoring…
                  </span>
                ) : 'Re-score my CV →'}
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="flex-1 justify-center"
                onClick={() => router.push(`/export?cvId=${cvId}`)}
              >
                Export PDF →
              </Button>
            </div>
          </div>

          {/* ── Right: checklist + quick fixes ─────────────────────────── */}
          <div className="w-full lg:w-64 flex-shrink-0">
            {cvId && (
              <ChecklistSidebar
                items={checklist}
                score={score}
                onRescore={handleRescore}
                isRescoring={isRescoring}
                initialScore={initialScore}
                resolvedCount={resolvedCount}
                totalItems={totalItems}
                lastEdited={lastEdited}
                passFail={passFail}
              />
            )}
            <QuickFixesPanel
              fixes={availableFixes}
              onApply={handleApplyFix}
            />
          </div>
        </div>
      </div>

      <PaywallModal
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        action="rescore"
      />
    </main>
  )
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FFF7F2] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <EditorContent />
    </Suspense>
  )
}
