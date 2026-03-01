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

// ─── Real CV export tests — all CVs in Downloads ─────────────────────────────

const CV_DIR = path.join(process.env.HOME ?? '/Users/jamesfowles', 'Downloads')

const ALL_CVS = [
  'Claire F Resume 2025.pdf',
  'Emily Shea - CV - 2025.pdf.pdf',
  'Mariah_Cooper_CV_2025.pdf',
  'Ashley Taggart Resume.pdf',
  'George Samayoa CV.pdf',
  '0Resumes Thomas D Dievart resume.pdf',
  'Bryson_Ward_Resume.pdf',
  'Katie Resume 2025.pdf',
  'Joe Guay Resume 2025.pdf',
  'Kati Smith Resume.pdf',
  'Nicholas M Goerg Resume  (3) (1).pdf',
  'Sophia Nguyen Resume 2025.pdf',
  'Resume-EveForaker.pdf',
  'Kit Lewis - Resume.pdf',
  'Erin Woods Resume (1).pdf',
  'Anthony Bryan Allen Resume 3.5.pdf',
  'MaxDalzielResume - 040925.pdf',
  'LauraManoleResume.pdf',
  'Florence Aouad Resume (1).pdf',
  'PiyushP_ResumeWPassword.pdf',
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

interface ExportResult {
  name: string
  skipped: boolean
  skipReason?: string
  roles: number
  classicKB: number
  modernKB: number
  classicValid: boolean
  modernValid: boolean
  errors: string[]
}

const exportResults: ExportResult[] = []

describe('Epic 11 — Real CV PDF export — all CVs in Downloads', () => {

  for (const filename of ALL_CVS) {
    it(`Both templates: ${filename}`, async () => {
      const filePath = path.join(CV_DIR, filename)
      const result: ExportResult = {
        name: filename,
        skipped: false,
        roles: 0,
        classicKB: 0,
        modernKB: 0,
        classicValid: false,
        modernValid: false,
        errors: [],
      }

      if (!existsSync(filePath)) {
        result.skipped = true
        result.skipReason = 'File not found'
        exportResults.push(result)
        console.log(`  ⏭ ${filename} — not found`)
        return
      }

      const rawText = await extractText(filePath)
      if (!rawText || rawText.trim().length < 100) {
        result.skipped = true
        result.skipReason = rawText === null ? 'Password-protected or corrupt' : 'Too short to parse'
        exportResults.push(result)
        console.log(`  ⏭ ${filename} — ${result.skipReason}`)
        return
      }

      let parsed: ReturnType<typeof parseText>
      try {
        parsed = parseText(rawText)
      } catch (e) {
        result.errors.push(`parseText crashed: ${String(e)}`)
        exportResults.push(result)
        throw e
      }

      result.roles = parsed.structured.experience?.length ?? 0

      let classic: Buffer
      let modern: Buffer
      try {
        ;[classic, modern] = await Promise.all([
          generatePDF(parsed.structured as StructuredCV, rawText, 'classic'),
          generatePDF(parsed.structured as StructuredCV, rawText, 'modern'),
        ])
      } catch (e) {
        result.errors.push(`generatePDF crashed: ${String(e)}`)
        exportResults.push(result)
        throw e
      }

      result.classicKB = Math.round(classic.byteLength / 1024)
      result.modernKB = Math.round(modern.byteLength / 1024)
      result.classicValid = classic.slice(0, 5).toString() === '%PDF-'
      result.modernValid = modern.slice(0, 5).toString() === '%PDF-'

      exportResults.push(result)

      const icon = result.classicValid && result.modernValid ? '✅' : '❌'
      console.log(
        `  ${icon} ${filename.replace('.pdf', '')}\n` +
        `     classic=${result.classicKB}KB modern=${result.modernKB}KB | roles=${result.roles}`
      )

      // Assertions
      expect(classic.byteLength).toBeGreaterThan(500)
      expect(modern.byteLength).toBeGreaterThan(500)
      expect(result.classicValid).toBe(true)
      expect(result.modernValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  }

  it('prints export summary', () => {
    const processed = exportResults.filter((r) => !r.skipped)
    const skipped = exportResults.filter((r) => r.skipped)
    const allValid = processed.filter((r) => r.classicValid && r.modernValid)

    const avgClassicKB = processed.length
      ? Math.round(processed.reduce((s, r) => s + r.classicKB, 0) / processed.length)
      : 0
    const avgModernKB = processed.length
      ? Math.round(processed.reduce((s, r) => s + r.modernKB, 0) / processed.length)
      : 0
    const avgRoles = processed.length
      ? Math.round(processed.reduce((s, r) => s + r.roles, 0) / processed.length * 10) / 10
      : 0

    console.log('\n──────────── PDF EXPORT SUMMARY ────────────')
    console.log(`CVs processed:  ${processed.length} / ${ALL_CVS.length} (${skipped.length} skipped)`)
    console.log(`Valid PDFs:     ${allValid.length}/${processed.length} (both templates)`)
    console.log(`Avg file size:  Classic ${avgClassicKB}KB · Modern ${avgModernKB}KB`)
    console.log(`Avg roles:      ${avgRoles} per CV`)

    const byRoles = processed.reduce((acc, r) => {
      const bucket = r.roles === 0 ? '0 roles' : r.roles <= 2 ? '1–2 roles' : r.roles <= 4 ? '3–4 roles' : '5+ roles'
      acc[bucket] = (acc[bucket] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('\nRoles per CV:')
    for (const [bucket, count] of Object.entries(byRoles)) {
      console.log(`  ${bucket}: ${count} CV(s)`)
    }
    console.log('─────────────────────────────────────────────\n')

    expect(processed.length).toBeGreaterThan(0)
    expect(allValid.length).toBe(processed.length)
  })
})
