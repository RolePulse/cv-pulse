'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const hasContent = !!file || pasteText.trim().length > 100

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === 'application/pdf') setFile(dropped)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected?.type === 'application/pdf') setFile(selected)
  }

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
          We'll score it against your target role and show you exactly what to fix.
        </p>

        {/* Upload dropzone */}
        {!showPaste && (
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
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => { setShowPaste(!showPaste); setFile(null) }}
            className="text-sm text-[#FF6B00] hover:text-[#E85F00] transition-colors cursor-pointer"
          >
            {showPaste ? '← Upload a PDF instead' : 'Or paste your CV text'}
          </button>
        </div>

        {/* Paste textarea */}
        {showPaste && (
          <div className="mt-4">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
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
        <div className="mt-8">
          <Button
            variant="primary"
            size="lg"
            disabled={!hasContent}
            className="w-full justify-center"
          >
            Analyse my CV →
          </Button>
          {/* Real upload logic wired in Epic 2 */}
        </div>
      </main>
    </div>
  )
}
