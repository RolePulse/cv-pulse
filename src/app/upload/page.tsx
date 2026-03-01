'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'

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
  const [deletedBanner, setDeletedBanner] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [step, setStep] = useState<UploadStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [gateReason, setGateReason] = useState<string | null>(null)

  // Show banner when redirected after CV deletion
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('deleted') === 'cv') {
      setDeletedBanner(true)
      // Remove query param from URL so refresh does not re-show it
      window.history.replaceState({}, '', '/upload')
    }
  }, [])

  const hasContent = !!file || pasteText.trim().length > 100
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

  // Simulate processing step progression with delays
  async function animateSteps(onDone: () => void) {
    for (const s of STEP_ORDER.slice(0, 3)) {
      setStep(s)
      await sleep(700)
    }
    onDone()
  }

  async function handleSubmit() {
    if (!hasContent || isProcessing) return
    setError(null)
    setGateReason(null)

    // Start animation alongside actual fetch
    let fetchDone = false
    let fetchResult: { ok: boolean; cvId?: string; confidence?: number; failReason?: string; error?: string } | null = null

    // Kick off animation
    animateSteps(() => {
      if (fetchDone && fetchResult) handleResult(fetchResult)
    })

    // Kick off actual upload
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
      setStep('failed')
      setError('Network error — check your connection and try again.')
      return
    }

    if (response.status === 401) {
      setStep('failed')
      setError('You need to sign in before uploading your CV.')
      return
    }

    let data: typeof fetchResult
    try {
      data = await response.json()
    } catch {
      setStep('failed')
      setError('Unexpected response from the server — please try again.')
      return
    }

    fetchDone = true
    fetchResult = data

    // If animation has already completed, handle result immediately
    if (step === 'ready' || step === 'failed' || step === 'gate_failed') {
      handleResult(fetchResult!)
    }
    // Otherwise the animateSteps callback will call handleResult when done
  }

  function handleResult(data: { ok: boolean; cvId?: string; failReason?: string; error?: string }) {
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

    setStep('ready')
    router.push(`/select-role?cvId=${data.cvId}`)
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

        {/* CTA */}
        {!isProcessing && (
          <div className="mt-8">
            <Button
              variant="primary"
              size="lg"
              disabled={!hasContent}
              onClick={handleSubmit}
              className="w-full justify-center"
            >
              Analyse my CV →
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
