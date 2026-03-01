// CV Pulse — Qualitative scorer output
// Prints human-readable fix text, keywords, and bucket detail for manual review
// Run: npx tsx scripts/qualify-scorer.ts

import { scoreCV } from '../src/lib/scorer'
import { parseCV } from '../src/lib/parser'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { TargetRole } from '../src/lib/roleDetect'
import { ROLE_LABELS } from '../src/lib/roleDetect'

const downloads = join(process.env.HOME!, 'Downloads')
const role: TargetRole = 'CSM'
const SEP = '═'.repeat(70)

const files = readdirSync(downloads)
  .filter(f => f.toLowerCase().endsWith('.pdf'))
  .filter(f => ['cv', 'resume'].some(k => f.toLowerCase().includes(k)))
  .filter(f => !['invoice','receipt','order','assessment','brief','quiz','worksheet'].some(k => f.toLowerCase().includes(k)))
  .slice(0, 6)

async function main() {
  console.log(`\nRole being scored against: ${ROLE_LABELS[role]}\n`)

  for (const file of files) {
    const buf = readFileSync(join(downloads, file))
    const parsed = await parseCV(buf)

    if (parsed.confidence < 40) {
      console.log(`SKIPPED: ${file} (confidence ${parsed.confidence})\n`)
      continue
    }

    const r = scoreCV(parsed.structured, parsed.rawText, role)

    console.log(SEP)
    console.log(`FILE:  ${file}`)
    console.log(`SCORE: ${r.overallScore}/100 | ${r.passFail ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`       Impact ${r.buckets.proofOfImpact.score}/35 · ATS ${r.buckets.atsKeywords.score}/25 · Format ${r.buckets.formatting.score}/20 · Clarity ${r.buckets.clarity.score}/20`)

    if (r.criticalConcerns.length) {
      console.log(`\n⛔ CRITICAL CONCERNS:`)
      r.criticalConcerns.forEach(c => console.log(`   - ${c}`))
    }

    const unfixed = r.checklist.filter(i => !i.done).sort((a,b) => b.potentialPoints - a.potentialPoints)
    console.log(`\n🔧 FIXES SHOWN TO USER (${unfixed.length} total, showing top 5):`)
    unfixed.slice(0, 5).forEach((f, i) => {
      console.log(`\n   ${i+1}. [${f.category} · up to +${f.potentialPoints} pts]`)
      console.log(`      ACTION: ${f.action}`)
      console.log(`      WHY:    ${f.whyItMatters}`)
    })

    console.log(`\n🔑 KEYWORDS (${r.keywordData.matched.length}/${r.keywordData.total} matched):`)
    console.log(`   ✅ ${r.keywordData.matched.length > 0 ? r.keywordData.matched.join(', ') : 'none'}`)
    console.log(`   ❌ ${r.keywordData.missing.slice(0,12).join(', ')}${r.keywordData.missing.length > 12 ? `... (+${r.keywordData.missing.length-12} more)` : ''}`)

    const allIssues = [
      ...r.buckets.proofOfImpact.issues.map(i => `[impact] ${i}`),
      ...r.buckets.atsKeywords.issues.map(i => `[ats] ${i}`),
      ...r.buckets.formatting.issues.map(i => `[format] ${i}`),
      ...r.buckets.clarity.issues.map(i => `[clarity] ${i}`),
    ]
    if (allIssues.length) {
      console.log(`\n📋 BUCKET ISSUES:`)
      allIssues.forEach(i => console.log(`   - ${i}`))
    }

    const allWins = [
      ...r.buckets.proofOfImpact.positives.map(i => `[impact] ${i}`),
      ...r.buckets.atsKeywords.positives.map(i => `[ats] ${i}`),
      ...r.buckets.formatting.positives.map(i => `[format] ${i}`),
      ...r.buckets.clarity.positives.map(i => `[clarity] ${i}`),
    ]
    if (allWins.length) {
      console.log(`\n✨ WHAT'S GOOD:`)
      allWins.forEach(i => console.log(`   + ${i}`))
    }
    console.log()
  }

  console.log(SEP)
  console.log('Done — review outputs above for accuracy/helpfulness')
}

main().catch(console.error)
