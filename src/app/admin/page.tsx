// Admin page — restricted to admin users (auth check wired in Epic 15)
import Header from '@/components/Header'
import Button from '@/components/Button'

const metrics = [
  { label: 'CV uploads', value: 0, sub: 'All time' },
  { label: 'Sign-ins', value: 0, sub: 'All time' },
  { label: 'Scores viewed', value: 0, sub: 'All time' },
  { label: 'Re-score clicks', value: 0, sub: 'All time' },
  { label: 'Paywall hits', value: 0, sub: 'All time' },
  { label: 'Parse failure rate', value: '0%', sub: 'Target: <10%' },
]

const topFailedChecks = [
  { label: 'Missing quantified metrics', count: 0 },
  { label: 'Missing ATS keywords', count: 0 },
  { label: 'Bullet points too long', count: 0 },
  { label: 'No company context', count: 0 },
]

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn userInitial="A" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-[#222222]">Admin</h1>
          <Button variant="secondary" size="sm">
            Upload allowlist CSV
          </Button>
          {/* Real CSV upload wired in Epic 15 */}
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
              <p className="text-3xl font-bold text-[#222222]">{metric.value}</p>
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
                  <td className="py-3 text-[#222222] font-semibold text-right">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-[#999999] mt-4">Real data wired in Epic 15.</p>
        </div>
      </main>
    </div>
  )
}
