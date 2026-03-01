'use client'

// CV Pulse — Admin Dashboard
// Epic 15 | Allowlist CSV upload + real funnel metrics + top failing checklist items

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import type { FunnelMetrics, FailingItem } from '@/lib/adminMetrics'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

const METRIC_LABELS: { key: keyof FunnelMetrics; label: string }[] = [
  { key: 'total_uploads', label: 'Total uploads' },
  { key: 'sign_ins', label: 'Sign-ins' },
  { key: 'scores_viewed', label: 'Scores viewed' },
  { key: 'rescore_clicks', label: 'Re-score clicks' },
  { key: 'paywall_hits', label: 'Paywall hits' },
  { key: 'jd_checks', label: 'JD checks' },
  { key: 'share_links_created', label: 'Share links created' },
  { key: 'exports', label: 'Exports' },
  { key: 'parse_failures', label: 'Parse failures' },
  { key: 'account_deletions', label: 'Account deletions' },
]

export default function AdminPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)

  // Metrics state
  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null)
  const [topFailingItems, setTopFailingItems] = useState<FailingItem[]>([])
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [metricsError, setMetricsError] = useState<string | null>(null)

  // Fetch metrics on mount
  useEffect(() => {
    async function loadMetrics() {
      try {
        const res = await fetch('/api/admin/metrics')

        if (res.status === 401 || res.status === 403) {
          router.push('/upload')
          return
        }

        if (!res.ok) {
          setMetricsError('Failed to load metrics')
          setMetricsLoading(false)
          return
        }

        const data = await res.json()
        setMetrics(data.funnelMetrics)
        setTopFailingItems(data.topFailingItems ?? [])
      } catch {
        setMetricsError('Network error — could not load metrics')
      }
      setMetricsLoading(false)
    }
    loadMetrics()
  }, [router])

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

        {/* Metrics error */}
        {metricsError && (
          <div className="mb-6">
            <AlertBanner
              type="error"
              message={metricsError}
              onDismiss={() => setMetricsError(null)}
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
            Header row (&quot;email&quot;) is automatically skipped.
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
        <h2 className="text-[15px] font-semibold text-[#222222] mb-3">Funnel metrics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {METRIC_LABELS.map(({ key, label }) => (
            <div
              key={key}
              className="bg-white rounded-[8px] border border-[#DDDDDD] p-5"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              <p className="text-xs text-[#999999] mb-1 uppercase tracking-wide font-medium">{label}</p>
              <p className={`text-3xl font-bold ${metricsLoading ? 'text-[#CCCCCC]' : 'text-[#222222]'}`}>
                {metricsLoading ? '—' : (metrics?.[key] ?? 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        {/* Most common failed checklist items */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[15px] font-semibold text-[#222222] mb-4">Most common failed checklist items</h2>
          {metricsLoading ? (
            <p className="text-sm text-[#999999]">Loading…</p>
          ) : topFailingItems.length === 0 ? (
            <p className="text-sm text-[#999999]">No score data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-[#DDDDDD]">
                  <th className="pb-3 text-[#999999] font-medium">#</th>
                  <th className="pb-3 text-[#999999] font-medium">Item</th>
                  <th className="pb-3 text-[#999999] font-medium text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {topFailingItems.map((item, i) => (
                  <tr key={item.title} className="border-b border-[#DDDDDD] last:border-0">
                    <td className="py-3 text-[#999999] w-8">{i + 1}</td>
                    <td className="py-3 text-[#444444]">{item.title}</td>
                    <td className="py-3 text-[#222222] font-semibold text-right">{item.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
