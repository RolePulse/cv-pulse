// CV Pulse — PDF Export tests
// Epic 11 | Tests PDF generation for both templates against real CVs.
//
// Level: medium (7 unit checks + real CV generation smoke test)
// Tests: generation doesn't crash, output is valid PDF, contact extraction,
// both templates work, edge cases (empty sections, minimal CV).

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>
import { generatePDF } from '@/lib/pdfTemplates'
import { parseText } from '@/lib/parser'
import type { StructuredCV } from '@/types/database'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_CV: StructuredCV = {
  summary: 'Senior SDR with 4 years driving enterprise pipeline in SaaS. Consistent 120%+ quota attainment across outbound prospecting and cold calling sequences.',
  experience: [
    {
      title: 'Senior SDR',
      company: 'Acme SaaS (Series B, 150-person team)',
      start: 'Jan 2022',
      end: 'Present',
      bullets: [
        'Generated $1.8M pipeline in 2023 through outbound prospecting via Outreach and ZoomInfo',
        'Booked 18 qualified demos per month on average, exceeding meetings booked quota by 25%',
        'Cold calling 60+ prospects daily; built cadences that lifted connect rate by 22%',
        'Ranked #2 of 14 SDRs globally for pipeline generation in Q3 2023',
      ],
    },
    {
      title: 'SDR',
      company: 'Beta Software (Series A)',
      start: 'Jun 2020',
      end: 'Dec 2021',
      bullets: [
        'Managed outbound sequences across EMEA territory using Salesloft and Salesforce',
        'Achieved 115% of monthly SQL quota for 8 consecutive months',
        'Built cold email frameworks adopted by the full SDR team',
      ],
    },
  ],
  skills: ['Outreach', 'Salesloft', 'Salesforce', 'HubSpot', 'ZoomInfo', 'Apollo', 'Gong', 'Cold calling', 'Outbound prospecting', 'Pipeline generation'],
  education: [
    { institution: 'University of Edinburgh', qualification: 'BA Business Management', year: '2019' },
  ],
  certifications: ['Certified Sales Development Representative (CSDR)', 'Challenger Sales Methodology'],
}

const FULL_CV_RAW = `Jane Smith
jane.smith@email.com | +44 7700 900123 | London, UK | linkedin.com/in/janesmith

Senior SDR with 4 years driving enterprise pipeline in SaaS. Consistent 120%+ quota attainment.

Senior SDR — Acme SaaS (Jan 2022 – Present)
• Generated $1.8M pipeline in 2023 through outbound prospecting via Outreach and ZoomInfo
• Booked 18 qualified demos per month on average, exceeding meetings booked quota by 25%

SDR — Beta Software (Jun 2020 – Dec 2021)
• Managed outbound sequences across EMEA territory using Salesloft and Salesforce
• Achieved 115% of monthly SQL quota for 8 consecutive months

Skills: Outreach, Salesloft, Salesforce, HubSpot, ZoomInfo, Apollo, Gong

Education: University of Edinburgh — BA Business Management, 2019
`

const MINIMAL_CV: StructuredCV = {
  summary: '',
  experience: [],
  skills: [],
  education: [],
  certifications: [],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Epic 11 — PDF Export', () => {

  it('1. Classic template generates without crashing and returns bytes', async () => {
    const bytes = await generatePDF(FULL_CV, FULL_CV_RAW, 'classic')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  it('2. Modern template generates without crashing and returns bytes', async () => {
    const bytes = await generatePDF(FULL_CV, FULL_CV_RAW, 'modern')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  it('3. Both outputs are valid PDFs (start with %PDF-)', async () => {
    const [classic, modern] = await Promise.all([
      generatePDF(FULL_CV, FULL_CV_RAW, 'classic'),
      generatePDF(FULL_CV, FULL_CV_RAW, 'modern'),
    ])

    const classicHeader = Buffer.from(classic.slice(0, 5)).toString('ascii')
    const modernHeader = Buffer.from(modern.slice(0, 5)).toString('ascii')

    expect(classicHeader).toBe('%PDF-')
    expect(modernHeader).toBe('%PDF-')
  })

  it('4. PDF contains the candidate name (contact extraction working)', async () => {
    const bytes = await generatePDF(FULL_CV, FULL_CV_RAW, 'classic')
    const buf = Buffer.from(bytes)
    const text = await pdfParse(buf)
    expect(text.text).toContain('Jane Smith')
  })

  it('5. PDF contains key CV sections (experience titles + skills)', async () => {
    const bytes = await generatePDF(FULL_CV, FULL_CV_RAW, 'modern')
    const buf = Buffer.from(bytes)
    const text = await pdfParse(buf)
    // Should contain job title and company
    expect(text.text).toContain('Senior SDR')
    // Should contain a skill
    expect(text.text).toContain('Salesforce')
  })

  it('6. Minimal CV (no content) generates without crashing', async () => {
    const bytes = await generatePDF(MINIMAL_CV, '', 'classic')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  it('7. Classic and modern PDFs differ (different templates produce different bytes)', async () => {
    const [classic, modern] = await Promise.all([
      generatePDF(FULL_CV, FULL_CV_RAW, 'classic'),
      generatePDF(FULL_CV, FULL_CV_RAW, 'modern'),
    ])
    // They should produce different PDFs
    expect(classic.byteLength).not.toBe(modern.byteLength)
  })

})

// ─── Real CV smoke tests ───────────────────────────────────────────────────────

const CV_DIR = path.join(process.env.HOME ?? '/Users/jamesfowles', 'Downloads')

// Subset of real CVs for smoke testing (use a representative sample)
const SMOKE_CVS = [
  'Nicholas M Goerg Resume  (3) (1).pdf',  // AE — scores ~70, has good structure
  'Ashley Taggart Resume.pdf',              // fallback SDR
  'Bryson_Ward_Resume.pdf',                 // SDR fallback, multiple roles
  '0Resumes Thomas D Dievart resume.pdf',   // Marketing — multi-role
  'Kati Smith Resume.pdf',                  // two-column, known parse limit
]

async function extractText(filePath: string): Promise<string | null> {
  try {
    const buffer = readFileSync(filePath)
    const result = await pdfParse(buffer)
    return result.text
  } catch {
    return null
  }
}

describe('Epic 11 — Real CV PDF export smoke tests', () => {
  for (const filename of SMOKE_CVS) {
    it(`Generates both templates for: ${filename}`, async () => {
      const filePath = path.join(CV_DIR, filename)

      if (!existsSync(filePath)) {
        console.log(`  ⏭ ${filename} — not found, skipping`)
        return
      }

      const rawText = await extractText(filePath)
      if (!rawText || rawText.trim().length < 100) {
        console.log(`  ⏭ ${filename} — too short to parse, skipping`)
        return
      }

      const parsed = parseText(rawText)
      const structured = parsed.structured as StructuredCV

      // Both templates must generate without crashing
      const [classic, modern] = await Promise.all([
        generatePDF(structured, rawText, 'classic'),
        generatePDF(structured, rawText, 'modern'),
      ])

      // Both must be non-empty valid PDFs
      expect(classic.byteLength).toBeGreaterThan(500)
      expect(modern.byteLength).toBeGreaterThan(500)
      expect(Buffer.from(classic.slice(0, 5)).toString('ascii')).toBe('%PDF-')
      expect(Buffer.from(modern.slice(0, 5)).toString('ascii')).toBe('%PDF-')

      const classicKB = Math.round(classic.byteLength / 1024)
      const modernKB = Math.round(modern.byteLength / 1024)
      console.log(
        `  ✅ ${filename.replace('.pdf', '')}\n` +
        `     classic=${classicKB}KB modern=${modernKB}KB | roles=${parsed.structured.experience?.length ?? 0}`
      )
    })
  }
})
