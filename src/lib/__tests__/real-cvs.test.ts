// CV Pulse — Real CV integration tests
// Runs all CVs from Downloads through the full pipeline:
// PDF parse → structuredCV → score → fix detection → apply fixes → re-score
// Reports: confidence, score, fix count, any crashes, and score drift after fixes.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>
import { parseText } from '@/lib/parser'
import { scoreCV } from '@/lib/scorer'
import { detectAvailableFixes, applyFix } from '@/lib/cvFixes'
import { structuredToRawText } from '@/lib/structuredToRawText'
import type { StructuredCV } from '@/types/database'

// ─── CV files ─────────────────────────────────────────────────────────────────

const CV_DIR = path.join(process.env.HOME ?? '/Users/jamesfowles', 'Downloads')

const CV_FILES = [
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
  // Password-protected — will skip if parse fails
  'PiyushP_ResumeWPassword.pdf',
]

// ─── Helper ───────────────────────────────────────────────────────────────────

async function extractText(filePath: string): Promise<string | null> {
  try {
    const buffer = readFileSync(filePath)
    const result = await pdfParse(buffer)
    return result.text
  } catch {
    return null // password-protected or corrupt
  }
}

// ─── Results collector ────────────────────────────────────────────────────────

interface CVResult {
  name: string
  skipped: boolean
  skipReason?: string
  confidence: number
  rawTextLength: number
  roles: number
  score: number
  passFail: boolean
  criticalConcerns: string[]
  fixesDetected: string[]
  scoreAfterFixes: number
  scoreDrift: number
  errors: string[]
}

const results: CVResult[] = []

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Real CV pipeline — all CVs in Downloads', () => {

  // Run each CV through the full pipeline
  for (const filename of CV_FILES) {
    it(`${filename}`, async () => {
      const filePath = path.join(CV_DIR, filename)
      const result: CVResult = {
        name: filename,
        skipped: false,
        confidence: 0,
        rawTextLength: 0,
        roles: 0,
        score: 0,
        passFail: false,
        criticalConcerns: [],
        fixesDetected: [],
        scoreAfterFixes: 0,
        scoreDrift: 0,
        errors: [],
      }

      // Skip if file doesn't exist
      if (!existsSync(filePath)) {
        result.skipped = true
        result.skipReason = 'File not found'
        results.push(result)
        console.log(`  ⏭ ${filename} — not found, skipping`)
        return
      }

      // Extract text from PDF
      const rawText = await extractText(filePath)
      if (!rawText || rawText.trim().length < 100) {
        result.skipped = true
        result.skipReason = rawText === null ? 'Password-protected or corrupt' : 'Too short to parse'
        results.push(result)
        console.log(`  ⏭ ${filename} — ${result.skipReason}`)
        return
      }
      result.rawTextLength = rawText.length

      // Parse
      let parsed: ReturnType<typeof parseText>
      try {
        parsed = parseText(rawText)
      } catch (e) {
        result.errors.push(`parseText crashed: ${String(e)}`)
        results.push(result)
        console.error(`  ❌ ${filename} — parseText crashed`)
        throw e
      }

      result.confidence = parsed.confidence
      result.roles = parsed.structured.experience?.length ?? 0

      // Score — use SDR as default target (most of these are GTM CVs)
      // Use structuredToRawText for BOTH baseline and post-fix scoring.
      // This is the apples-to-apples comparison: same text derivation both times.
      // (The original PDF raw text score is shown for reference but NOT asserted against,
      // because information lost during parse can't be recovered by fixes.)
      const structured = parsed.structured as StructuredCV
      const structuredRaw = structuredToRawText(structured)

      let pdfScoreResult: ReturnType<typeof scoreCV>
      let baselineResult: ReturnType<typeof scoreCV>
      try {
        pdfScoreResult = scoreCV(structured, rawText, 'SDR')          // original PDF text
        baselineResult = scoreCV(structured, structuredRaw, 'SDR')    // structured round-trip (baseline for fix comparison)
      } catch (e) {
        result.errors.push(`scoreCV crashed: ${String(e)}`)
        results.push(result)
        console.error(`  ❌ ${filename} — scoreCV crashed`)
        throw e
      }

      result.score = pdfScoreResult.overallScore    // shown in report (PDF-based)
      result.passFail = pdfScoreResult.passFail
      result.criticalConcerns = pdfScoreResult.criticalConcerns

      // Detect fixes
      let fixes: ReturnType<typeof detectAvailableFixes>
      try {
        fixes = detectAvailableFixes(structured)
        result.fixesDetected = fixes.map((f) => f.id)
      } catch (e) {
        result.errors.push(`detectAvailableFixes crashed: ${String(e)}`)
        results.push(result)
        console.error(`  ❌ ${filename} — detectAvailableFixes crashed`)
        throw e
      }

      // Apply all detected fixes in sequence
      let fixedCV = structured
      for (const fix of fixes) {
        try {
          fixedCV = applyFix(fixedCV, fix.id)
        } catch (e) {
          result.errors.push(`applyFix(${fix.id}) crashed: ${String(e)}`)
          console.error(`  ❌ ${filename} — applyFix(${fix.id}) crashed`)
          throw e
        }
      }

      // Re-score after fixes — using structuredToRawText (same derivation as baseline)
      let fixedScore: ReturnType<typeof scoreCV>
      try {
        const fixedRaw = structuredToRawText(fixedCV)
        fixedScore = scoreCV(fixedCV, fixedRaw, 'SDR')
        result.scoreAfterFixes = fixedScore.overallScore
        result.scoreDrift = fixedScore.overallScore - baselineResult.overallScore  // compare baseline → fixed
      } catch (e) {
        result.errors.push(`re-score after fixes crashed: ${String(e)}`)
        console.error(`  ❌ ${filename} — re-score after fixes crashed`)
        throw e
      }

      // Flag CVs where the parse round-trip itself causes a score drop vs original PDF score
      const roundTripDrift = baselineResult.overallScore - pdfScoreResult.overallScore
      const roundTripWarning = roundTripDrift < -2
        ? ` ⚠️ PARSE GAP: round-trip loses ${Math.abs(roundTripDrift)}pts vs PDF score (parser missed skills/content)`
        : ''

      results.push(result)

      const icon = result.passFail ? '✅' : result.score >= 50 ? '🟡' : '🔴'
      console.log(
        `  ${icon} ${filename.replace('.pdf', '')}\n` +
        `     confidence=${result.confidence}% | roles=${result.roles}\n` +
        `     PDF score: ${result.score} | structured baseline: ${baselineResult.overallScore} | after fixes: ${result.scoreAfterFixes} (drift vs baseline: ${result.scoreDrift >= 0 ? '+' : ''}${result.scoreDrift})` +
        roundTripWarning + '\n' +
        `     fixes=[${result.fixesDetected.join(', ') || 'none'}]` +
        (result.criticalConcerns.length ? `\n     critical=[${result.criticalConcerns.join('; ')}]` : '')
      )

      // Assertions — the pipeline must not crash, and results must be sane
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(100)
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(100)
      expect(result.scoreAfterFixes).toBeGreaterThanOrEqual(0)
      expect(result.scoreAfterFixes).toBeLessThanOrEqual(100)
      // Applying fixes must never make the structured-text score worse (apples-to-apples)
      expect(result.scoreAfterFixes).toBeGreaterThanOrEqual(baselineResult.overallScore)
      expect(result.errors).toHaveLength(0)
    })
  }

  // Summary report printed after all CVs
  it('prints summary report', () => {
    const processed = results.filter((r) => !r.skipped)
    const skipped = results.filter((r) => r.skipped)
    const passing = processed.filter((r) => r.passFail)
    const avgScore = processed.length
      ? Math.round(processed.reduce((sum, r) => sum + r.score, 0) / processed.length)
      : 0
    const avgConfidence = processed.length
      ? Math.round(processed.reduce((sum, r) => sum + r.confidence, 0) / processed.length)
      : 0
    const withFixes = processed.filter((r) => r.fixesDetected.length > 0)
    const avgDrift = withFixes.length
      ? Math.round(withFixes.reduce((sum, r) => sum + r.scoreDrift, 0) / withFixes.length * 10) / 10
      : 0

    console.log('\n─────────── REAL CV SUMMARY ───────────')
    console.log(`CVs processed:  ${processed.length} / ${CV_FILES.length} (${skipped.length} skipped)`)
    console.log(`Avg confidence: ${avgConfidence}%`)
    console.log(`Avg score:      ${avgScore}/100`)
    console.log(`Pass rate:      ${passing.length}/${processed.length} CVs scored 70+ with no critical concerns`)
    console.log(`Fixes applied:  ${withFixes.length}/${processed.length} CVs had at least one fix`)
    console.log(`Avg score drift after fixes: +${avgDrift} pts`)

    // Fix frequency breakdown
    const fixFrequency: Record<string, number> = {}
    for (const r of processed) {
      for (const fix of r.fixesDetected) {
        fixFrequency[fix] = (fixFrequency[fix] ?? 0) + 1
      }
    }
    console.log('\nFix frequency:')
    for (const [fix, count] of Object.entries(fixFrequency).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${fix}: ${count}/${processed.length} CVs`)
    }

    // Flag any CVs with issues
    const lowConfidence = processed.filter((r) => r.confidence < 50)
    if (lowConfidence.length > 0) {
      console.log(`\n⚠️  Low confidence (<50%): ${lowConfidence.map((r) => r.name).join(', ')}`)
    }
    const negativeDrift = processed.filter((r) => r.scoreDrift < 0)
    if (negativeDrift.length > 0) {
      console.log(`\n⚠️  Score regression after fixes: ${negativeDrift.map((r) => `${r.name} (${r.scoreDrift})`).join(', ')}`)
    }

    console.log('───────────────────────────────────────\n')

    // The summary test just verifies the report ran
    expect(processed.length).toBeGreaterThan(0)
  })
})
