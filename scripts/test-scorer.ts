// CV Pulse — Scorer test harness
// Epic 4 | Run: npx tsx scripts/test-scorer.ts

import { scoreCV } from '../src/lib/scorer'
import { parseCV } from '../src/lib/parser'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { StructuredCV } from '../src/types/database'

type TargetRole = 'SDR' | 'AE' | 'CSM' | 'Marketing' | 'Leadership'

// ── Mock CVs ──────────────────────────────────────────────────────────────────

const STRONG_CSM_STRUCTURED: StructuredCV = {
  summary: 'Customer Success Manager with 5 years experience in SaaS. Specialist in retention, QBR delivery, and expansion revenue. Gainsight certified.',
  experience: [
    {
      company: 'Acme SaaS',
      title: 'Customer Success Manager',
      start: 'Jan 2021',
      end: 'Present',
      bullets: [
        'Maintained 96% gross retention rate across 45-account portfolio worth $3.2M ARR',
        'Led QBR process for top 10 accounts, resulting in 28% expansion revenue in Q2 2023',
        'Reduced churn by 18% through proactive health score monitoring via Gainsight',
        'Onboarded 12 enterprise accounts in 6 months, achieving 94% 90-day activation rate',
      ],
    },
    {
      company: 'StartupCo',
      title: 'Junior Customer Success Manager',
      start: 'Mar 2019',
      end: 'Dec 2020',
      bullets: [
        'Managed 60+ SMB accounts with average NPS of 52',
        'Reduced time-to-value by 30% through improved onboarding playbook',
        'Contributed to 15% upsell revenue by identifying expansion opportunities',
      ],
    },
    {
      company: 'First Jobs Inc',
      title: 'Account Executive',
      start: 'Jun 2017',
      end: 'Feb 2019',
      bullets: [
        'Closed 120% of quota in first full year ($800k ARR)',
        'Won 3 enterprise accounts over $100k each in H2 2018',
      ],
    },
  ],
  skills: ['Gainsight', 'Salesforce', 'Customer Success', 'Retention', 'QBR', 'NPS', 'CSAT', 'Onboarding', 'Renewal', 'Upsell', 'Churn', 'Health Score'],
  education: [{ institution: 'University of Bath', qualification: 'BSc Business', year: '2017' }],
  certifications: ['Gainsight Certified Customer Success Manager'],
}

const STRONG_CSM_RAWTEXT = `
Jane Smith
jane.smith@email.com | linkedin.com/in/janesmith | London, UK

Customer Success Manager
5 years in SaaS customer success. Specialist in retention, QBR delivery, expansion revenue. Gainsight certified.

EXPERIENCE

Customer Success Manager — Acme SaaS (Jan 2021 – Present)
Maintained 96% gross retention rate across 45-account portfolio worth $3.2M ARR
Led QBR process for top 10 accounts, resulting in 28% expansion revenue in Q2 2023
Reduced churn by 18% through proactive health score monitoring via Gainsight
Onboarded 12 enterprise accounts in 6 months, achieving 94% 90-day activation rate

Junior Customer Success Manager — StartupCo (Mar 2019 – Dec 2020)
Managed 60+ SMB accounts with average NPS of 52
Reduced time-to-value by 30% through improved onboarding playbook
Contributed to 15% upsell revenue by identifying expansion opportunities

Account Executive — First Jobs Inc (Jun 2017 – Feb 2019)
Closed 120% of quota in first full year ($800k ARR)
Won 3 enterprise accounts over $100k each in H2 2018

SKILLS
Gainsight, Salesforce, Customer Success, Retention, QBR, NPS, CSAT, Onboarding, Renewal, Upsell, Churn, Health Score, EBR, Lifecycle, Playbook, Adoption, Stakeholder Management

EDUCATION
BSc Business — University of Bath (2017)
`

const WEAK_SDR_STRUCTURED: StructuredCV = {
  summary: '',
  experience: [
    {
      company: '',
      title: 'Sales Representative',
      start: '',
      end: '',
      bullets: [
        'Made calls to potential customers and followed up on leads',
        'Helped with pipeline activities and CRM updates',
        'Assisted the sales team with various tasks',
      ],
    },
  ],
  skills: ['Sales', 'Communication', 'Microsoft Office'],
  education: [{ institution: 'Local College', qualification: 'Diploma', year: '2020' }],
  certifications: [],
}

const WEAK_SDR_RAWTEXT = `
John Doe
Sales Representative

Made calls to potential customers and followed up on leads
Helped with pipeline activities and CRM updates
Assisted the sales team with various tasks

Skills: Sales, Communication, Microsoft Office
Education: Diploma, Local College, 2020
`

// ── Test runner ───────────────────────────────────────────────────────────────

function printResult(label: string, result: ReturnType<typeof scoreCV>) {
  console.log(`  Score: ${result.overallScore}/100 | ${result.passFail ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`  Impact: ${result.buckets.proofOfImpact.score}/47 | Format: ${result.buckets.formatting.score}/27 | Clarity: ${result.buckets.clarity.score}/26`)
  if (result.criticalConcerns.length) {
    console.log(`  ⚠️  Critical: ${result.criticalConcerns.join(' | ')}`)
  }
  // Keywords removed from general score (2026-03-06) — shown only in JD Match
  console.log(`  Checklist: ${result.checklist.length} items, ${result.checklist.filter(c => c.done).length} done`)
  if (result.checklist.filter(c => !c.done).length > 0) {
    const topFixes = result.checklist.filter(c => !c.done).slice(0, 3)
    console.log(`  Top fixes:`)
    topFixes.forEach(f => console.log(`    → [${f.category}] ${f.action.slice(0, 80)}...`))
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║   CV Pulse — Scoring Engine Test Suite   ║')
  console.log('╚══════════════════════════════════════════╝\n')

  let allPassed = true

  // ── Test 1: Strong CSM ───────────────────────────────────────────────────
  console.log('Test 1: Strong CSM CV — expecting PASS, score ≥70')
  {
    const result = scoreCV(STRONG_CSM_STRUCTURED, STRONG_CSM_RAWTEXT, 'CSM' as TargetRole)
    printResult('Strong CSM', result)
    const ok = result.passFail && result.overallScore >= 70
    console.log(`  → ${ok ? '✅ TEST PASSED' : '❌ TEST FAILED'}\n`)
    if (!ok) allPassed = false
  }

  // ── Test 2: Weak SDR ─────────────────────────────────────────────────────
  console.log('Test 2: Weak SDR CV — expecting FAIL, score <50, critical concerns present')
  {
    const result = scoreCV(WEAK_SDR_STRUCTURED, WEAK_SDR_RAWTEXT, 'SDR' as TargetRole)
    printResult('Weak SDR', result)
    const ok = !result.passFail && result.overallScore < 50 && result.criticalConcerns.length > 0
    console.log(`  → ${ok ? '✅ TEST PASSED' : '❌ TEST FAILED'}\n`)
    if (!ok) allPassed = false
  }

  // ── Test 3: Determinism ──────────────────────────────────────────────────
  console.log('Test 3: Determinism — same input must produce same output')
  {
    const r1 = scoreCV(STRONG_CSM_STRUCTURED, STRONG_CSM_RAWTEXT, 'CSM' as TargetRole)
    const r2 = scoreCV(STRONG_CSM_STRUCTURED, STRONG_CSM_RAWTEXT, 'CSM' as TargetRole)
    const r3 = scoreCV(STRONG_CSM_STRUCTURED, STRONG_CSM_RAWTEXT, 'CSM' as TargetRole)
    const det = r1.overallScore === r2.overallScore && r2.overallScore === r3.overallScore
    console.log(`  Scores: ${r1.overallScore}, ${r2.overallScore}, ${r3.overallScore}`)
    console.log(`  → ${det ? '✅ TEST PASSED (deterministic)' : '❌ TEST FAILED (non-deterministic!)'}\n`)
    if (!det) allPassed = false
  }

  // ── Test 4: Score vs wrong role (CSM CV scored as SDR — should score lower)
  console.log('Test 4: Role mismatch penalty — CSM CV scored as SDR should score lower than as CSM')
  {
    const asCSM = scoreCV(STRONG_CSM_STRUCTURED, STRONG_CSM_RAWTEXT, 'CSM' as TargetRole)
    const asSDR = scoreCV(STRONG_CSM_STRUCTURED, STRONG_CSM_RAWTEXT, 'SDR' as TargetRole)
    console.log(`  As CSM: ${asCSM.overallScore}/100 | As SDR: ${asSDR.overallScore}/100`)
    const ok = asCSM.overallScore > asSDR.overallScore
    console.log(`  → ${ok ? '✅ TEST PASSED' : '❌ TEST FAILED'}\n`)
    if (!ok) allPassed = false
  }

  // ── Test 5: Real PDFs (optional) ────────────────────────────────────────
  const downloadsDir = join(process.env.HOME ?? '/tmp', 'Downloads')
  let pdfFiles: string[] = []
  try {
    pdfFiles = readdirSync(downloadsDir)
      .filter(f => f.toLowerCase().endsWith('.pdf') && (
        f.toLowerCase().includes('cv') || f.toLowerCase().includes('resume')
      ))
      .filter(f => !['invoice', 'receipt', 'jd', 'order', 'assessment'].some(k => f.toLowerCase().includes(k)))
      .slice(0, 8)
  } catch { /* no downloads folder */ }

  if (pdfFiles.length > 0) {
    console.log(`Test 5: Real PDFs from ~/Downloads (${pdfFiles.length} files, scoring as CSM)`)
    for (const file of pdfFiles) {
      const buffer = readFileSync(join(downloadsDir, file))
      const parsed = await parseCV(buffer)
      if (parsed.confidence < 40) {
        console.log(`  ⬜ ${file.slice(0, 40)} — skipped (confidence ${parsed.confidence})`)
        continue
      }
      const result = scoreCV(parsed.structured, parsed.rawText, 'CSM')
      const flag = result.overallScore >= 40 ? '✅' : '⚠️'
      console.log(`  ${flag} ${file.slice(0, 38).padEnd(38)} → ${String(result.overallScore).padStart(3)}/100 | Impact:${result.buckets.proofOfImpact.score} Format:${result.buckets.formatting.score} Clarity:${result.buckets.clarity.score}`)
    }
    console.log()
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════')
  console.log(allPassed ? '✅ ALL CORE TESTS PASSED' : '❌ SOME TESTS FAILED')
  console.log('═══════════════════════════════════════════\n')

  process.exit(allPassed ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
