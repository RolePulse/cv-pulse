// Auth gate: real auth wired in Epic 1. Redirect unauthenticated users to /upload.
import Header from '@/components/Header'
import ProgressIndicator from '@/components/ProgressIndicator'
import Button from '@/components/Button'

const templates = [
  {
    id: 'classic',
    name: 'Clean Classic',
    description: 'Single column, ATS-safe, timeless. Works for every role.',
  },
  {
    id: 'modern',
    name: 'Modern Minimal',
    description: 'Single column, ATS-safe, contemporary styling. Great for tech and GTM roles.',
  },
]

export default function ExportPage() {
  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        {/* Progress */}
        <div className="mb-10">
          <ProgressIndicator currentStep="export" />
        </div>

        <h1 className="text-2xl font-bold text-[#222222] mb-2 text-center">Export your CV</h1>
        <p className="text-[#444444] text-center text-sm mb-8">
          Two clean, ATS-safe templates. Both free in v1.
        </p>

        {/* Template cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-[8px] border border-[#DDDDDD] overflow-hidden"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              {/* Preview thumbnail placeholder */}
              <div className="h-48 bg-[#F0F0F0] flex items-center justify-center border-b border-[#DDDDDD]">
                <div className="text-center">
                  <div className="w-10 h-10 bg-[#DDDDDD] rounded-[4px] mx-auto mb-2" />
                  <span className="text-xs text-[#999999]">{template.name}</span>
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-[15px] font-semibold text-[#222222] mb-1">{template.name}</h3>
                <p className="text-xs text-[#444444] mb-4 leading-relaxed">{template.description}</p>
                <Button variant="primary" size="sm" className="w-full justify-center">
                  Download PDF
                </Button>
                {/* Real PDF generation wired in Epic 11 */}
              </div>
            </div>
          ))}
        </div>

        {/* Share section */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[15px] font-semibold text-[#222222] mb-2">Share your results</h2>
          <p className="text-sm text-[#444444] mb-4">
            Share a redacted link — score, pass/fail, and checklist titles only. No CV text, no contact info.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[#FAFAFA] border border-[#DDDDDD] rounded-[6px] px-3 py-2 text-sm text-[#999999] truncate">
              cvpulse.io/share/abc123… (generated after export)
            </div>
            <Button variant="secondary" size="sm" disabled>
              Copy
            </Button>
          </div>
          {/* Real share link wired in Epic 12 */}
        </div>
      </main>
    </div>
  )
}
