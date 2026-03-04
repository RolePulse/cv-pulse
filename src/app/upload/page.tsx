'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import { createClient } from '@/lib/supabase/client'
import { ALL_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type TargetRole } from '@/lib/roleDetect'

type UploadStep = 'idle' | 'parsing' | 'structuring' | 'validating' | 'ready' | 'failed' | 'gate_failed'

const STEP_LABELS: Record<UploadStep, string> = {
  idle: '',
  parsing: 'Parsing your PDF…',
  structuring: 'Structuring your CV…',
  validating: 'Validating quality…',
  ready: 'Ready — loading results…',
  failed: '',
  gate_failed: '',
}

const STEP_ORDER: UploadStep[] = ['parsing', 'structuring', 'validating', 'ready']

export default function UploadPage() {
  const router = useRouter()
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null) // null = loading
  const [signingIn, setSigningIn] = useState(false)
  const [deletedBanner, setDeletedBanner] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [step, setStep] = useState<UploadStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [gateReason, setGateReason] = useState<string | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsError, setTermsError] = useState(false)
  const [selectedRole, setSelectedRole] = useState<TargetRole | null>(null)

  // Check auth state on mount
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsSignedIn(!!user)
    })
  }, [])

  // Show banner when redirected after CV deletion
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('deleted') === 'cv') {
      setDeletedBanner(true)
      // Remove query param from URL so refresh does not re-show it
      window.history.replaceState({}, '', '/upload')
    }
  }, [])

  async function handleGoogleSignIn() {
    setSigningIn(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })
    // Page will redirect — no need to setSigningIn(false)
  }

  const hasContent = !!file || pasteText.trim().length > 100
  const canSubmit = hasContent && !!selectedRole
  const isProcessing = ['parsing', 'structuring', 'validating', 'ready'].includes(step)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === 'application/pdf') {
      setFile(dropped)
      setError(null)
      setGateReason(null)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected?.type === 'application/pdf') {
      setFile(selected)
      setError(null)
      setGateReason(null)
    }
  }

  // Run animation steps (purely visual — does not gate the result)
  async function animateSteps() {
    for (const s of STEP_ORDER.slice(0, 3)) {
      setStep(s)
      await sleep(700)
    }
  }

  // Perform the actual upload fetch and return a result object
  async function doUpload(): Promise<{ ok: boolean; cvId?: string; confidence?: number; failReason?: string; error?: string; _netError?: boolean; _authError?: boolean; _parseError?: boolean }> {
    let response: Response
    try {
      if (file) {
        const fd = new FormData()
        fd.append('cv', file)
        response = await fetch('/api/upload', { method: 'POST', body: fd })
      } else {
        response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: pasteText }),
        })
      }
    } catch {
      return { ok: false, _netError: true }
    }

    if (response.status === 401) return { ok: false, _authError: true }

    try {
      return await response.json()
    } catch {
      return { ok: false, _parseError: true }
    }
  }

  async function handleSubmit() {
    if (!canSubmit || isProcessing) return

    if (!termsAccepted) {
      setTermsError(true)
      return
    }

    setError(null)
    setGateReason(null)
    setTermsError(false)

    // Run animation and fetch in parallel — wait for BOTH before showing result.
    // This ensures the loading UI always completes its sequence (good UX) and the
    // result is always handled regardless of how long the fetch takes.
    const [data] = await Promise.all([doUpload(), animateSteps()])

    if (data._netError) {
      setStep('failed')
      setError('Network error — check your connection and try again.')
      return
    }
    if (data._authError) {
      setStep('failed')
      setError('You need to sign in before uploading your CV.')
      return
    }
    if (data._parseError) {
      setStep('failed')
      setError('Unexpected response from the server — please try again.')
      return
    }

    await handleResult(data)
  }

  async function handleResult(data: { ok: boolean; cvId?: string; failReason?: string; error?: string }) {
    if (!data.ok) {
      if (data.failReason) {
        // Confidence gate failure
        setStep('gate_failed')
        setGateReason(data.failReason)
      } else {
        setStep('failed')
        setError(data.error || 'Something went wrong — please try again.')
      }
      return
    }

    // Patch selected role before navigating
    if (selectedRole && data.cvId) {
      try {
        await fetch(`/api/cv/${data.cvId}/role`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetRole: selectedRole }),
        })
      } catch {
        // Non-fatal — score page will redirect to /select-role if role missing
      }
    }

    setStep('ready')
    router.push(selectedRole && data.cvId
      ? `/score?cvId=${data.cvId}`
      : `/select-role?cvId=${data.cvId}`)
  }

  function switchToPaste() {
    setShowPaste(true)
    setFile(null)
    setStep('idle')
    setError(null)
    setGateReason(null)
  }

  function switchToPdf() {
    setShowPaste(false)
    setPasteText('')
    setStep('idle')
    setError(null)
    setGateReason(null)
  }

  const currentStepLabel = isProcessing ? STEP_LABELS[step] : null
  const currentStepIndex = STEP_ORDER.indexOf(step)

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        {/* Progress */}
        <div className="mb-10">
          <ProgressIndicator currentStep="upload" />
        </div>

        <h1 className="text-2xl font-bold text-[#222222] mb-2 text-center">Upload your CV</h1>
        <p className="text-[#444444] text-center mb-8 text-sm">
          We&apos;ll score it against your target role and show you exactly what to fix.
        </p>

        {/* Sign-in wall — shown when not authenticated */}
        {isSignedIn === false && (
          <div className="bg-white rounded-[12px] border border-[#DDDDDD] p-8 text-center">
            <div className="w-12 h-12 bg-[#FFF0E6] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#FF6B00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[#222222] mb-2">Sign in to get started</h2>
            <p className="text-sm text-[#666666] mb-6">
              Create a free account to upload your CV, get your score, and see exactly what to fix.
            </p>
            <Button
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full sm:w-auto"
            >
              {signingIn ? 'Redirecting…' : 'Sign in with Google'}
            </Button>
            <p className="text-xs text-[#888888] mt-4">
              By signing in you agree to our{' '}
              <Link href="/terms" className="underline hover:text-[#FF6B00]">Terms</Link>
              {' '}and{' '}
              <Link href="/privacy" className="underline hover:text-[#FF6B00]">Privacy Policy</Link>.
            </p>
          </div>
        )}

        {/* Auth loading state */}
        {isSignedIn === null && (
          <div className="bg-white rounded-[12px] border border-[#DDDDDD] p-8 text-center">
            <p className="text-sm text-[#888888]">Loading…</p>
          </div>
        )}

        {/* Upload form — only shown when signed in */}
        {isSignedIn === true && (<>

        {/* CV deleted success banner */}
        {deletedBanner && (
          <div className="mb-6">
            <AlertBanner
              type="success"
              message="Your CV and scores have been deleted. Upload a new one to get started."
              onDismiss={() => setDeletedBanner(false)}
            />
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6">
            <AlertBanner type="error" message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* Confidence gate failure */}
        {step === 'gate_failed' && gateReason && (
          <div className="mb-6 rounded-[8px] border border-[#FED7AA] bg-[#FFF7ED] p-4">
            <p className="text-sm font-semibold text-[#9A3412] mb-1">We couldn&apos;t read this PDF reliably</p>
            <p className="text-sm text-[#7C3A10] mb-3">{gateReason}</p>
            <button
              type="button"
              onClick={switchToPaste}
              className="text-sm font-medium text-[#FF6B00] hover:text-[#E85F00] transition-colors"
            >
              Paste your CV text instead →
            </button>
          </div>
        )}

        {/* Processing steps */}
        {isProcessing && (
          <div className="mb-8 rounded-[8px] border border-[#DDDDDD] bg-white p-6">
            <p className="text-sm font-medium text-[#222222] mb-4">{currentStepLabel}</p>
            <div className="flex gap-2">
              {STEP_ORDER.slice(0, 3).map((s, i) => (
                <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                  <div
                    className={[
                      'h-1.5 w-full rounded-full transition-all duration-500',
                      i < currentStepIndex
                        ? 'bg-[#FF6B00]'
                        : i === currentStepIndex
                        ? 'bg-[#FF6B00] opacity-70'
                        : 'bg-[#EEEEEE]',
                    ].join(' ')}
                  />
                  <span className="text-[10px] text-[#999999] capitalize">{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload dropzone */}
        {!showPaste && !isProcessing && step !== 'gate_failed' && (
          <label
            htmlFor="cv-upload"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={[
              'block w-full rounded-[8px] border-2 border-dashed p-12 text-center cursor-pointer transition-all',
              isDragging
                ? 'border-[#FF6B00] bg-[#FFF7F2]'
                : file
                ? 'border-[#16A34A] bg-green-50'
                : 'border-[#DDDDDD] bg-white hover:border-[#FF6B00] hover:bg-[#FFF7F2]',
            ].join(' ')}
          >
            <input
              id="cv-upload"
              type="file"
              accept=".pdf"
              className="sr-only"
              onChange={handleFileSelect}
            />
            {file ? (
              <>
                <div className="text-3xl mb-3">✓</div>
                <p className="text-[15px] font-semibold text-[#16A34A]">{file.name}</p>
                <p className="text-sm text-[#444444] mt-1">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · Click to change
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-[#FFF7F2] border border-[#DDDDDD] flex items-center justify-center mx-auto mb-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="#999999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points="17,8 12,3 7,8" stroke="#999999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="12" y1="3" x2="12" y2="15" stroke="#999999" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-[15px] font-medium text-[#222222]">Drop your CV here</p>
                <p className="text-sm text-[#999999] mt-1">or click to browse</p>
                <p className="text-xs text-[#999999] mt-3">PDF only · Max 10MB</p>
              </>
            )}
          </label>
        )}

        {/* Paste toggle */}
        {!isProcessing && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={showPaste ? switchToPdf : switchToPaste}
              className="text-sm text-[#FF6B00] hover:text-[#E85F00] transition-colors cursor-pointer"
            >
              {showPaste ? '← Upload a PDF instead' : 'Or paste your CV text'}
            </button>
          </div>
        )}

        {/* Paste textarea */}
        {showPaste && !isProcessing && (
          <div className="mt-4">
            <textarea
              value={pasteText}
              onChange={(e) => { setPasteText(e.target.value); setStep('idle') }}
              placeholder="Paste your full CV here…"
              rows={14}
              className="w-full rounded-[6px] border border-[#DDDDDD] bg-white px-4 py-3 text-sm text-[#222222] placeholder:text-[#999999] focus:outline-none focus:border-[#FF6B00] resize-none transition-colors"
            />
            <p className="text-xs text-[#999999] mt-1.5">
              Paste the full plain text of your CV. Minimum 100 characters.
            </p>
          </div>
        )}

        {/* Role selection */}
        {!isProcessing && (
          <div className="mt-8">
            <h2 className="text-[15px] font-semibold text-[#222222] mb-0.5">What role are you targeting?</h2>
            <p className="text-xs text-[#999999] mb-3">We&apos;ll score your CV against this specific role.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_ROLES.map((role) => {
                const isSelected = selectedRole === role
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={[
                      'rounded-[8px] border-2 p-3 text-left flex flex-col gap-1 transition-all cursor-pointer',
                      isSelected
                        ? 'border-[#FF6B00] bg-[#FFF0E8]'
                        : 'border-[#E8E0D8] bg-white hover:border-[#FF6B00]/40 hover:bg-[#FFF7F2]',
                    ].join(' ')}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-[#222222] text-xs leading-tight">{ROLE_LABELS[role]}</span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-[#FF6B00] flex items-center justify-center flex-shrink-0">
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5L4 7.5L8.5 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#999999] leading-snug">{ROLE_DESCRIPTIONS[role]}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Consent checkbox */}
        {!isProcessing && (
          <div className="mt-6">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => { setTermsAccepted(e.target.checked); setTermsError(false) }}
                className="mt-0.5 h-4 w-4 rounded border-[#DDDDDD] accent-[#FF6B00] cursor-pointer"
              />
              <span className="text-sm text-[#444444] leading-snug">
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="text-[#FF6B00] hover:text-[#E85F00] transition-colors">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" target="_blank" className="text-[#FF6B00] hover:text-[#E85F00] transition-colors">
                  Privacy Policy
                </Link>
              </span>
            </label>
            {termsError && (
              <p className="text-xs text-[#DC2626] mt-1.5 ml-6.5">
                Please accept the Terms of Service and Privacy Policy to continue.
              </p>
            )}
          </div>
        )}

        {/* CTA */}
        {!isProcessing && (
          <div className="mt-4">
            <Button
              variant="primary"
              size="lg"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="w-full justify-center"
            >
              Analyse my CV →
            </Button>
            {!hasContent && (
              <p className="text-xs text-[#999999] text-center mt-2">Upload a CV or paste your text above</p>
            )}
            {hasContent && !selectedRole && (
              <p className="text-xs text-[#999999] text-center mt-2">Select a target role above to continue</p>
            )}
          </div>
        )}

        </>)}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#DDDDDD] py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-center gap-2 text-sm text-[#999999]">
          <span>&copy; 2026 CV Pulse</span>
          <span>&middot;</span>
          <Link href="/terms" className="hover:text-[#222222] transition-colors">Terms</Link>
          <span>&middot;</span>
          <Link href="/privacy" className="hover:text-[#222222] transition-colors">Privacy</Link>
        </div>
      </footer>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
