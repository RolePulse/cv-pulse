/**
 * parser-audit.ts
 * Full batch sweep of all PDFs in ~/Downloads.
 * Flags every issue class — zero roles, summary overflow, missing fields, date anomalies, etc.
 * Run: npx tsx scripts/parser-audit.ts
 */

import fs from 'fs'
import path from 'path'
import { parseCV, CONFIDENCE_THRESHOLD } from '../src/lib/parser'

const DOWNLOADS = path.join(process.env.HOME!, 'Downloads')
const SUMMARY_OVERFLOW_CHARS = 600   // summary longer than this is suspicious
const LOW_ROLES_THRESHOLD = 1        // only 1 role detected — often a parse failure

interface IssueRecord {
  file: string
  issues: string[]
  confidence: number
  roleCount: number
  summaryLength: number
  notes: string
}

function detectIssues(
  file: string,
  parsed: Awaited<ReturnType<typeof parseCV>>,
): IssueRecord {
  const issues: string[] = []
  const notes: string[] = []

  const s = parsed.structured
  const roles = s?.experience ?? []
  const summary = s?.summary ?? ''
  const summaryLen = summary.length

  // ── Confidence gate ──────────────────────────────────────────────────────
  if (parsed.confidence < CONFIDENCE_THRESHOLD) {
    issues.push(`CONFIDENCE_FAIL (${parsed.confidence}) — ${parsed.failReason ?? 'unknown'}`)
    return { file, issues, confidence: parsed.confidence, roleCount: 0, summaryLength: summaryLen, notes: parsed.failReason ?? '' }
  }

  // ── Zero roles ────────────────────────────────────────────────────────────
  if (roles.length === 0) {
    issues.push('ZERO_ROLES — no work experience extracted')
  }

  // ── Summary overflow ─────────────────────────────────────────────────────
  if (summaryLen > SUMMARY_OVERFLOW_CHARS) {
    issues.push(`SUMMARY_OVERFLOW — summary is ${summaryLen} chars (likely section content leaked in)`)
  }

  // ── Only 1 role (often means multi-role CVs collapsed) ───────────────────
  if (roles.length === LOW_ROLES_THRESHOLD) {
    issues.push('LOW_ROLE_COUNT — only 1 role extracted (may be missing roles)')
  }

  // ── Roles with missing title or company ──────────────────────────────────
  for (const role of roles) {
    const roleTitle = role.title?.trim() ?? ''
    const roleCompany = role.company?.trim() ?? ''
    if (!roleTitle && !roleCompany) {
      issues.push('ROLE_MISSING_TITLE_AND_COMPANY — role with neither title nor company')
    } else if (!roleTitle) {
      issues.push(`ROLE_MISSING_TITLE — role at "${roleCompany}" has no title`)
    } else if (!roleCompany) {
      issues.push(`ROLE_MISSING_COMPANY — role "${roleTitle}" has no company`)
    }
  }

  // ── Roles where title looks like it should be a company (or vice versa) ──
  for (const role of roles) {
    const t = role.title?.toLowerCase() ?? ''
    const c = role.company?.toLowerCase() ?? ''
    // Title contains "inc", "llc", "ltd", "corp" — likely swapped
    if (/\b(inc|llc|ltd|corp|co\.|company|technologies|solutions|group|services)\b/.test(t)) {
      issues.push(`TITLE_LOOKS_LIKE_COMPANY — title "${role.title}" looks like a company name`)
    }
    // Company looks like a job title (but not something like "Sales Company LLC")
    if (/\b(manager|director|executive|engineer|analyst|consultant|specialist|coordinator|associate|president|vp|ceo|cto|cfo|head of|lead|senior|junior)\b/.test(c) && !/\b(inc|llc|ltd|corp|co\.|company|technologies|solutions|group|services)\b/.test(c)) {
      issues.push(`COMPANY_LOOKS_LIKE_TITLE — company "${role.company}" looks like a job title`)
    }
  }

  // ── Date anomalies (start/end are the real field names) ──────────────────
  for (const role of roles) {
    const start = role.start ?? ''
    const end = role.end ?? ''
    // Check for placeholder/garbage dates
    if (start && !/^\d{4}(-\d{2})?$/.test(start) && !/^(present|current|now)$/i.test(start)) {
      issues.push(`DATE_ANOMALY — start "${start}" for role "${role.title}"`)
    }
    if (end && end !== null && !/^\d{4}(-\d{2})?$/.test(end) && !/^(present|current|now)$/i.test(end)) {
      issues.push(`DATE_ANOMALY — end "${end}" for role "${role.title}"`)
    }
    // Start after end (impossible date range)
    if (start && end && end !== null && !/^(present|current|now)$/i.test(end)) {
      const sy = parseInt(start.slice(0, 4))
      const ey = parseInt(end.slice(0, 4))
      if (!isNaN(sy) && !isNaN(ey) && sy > ey) {
        issues.push(`DATE_INVERTED — start ${start} is after end ${end} for "${role.title}"`)
      }
    }
    // Zero bullets on a non-current role (may indicate parsing stopped too early)
    if ((!role.bullets || role.bullets.length === 0) && end !== null) {
      issues.push(`ROLE_NO_BULLETS — "${role.title}" at "${role.company}" has no bullet points`)
    }
  }

  // ── Duplicate roles ───────────────────────────────────────────────────────
  const roleKeys = roles.map(r => `${r.title?.trim()}|${r.company?.trim()}|${r.start}`)
  const seen = new Set<string>()
  for (const key of roleKeys) {
    if (seen.has(key)) {
      issues.push(`DUPLICATE_ROLE — "${key}" appears more than once`)
    }
    seen.add(key)
  }

  // ── Education OK check ────────────────────────────────────────────────────
  const edu = s?.education ?? []
  if (edu.length === 0) {
    notes.push('no education extracted (may be intentional)')
  }

  return {
    file,
    issues,
    confidence: parsed.confidence,
    roleCount: roles.length,
    summaryLength: summaryLen,
    notes: notes.join('; '),
  }
}

async function main() {
  const allFiles = fs.readdirSync(DOWNLOADS)
  const pdfs = allFiles
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(DOWNLOADS, f))

  console.log(`Found ${pdfs.length} PDFs in Downloads\n`)

  const results: IssueRecord[] = []
  let processed = 0
  let errored = 0

  for (const filePath of pdfs) {
    const fileName = path.basename(filePath)
    try {
      const buffer = fs.readFileSync(filePath)
      const parsed = await parseCV(buffer)
      const record = detectIssues(fileName, parsed)
      results.push(record)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({
        file: fileName,
        issues: [`PARSE_EXCEPTION — ${msg.slice(0, 120)}`],
        confidence: 0,
        roleCount: 0,
        summaryLength: 0,
        notes: '',
      })
      errored++
    }

    processed++
    if (processed % 50 === 0) {
      process.stdout.write(`  Processed ${processed}/${pdfs.length}...\n`)
    }
  }

  // ── Summary stats ─────────────────────────────────────────────────────────
  const withIssues = results.filter(r => r.issues.length > 0)
  const clean = results.filter(r => r.issues.length === 0)
  const zeroRoles = results.filter(r => r.issues.some(i => i.startsWith('ZERO_ROLES')))
  const summaryOverflow = results.filter(r => r.issues.some(i => i.startsWith('SUMMARY_OVERFLOW')))
  const confidenceFail = results.filter(r => r.issues.some(i => i.startsWith('CONFIDENCE_FAIL')))
  const parseException = results.filter(r => r.issues.some(i => i.startsWith('PARSE_EXCEPTION')))
  const swapped = results.filter(r => r.issues.some(i => i.includes('LOOKS_LIKE')))
  const dateIssues = results.filter(r => r.issues.some(i => i.startsWith('DATE_')))
  const missingField = results.filter(r => r.issues.some(i => i.startsWith('ROLE_MISSING') || i.startsWith('MISSING_NAME')))
  const lowRoles = results.filter(r => r.issues.some(i => i.startsWith('LOW_ROLE')))

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  CV PULSE PARSER AUDIT REPORT')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Total PDFs tested:      ${pdfs.length}`)
  console.log(`  Clean (no issues):      ${clean.length} (${Math.round(clean.length / pdfs.length * 100)}%)`)
  console.log(`  With issues:            ${withIssues.length} (${Math.round(withIssues.length / pdfs.length * 100)}%)`)
  console.log('')
  console.log('  Issue breakdown:')
  console.log(`    CONFIDENCE_FAIL:      ${confidenceFail.length}`)
  console.log(`    ZERO_ROLES:           ${zeroRoles.length}`)
  console.log(`    SUMMARY_OVERFLOW:     ${summaryOverflow.length}`)
  console.log(`    LOW_ROLE_COUNT:       ${lowRoles.length}`)
  console.log(`    MISSING FIELDS:       ${missingField.length}`)
  console.log(`    TITLE/CO SWAPPED:     ${swapped.length}`)
  console.log(`    DATE ANOMALIES:       ${dateIssues.length}`)
  console.log(`    PARSE_EXCEPTION:      ${parseException.length}`)
  console.log('═══════════════════════════════════════════════════════════\n')

  // ── Full detail output (issues only) ─────────────────────────────────────
  if (withIssues.length > 0) {
    console.log('DETAILED ISSUES:\n')
    for (const r of withIssues) {
      console.log(`▶ ${r.file}`)
      console.log(`  Confidence: ${r.confidence} | Roles: ${r.roleCount} | Summary chars: ${r.summaryLength}`)
      for (const issue of r.issues) {
        console.log(`  ⚠ ${issue}`)
      }
      if (r.notes) console.log(`  ℹ ${r.notes}`)
      console.log('')
    }
  }

  // Write JSON for further analysis
  const outPath = path.join(process.cwd(), 'scripts/parser-audit-results.json')
  fs.writeFileSync(outPath, JSON.stringify({ stats: { total: pdfs.length, clean: clean.length, withIssues: withIssues.length }, results }, null, 2))
  console.log(`\nFull JSON results written to: ${outPath}`)
}

main().catch(console.error)
