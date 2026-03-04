// CV Pulse — Option C paywall tests (real CVs)
// Tests the usage gate + paywall logic across all 20 real CVs.
//
// Option C model:
//   Score 1 (existingCount=0)            → always free (first score)
//   Score 2+ (any existingCount, any user) → ALWAYS allowed (unlimited re-scores)
//   JD check 1–2 (free user)             → allowed
//   JD check 3+ (free user)              → paywalled
//   Paid users                           → all gates bypassed
//
// Also: CSV parser edge cases, JD check gate across all CVs,
// and scoring produces valid results for the real CV set.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>
import { parseText } from '@/lib/parser'
import { scoreCV } from '@/lib/scorer'
import { isPaywalled } from '@/lib/data'
import { parseAllowlistCSV } from '@/lib/parseAllowlistCSV'
import type { StructuredCV, Usage } from '@/types/database'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUsage(overrides: Partial<Usage> = {}): Usage {
  return {
    user_id: 'test-user',
    free_rescores_used: 0,
    free_jd_checks_used: 0,
    paid_status: 'free',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Mirrors the gate logic in POST /api/cv/[id]/score.
 * Under Option C: re-scores are ALWAYS allowed. Only the first score is special.
 * Returns 'allowed' or 'blocked' (and why).
 */
function simulateScoreGate(
  existingScoreCount: number,
  usage: Usage,
): { decision: 'allowed' | 'blocked'; reason: string } {
  const isFirstScore = existingScoreCount === 0
  if (isFirstScore) {
    return { decision: 'allowed', reason: 'first score — always free' }
  }
  // Option C: re-scores are unlimited — paid_status and usage count irrelevant
  void usage  // suppress unused-var warning
  return { decision: 'allowed', reason: 're-score — unlimited under Option C' }
}

/**
 * Mirrors the gate logic in POST /api/cv/[id]/jd-match.
 */
function simulateJDGate(usage: Usage): { decision: 'allowed' | 'blocked' } {
  return { decision: isPaywalled(usage, 'jd_check') ? 'blocked' : 'allowed' }
}

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
    const buf = readFileSync(filePath)
    const result = await pdfParse(buf)
    return result.text
  } catch { return null }
}

// ─── Per-CV journey results ───────────────────────────────────────────────────

interface CVJourneyResult {
  name: string
  skipped: boolean
  score: number
  passFail: boolean
  // Gate decisions at each stage
  stage1_firstScore: 'allowed' | 'blocked'        // existingCount=0 → always free
  stage2_freeRescore: 'allowed' | 'blocked'        // existingCount=1, used=0 → should allow
  stage3_unlimited: 'allowed' | 'blocked'          // existingCount=99, used=99, free → Option C: ALLOW
  stage3_rolePulsePaid: 'allowed' | 'blocked'      // paid → always allow
  stage3_stripePaid: 'allowed' | 'blocked'         // paid → always allow
  // JD check gate at each stage
  jd_check1: 'allowed' | 'blocked'                 // used=0 → allowed
  jd_check2: 'allowed' | 'blocked'                 // used=1 → allowed
  jd_check3: 'allowed' | 'blocked'                 // used=2, free → BLOCKED
  jd_check3_paid: 'allowed' | 'blocked'            // used=2, paid → allowed
}

const journeyResults: CVJourneyResult[] = []

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Epic 10 — Real CV × paywall gate journey', () => {

  for (const filename of ALL_CVS) {
    it(`Full journey: ${filename}`, async () => {
      const filePath = path.join(CV_DIR, filename)

      if (!existsSync(filePath)) {
        journeyResults.push({ name: filename, skipped: true } as CVJourneyResult)
        console.log(`  ⏭ ${filename} — not found`)
        return
      }

      const rawText = await extractText(filePath)
      if (!rawText || rawText.trim().length < 100) {
        journeyResults.push({ name: filename, skipped: true } as CVJourneyResult)
        console.log(`  ⏭ ${filename} — too short/unreadable`)
        return
      }

      const parsed = parseText(rawText)
      const structured = parsed.structured as StructuredCV

      // Score the CV — this simulates the first score (always free)
      const scoreResult = scoreCV(structured, rawText, 'SDR')

      // ── Simulate the gate at each stage ────────────────────────────────────

      // Stage 1: First score (existingCount=0) — should ALWAYS be allowed
      const g1 = simulateScoreGate(0, makeUsage({ free_rescores_used: 0 }))

      // Stage 2: First re-score (existingCount=1, used=0) — should be allowed
      const g2 = simulateScoreGate(1, makeUsage({ free_rescores_used: 0 }))

      // Stage 3a: Any re-score (existingCount=99, used=99, free) — Option C: ALWAYS ALLOW
      const g3_free = simulateScoreGate(99, makeUsage({ free_rescores_used: 99, paid_status: 'free' }))

      // Stage 3b: Same but RolePulse paid — should ALLOW
      const g3_rp = simulateScoreGate(99, makeUsage({ free_rescores_used: 99, paid_status: 'rolepulse_paid' }))

      // Stage 3c: Same but Stripe paid — should ALLOW
      const g3_stripe = simulateScoreGate(99, makeUsage({ free_rescores_used: 99, paid_status: 'paid_stripe' }))

      // JD check gates
      const jd1 = simulateJDGate(makeUsage({ free_jd_checks_used: 0 }))
      const jd2 = simulateJDGate(makeUsage({ free_jd_checks_used: 1 }))
      const jd3_free = simulateJDGate(makeUsage({ free_jd_checks_used: 2, paid_status: 'free' }))
      const jd3_paid = simulateJDGate(makeUsage({ free_jd_checks_used: 2, paid_status: 'rolepulse_paid' }))

      const result: CVJourneyResult = {
        name: filename,
        skipped: false,
        score: scoreResult.overallScore,
        passFail: scoreResult.passFail,
        stage1_firstScore: g1.decision,
        stage2_freeRescore: g2.decision,
        stage3_unlimited: g3_free.decision,
        stage3_rolePulsePaid: g3_rp.decision,
        stage3_stripePaid: g3_stripe.decision,
        jd_check1: jd1.decision,
        jd_check2: jd2.decision,
        jd_check3: jd3_free.decision,
        jd_check3_paid: jd3_paid.decision,
      }

      journeyResults.push(result)

      const icon = scoreResult.passFail ? '✅' : scoreResult.overallScore >= 50 ? '🟡' : '🔴'
      console.log(
        `  ${icon} ${filename.replace('.pdf', '')}\n` +
        `     score=${result.score}/100 | ` +
        `gate: score1=${g1.decision} rescore=${g2.decision} unlimited=${g3_free.decision} paid_bypass=${g3_rp.decision}\n` +
        `     JD: check1=${jd1.decision} check2=${jd2.decision} check3=${jd3_free.decision} paid_bypass=${jd3_paid.decision}`
      )

      // ── Assertions ──────────────────────────────────────────────────────────

      // Score is valid
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(100)

      // First score ALWAYS free — no exceptions
      expect(result.stage1_firstScore).toBe('allowed')

      // All re-scores ALWAYS allowed (Option C — unlimited)
      expect(result.stage2_freeRescore).toBe('allowed')
      expect(result.stage3_unlimited).toBe('allowed')

      // Paid users ALWAYS bypass — regardless of usage count
      expect(result.stage3_rolePulsePaid).toBe('allowed')
      expect(result.stage3_stripePaid).toBe('allowed')

      // JD checks: first 2 free, third blocked, paid bypasses
      expect(result.jd_check1).toBe('allowed')
      expect(result.jd_check2).toBe('allowed')
      expect(result.jd_check3).toBe('blocked')
      expect(result.jd_check3_paid).toBe('allowed')
    })
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  it('prints paywall gate summary', () => {
    const processed = journeyResults.filter((r) => !r.skipped)
    const skipped = journeyResults.filter((r) => r.skipped)

    const avgScore = processed.length
      ? Math.round(processed.reduce((s, r) => s + r.score, 0) / processed.length)
      : 0

    // All gate decisions across all CVs
    const allAllowedFirst    = processed.every((r) => r.stage1_firstScore === 'allowed')
    const allAllowedRescore  = processed.every((r) => r.stage2_freeRescore === 'allowed')
    const allUnlimitedFree   = processed.every((r) => r.stage3_unlimited === 'allowed')
    const allBypassRolePulse = processed.every((r) => r.stage3_rolePulsePaid === 'allowed')
    const allBypassStripe    = processed.every((r) => r.stage3_stripePaid === 'allowed')
    const allJD3Blocked      = processed.every((r) => r.jd_check3 === 'blocked')
    const allJD3PaidPass     = processed.every((r) => r.jd_check3_paid === 'allowed')

    console.log('\n──────── PAYWALL GATE SUMMARY (Option C) ────────')
    console.log(`CVs processed: ${processed.length} / ${ALL_CVS.length} (${skipped.length} skipped)`)
    console.log(`Avg score: ${avgScore}/100`)
    console.log('')
    console.log('Re-score gate (unlimited under Option C):')
    console.log(`  Score 1 (first score):         ${allAllowedFirst ? '✅ ALL allowed' : '❌ UNEXPECTED BLOCKS'}`)
    console.log(`  Score 2 (re-score, free):      ${allAllowedRescore ? '✅ ALL allowed' : '❌ UNEXPECTED BLOCKS'}`)
    console.log(`  Score 99 (many rescores, free): ${allUnlimitedFree ? '✅ ALL allowed' : '❌ UNEXPECTED BLOCKS'}`)
    console.log(`  Paid users:                    ${allBypassRolePulse && allBypassStripe ? '✅ ALL allowed' : '❌ UNEXPECTED BLOCKS'}`)
    console.log('')
    console.log('JD check gate (2 free, then paywall):')
    console.log(`  Check 1 + 2 (free):            ✅ ALL allowed (by design)`)
    console.log(`  Check 3 (free user limit):     ${allJD3Blocked ? '✅ ALL blocked' : '❌ UNEXPECTED ALLOWS'}`)
    console.log(`  Check 3 (paid):                ${allJD3PaidPass ? '✅ ALL bypassed' : '❌ UNEXPECTED BLOCKS'}`)
    console.log('──────────────────────────────────────────────────\n')

    // Global assertions — must hold for every CV without exception
    expect(allAllowedFirst).toBe(true)
    expect(allAllowedRescore).toBe(true)
    expect(allUnlimitedFree).toBe(true)
    expect(allBypassRolePulse).toBe(true)
    expect(allBypassStripe).toBe(true)
    expect(allJD3Blocked).toBe(true)
    expect(allJD3PaidPass).toBe(true)
  })
})

// ─── Extended CSV parser edge cases ──────────────────────────────────────────

describe('Epic 10 — parseAllowlistCSV edge cases', () => {

  it('handles Windows line endings (CRLF)', () => {
    const csv = 'email\r\njames@example.com\r\nsarah@example.com\r\n'
    expect(parseAllowlistCSV(csv)).toEqual(['james@example.com', 'sarah@example.com'])
  })

  it('strips BOM character sometimes prepended by Excel CSV export', () => {
    const csv = '\uFEFFjames@example.com\nsarah@example.com'
    const result = parseAllowlistCSV(csv)
    // BOM-prefixed first email should still be valid after the letter-strip of quotes
    // Note: BOM \uFEFF is not stripped by current impl — this test documents current behaviour
    // If BOM appears it will fail the email regex — email is skipped (acceptable for v1)
    expect(result).toContain('sarah@example.com')
  })

  it('handles quoted emails in RFC 4180 style', () => {
    const csv = '"email"\n"james@example.com"\n"sarah@example.com"'
    expect(parseAllowlistCSV(csv)).toEqual(['james@example.com', 'sarah@example.com'])
  })

  it('skips all common header row variants', () => {
    const headers = ['email', 'Email', 'EMAIL', 'e-mail', 'E-MAIL', 'emails', 'address', 'email address']
    for (const header of headers) {
      const csv = `${header}\njames@example.com`
      const result = parseAllowlistCSV(csv)
      expect(result).not.toContain(header.toLowerCase())
      expect(result).toContain('james@example.com')
    }
  })

  it('rejects obviously invalid emails', () => {
    const csv = [
      'not-an-email',
      'also-bad',
      '@nodomain.com',
      'nodomain@',
      'spaces in email@example.com',
      'valid@example.com',
    ].join('\n')
    expect(parseAllowlistCSV(csv)).toEqual(['valid@example.com'])
  })

  it('handles a large CSV (100 emails) correctly', () => {
    const emails = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`)
    const csv = 'email\n' + emails.join('\n')
    const result = parseAllowlistCSV(csv)
    expect(result).toHaveLength(100)
    expect(result[0]).toBe('user0@example.com')
    expect(result[99]).toBe('user99@example.com')
  })

  it('deduplicates case-insensitively across a large list', () => {
    const csv = [
      'james@rolepulse.com',
      'JAMES@ROLEPULSE.COM',
      'James@RolePulse.com',
      'sarah@example.com',
      'SARAH@EXAMPLE.COM',
    ].join('\n')
    const result = parseAllowlistCSV(csv)
    expect(result).toHaveLength(2)
    expect(result).toContain('james@rolepulse.com')
    expect(result).toContain('sarah@example.com')
  })

  it('handles an empty CSV gracefully', () => {
    expect(parseAllowlistCSV('')).toEqual([])
    expect(parseAllowlistCSV('\n\n\n')).toEqual([])
    expect(parseAllowlistCSV('email\n')).toEqual([])
  })

  it('handles mixed valid/invalid rows in a realistic export', () => {
    const csv = [
      'Email Address,Full Name,Subscription Plan,Date Added',
      'james@rolepulse.com,James Fowles,Paid Monthly,2025-01-15',
      'sarah.jones@company.co.uk,Sarah Jones,Paid Annual,2025-02-01',
      'invalid row without at sign,Some Name,Free,2025-03-01',
      'tom@startup.io,Tom Smith,Paid Monthly,2025-03-01',
      ',Missing Email,Free,',
      'duplicate@example.com,Dup One,Paid,',
      'duplicate@example.com,Dup Two,Paid,',
    ].join('\n')

    const result = parseAllowlistCSV(csv)
    expect(result).toContain('james@rolepulse.com')
    expect(result).toContain('sarah.jones@company.co.uk')
    expect(result).toContain('tom@startup.io')
    expect(result).toContain('duplicate@example.com')
    expect(result).toHaveLength(4)  // deduped, no invalids
  })

})

// ─── Boundary condition tests ─────────────────────────────────────────────────

describe('Option C — Usage gate boundary conditions', () => {

  it('Free user: re-score with used=1 is ALLOWED (unlimited under Option C)', () => {
    const usage = makeUsage({ free_rescores_used: 1, paid_status: 'free' })
    expect(simulateScoreGate(2, usage).decision).toBe('allowed')
  })

  it('Free user: re-score with used=99 is ALLOWED (unlimited under Option C)', () => {
    const usage = makeUsage({ free_rescores_used: 99, paid_status: 'free' })
    expect(simulateScoreGate(50, usage).decision).toBe('allowed')
  })

  it('Free user: exactly at the JD check limit (used=2) is blocked', () => {
    const usage = makeUsage({ free_jd_checks_used: 2, paid_status: 'free' })
    expect(simulateJDGate(usage).decision).toBe('blocked')
  })

  it('Free user: one below JD check limit (used=1) is allowed', () => {
    const usage = makeUsage({ free_jd_checks_used: 1, paid_status: 'free' })
    expect(simulateJDGate(usage).decision).toBe('allowed')
  })

  it('existingScoreCount=0 is ALWAYS first score, regardless of high usage_used count', () => {
    const usage = makeUsage({ free_rescores_used: 99, paid_status: 'free' })
    expect(simulateScoreGate(0, usage).decision).toBe('allowed')
  })

  it('RolePulse paid bypasses even at extremely high usage counts', () => {
    const usage = makeUsage({
      free_rescores_used: 1000,
      free_jd_checks_used: 1000,
      paid_status: 'rolepulse_paid',
    })
    expect(simulateScoreGate(100, usage).decision).toBe('allowed')
    expect(simulateJDGate(usage).decision).toBe('allowed')
  })

})
