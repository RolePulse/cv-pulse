'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import AlertBanner from '@/components/AlertBanner'
import Button from '@/components/Button'
import { createClient } from '@/lib/supabase/client'
import {
  ALL_ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  detectRole,
  type TargetRole,
} from '@/lib/roleDetect'

// ── Inner component (reads search params) ──────────────────────────────────

function SelectRoleContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cvId = searchParams.get('cvId')

  const [selectedRole, setSelectedRole] = useState<TargetRole | null>(null)
  const [suggestedRole, setSuggestedRole] = useState<TargetRole | null>(null)
  const [mismatchDismissed, setMismatchDismissed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Auth + data fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (!cvId) {
      router.replace('/upload')
      return
    }

    async function load() {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/upload')
        return
      }

      const { data: cv } = await supabase
        .from('cvs')
        .select('structured_json, target_role')
        .eq('id', cvId)
        .eq('user_id', user.id)
        .single()

      if (!cv) {
        router.replace('/upload')
        return
      }

      // If role already set (e.g. page refresh), pre-select it
      if (cv.target_role) {
        setSelectedRole(cv.target_role as TargetRole)
      }

      if (cv.structured_json) {
        const detected = detectRole(cv.structured_json as Record<string, unknown>)
        setSuggestedRole(detected)
      }

      setIsLoading(false)
    }

    load()
  }, [cvId, router])

  // ── Mismatch state ───────────────────────────────────────────────────────
  const hasMismatch =
    selectedRole !== null &&
    suggestedRole !== null &&
    selectedRole !== suggestedRole &&
    !mismatchDismissed

  const canContinue =
    selectedRole !== null &&
    !hasMismatch &&
    !isSaving

  // Reset mismatch dismissed when role changes
  const handleRoleSelect = (role: TargetRole) => {
    setSelectedRole(role)
    setMismatchDismissed(false)
    setError(null)
  }

  // ── Continue handler ─────────────────────────────────────────────────────
  const handleContinue = async () => {
    if (!selectedRole || !cvId) return

    setIsSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/cv/${cvId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole: selectedRole }),
      })

      if (res.status === 401) {
        router.replace('/upload')
        return
      }

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setError(data.error || 'Something went wrong — please try again.')
        setIsSaving(false)
        return
      }

      router.push(`/score?cvId=${cvId}`)
    } catch {
      setError('Network error — please check your connection and try again.')
      setIsSaving(false)
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#FFF7F2] flex flex-col">
        <Header isSignedIn />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#666666]">Loading your CV…</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#FFF7F2] flex flex-col">
      <Header isSignedIn />

      <div className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-8">
        {/* Progress */}
        <ProgressIndicator currentStep="upload" />

        {/* Heading */}
        <div className="text-center flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-[#222222]">What role are you targeting?</h1>
          <p className="text-[#555555] text-sm leading-relaxed">
            We&apos;ll score your CV for this specific role. Pick the one you&apos;re applying for.
          </p>
        </div>

        {/* Mismatch warning */}
        {hasMismatch && selectedRole && suggestedRole && (
          <AlertBanner
            type="warning"
            message={`Your CV looks more like ${ROLE_LABELS[suggestedRole]} than ${ROLE_LABELS[selectedRole]}. Still want to target ${ROLE_LABELS[selectedRole]}? That's fine — just make sure your CV reflects that role.`}
            onDismiss={() => setMismatchDismissed(true)}
          />
        )}

        {/* Error */}
        {error && (
          <AlertBanner type="error" message={error} onDismiss={() => setError(null)} />
        )}

        {/* Role cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {ALL_ROLES.map((role) => {
            const isSelected = selectedRole === role
            const isSuggested = suggestedRole === role && selectedRole === null

            return (
              <button
                key={role}
                onClick={() => handleRoleSelect(role)}
                className={[
                  'rounded-lg border-2 p-4 text-left flex flex-col gap-2 transition-all cursor-pointer',
                  isSelected
                    ? 'border-[#FF6B00] bg-[#FFF0E8]'
                    : isSuggested
                    ? 'border-[#FF6B00]/40 bg-white'
                    : 'border-[#E8E0D8] bg-white hover:border-[#FF6B00]/40 hover:bg-[#FFF7F2]',
                ].join(' ')}
                aria-pressed={isSelected}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#222222] text-sm leading-tight">
                    {ROLE_LABELS[role]}
                  </span>
                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-[#FF6B00] flex items-center justify-center flex-shrink-0">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M1.5 5L4 7.5L8.5 3"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                  {isSuggested && !isSelected && (
                    <span className="text-[10px] font-semibold text-[#FF6B00] bg-[#FFF0E8] px-1.5 py-0.5 rounded-full flex-shrink-0">
                      suggested
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#777777] leading-snug">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </button>
            )
          })}
        </div>

        {/* Continue */}
        <div className="flex flex-col gap-3 pt-2">
          <Button
            variant="primary"
            size="lg"
            disabled={!canContinue}
            loading={isSaving}
            onClick={handleContinue}
            className="w-full sm:w-auto sm:self-end"
          >
            {isSaving ? 'Saving…' : 'Continue →'}
          </Button>
          {selectedRole === null && (
            <p className="text-xs text-[#999999] text-center sm:text-right">
              Select a role above to continue
            </p>
          )}
          {hasMismatch && (
            <p className="text-xs text-amber-700 text-center sm:text-right">
              Acknowledge the warning above to continue
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

// ── Page export (wraps in Suspense for useSearchParams) ────────────────────

export default function SelectRolePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FFF7F2] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <SelectRoleContent />
    </Suspense>
  )
}
