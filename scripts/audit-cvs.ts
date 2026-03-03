// Audit: for each CV, count bullet lines in raw_text, compare to what parser extracts.
// Also LLM-style check: read raw_text, count expected roles + bullets manually.
// Run: npx tsx scripts/audit-cvs.ts

import { parseText } from '../src/lib/parser'
import * as fs from 'fs'

const BULLET_RE = /^[\s]*[•\-\*▪▸◦→·✓➤➢●○▶£►–—]\s*.{5,}/
const DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\w*[\s,.\-]+\d{4}/i

function countRawBullets(raw: string): number {
  return raw.split('\n').filter(l => BULLET_RE.test(l)).length
}

function countRawRoles(raw: string): number {
  // Count distinct date-range lines as a proxy for roles
  const lines = raw.split('\n')
  let count = 0
  for (const line of lines) {
    if (DATE_RE.test(line) && (line.includes('–') || line.includes('-') || /present/i.test(line) || /current/i.test(line))) {
      count++
    }
  }
  return count
}

const cvs = JSON.parse(fs.readFileSync('/tmp/cv_raw.json', 'utf-8')) as Array<{
  id: string
  raw_text: string
}>

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('CV PARSER AUDIT — comparing raw_text content vs parsed output')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

let totalOk = 0
let totalIssues = 0

for (const cv of cvs) {
  const raw = cv.raw_text || ''
  const parsed = parseText(raw)
  const exp = parsed.structured.experience

  const rawBullets = countRawBullets(raw)
  const rawRoleDates = countRawRoles(raw)
  const parsedBullets = exp.reduce((n, r) => n + r.bullets.length, 0)
  const parsedRoles = exp.length

  const bulletDelta = rawBullets - parsedBullets
  const roleDelta = rawRoleDates - parsedRoles

  const bulletOk = bulletDelta <= 2
  const roleOk = Math.abs(roleDelta) <= 1
  const ok = bulletOk && roleOk

  if (ok) totalOk++; else totalIssues++

  const icon = ok ? '✅' : '❌'
  const rawPreview = raw.slice(0, 80).replace(/\n/g, ' ').trim()

  console.log(`${icon} ${cv.id.slice(0, 8)} — "${rawPreview.slice(0, 60)}"`)
  console.log(`   Raw:    ~${rawRoleDates} role dates | ${rawBullets} bullet lines`)
  console.log(`   Parsed: ${parsedRoles} roles       | ${parsedBullets} bullets extracted`)
  if (!bulletOk) console.log(`   ⚠️  MISSING ${bulletDelta} BULLETS`)
  if (!roleOk)   console.log(`   ⚠️  ROLE COUNT MISMATCH (delta ${roleDelta})`)

  // Show each parsed role
  for (const r of exp) {
    const missingBullets = r.bullets.length === 0 && rawBullets > 0 ? ' ← no bullets!' : ''
    console.log(`      [${r.start}] "${r.title?.slice(0,35)}" @ "${r.company?.slice(0,30)}" | ${r.bullets.length} bullets${missingBullets}`)
  }

  // Show raw bullet lines that weren't captured (if any missing)
  if (!bulletOk) {
    const capturedBullets = new Set(exp.flatMap(r => r.bullets.map(b => b.trim())))
    const rawLines = raw.split('\n')
    const missingLines = rawLines.filter(l => BULLET_RE.test(l) && !capturedBullets.has(l.replace(/^[\s•\-\*▪▸◦→·✓➤➢●○▶£►–—\s]+/, '').trim()))
    if (missingLines.length > 0) {
      console.log('   Missing bullets from raw:')
      missingLines.slice(0, 5).forEach(l => console.log(`      → "${l.trim().slice(0, 80)}"`) )
      if (missingLines.length > 5) console.log(`      ... and ${missingLines.length - 5} more`)
    }
  }
  console.log()
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`RESULT: ${totalOk}/${cvs.length} CVs audit-passing | ${totalIssues} with bullet/role count issues`)
