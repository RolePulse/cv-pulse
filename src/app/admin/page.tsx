'use client'

// CV Pulse — Admin Dashboard
// Epic 10 | Allowlist CSV upload wired. Funnel metrics wired in Epic 15.

import { useRef, useState } from 'react'
import Header from '@/components/Header'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

const metrics = [
  { label: 'CV uploads', value: '—', sub: 'Wired in Epic 15' },
  { label: 'Sign-ins', value: '—', sub: 'Wired in Epic 15' },
  { label: 'Scores viewed', value: '—', sub: 'Wired in Epic 15' },
  { label: 'Re-score clicks', value: '—', sub: 'Wired in Epic 15' },
  { label: 'Paywall hits', value: '—', sub: 'Wired in Epic 15' },
  { label: 'Parse failure rate', value: '—', sub: 'Target: <10%' },
]

const topFailedChecks = [
  { label: 'Missing quantified metrics', count: '—' },
  { label: 'Missing ATS keywords', count: '—' },
  { label: 'Bullet points too long', count: '—' },
  { label: 'No company context', count: '—' },
]

export default function AdminPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadStatus('uploading')
    setUploadMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/admin/allowlist', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setUploadStatus('error')
        setUploadMessage(data.error ?? 'Upload failed — please try again.')
      } else {
        setUploadStatus('success')
        setUploadMessage(data.message)
      }
    } catch {
      setUploadStatus('error')
      setUploadMessage('Network error — please try again.')
    }

    // Reset file input so the same file can be re-uploaded if needed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn userInitial="A" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#222222]">Admin</h1>

          {/* Allowlist CSV upload */}
          <div className="flex items-center gap-3">
            {uploadStatus === 'uploading' && (
              <span className="text-sm text-[#999999]">Uploading…</span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={handleCSVUpload}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={uploadStatus === 'uploading'}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadStatus === 'uploading' ? 'Uploading…' : 'Upload allowlist CSV'}
            </Button>
          </div>
        </div>

        {/* Upload feedback */}
        {uploadMessage && (
          <div className="mb-6">
            <AlertBanner
              type={uploadStatus === 'success' ? 'success' : 'error'}
              message={uploadMessage}
              onDismiss={() => { setUploadStatus('idle'); setUploadMessage(null) }}
            />
          </div>
        )}

        {/* CSV format hint */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-5 mb-6"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[13px] font-semibold text-[#222222] mb-2">Allowlist CSV format</h2>
          <p className="text-xs text-[#666666] mb-2">
            Upload a CSV with email addresses. The first column is always used.
            Header row ("email") is automatically skipped.
          </p>
          <pre className="text-xs bg-[#F8F8F8] rounded-[4px] p-3 text-[#444444] font-mono">
{`email
james@example.com
sarah@example.com
tom@example.com`}
          </pre>
          <p className="text-xs text-[#999999] mt-2">
            Uploaded emails are upserted to the allowlist. Existing users with matching emails are upgraded to <code>rolepulse_paid</code> immediately.
          </p>
        </div>

        {/* Funnel metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="bg-white rounded-[8px] border border-[#DDDDDD] p-5"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              <p className="text-xs text-[#999999] mb-1 uppercase tracking-wide font-medium">{metric.label}</p>
              <p className="text-3xl font-bold text-[#CCCCCC]">{metric.value}</p>
              <p className="text-xs text-[#999999] mt-0.5">{metric.sub}</p>
            </div>
          ))}
        </div>

        {/* Most common failed checks */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[15px] font-semibold text-[#222222] mb-4">Most common failed checklist items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-[#DDDDDD]">
                <th className="pb-3 text-[#999999] font-medium">Item</th>
                <th className="pb-3 text-[#999999] font-medium text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {topFailedChecks.map((item) => (
                <tr key={item.label} className="border-b border-[#DDDDDD] last:border-0">
                  <td className="py-3 text-[#444444]">{item.label}</td>
                  <td className="py-3 text-[#CCCCCC] font-semibold text-right">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-[#999999] mt-4">Live data wired in Epic 15.</p>
        </div>
      </main>
    </div>
  )
}
