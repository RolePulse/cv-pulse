// Quick diagnostic: re-parse all raw_text from DB CVs and show results
// Run: npx tsx scripts/test-real-cvs.ts

import { parseText } from '../src/lib/parser'
import * as fs from 'fs'

const cvs = JSON.parse(fs.readFileSync('/tmp/cv_raw.json', 'utf-8')) as Array<{
  id: string
  raw_text: string
}>

let passed = 0
let issues = 0

for (const cv of cvs) {
  const rawPreview = (cv.raw_text || '').slice(0, 60).replace(/\n/g, ' ')
  const result = parseText(cv.raw_text || '')
  const exp = result.structured.experience
  const totalBullets = exp.reduce((n, r) => n + r.bullets.length, 0)
  const emptyCompanies = exp.filter(r => !r.company?.trim()).length
  const emptyTitles = exp.filter(r => !r.title?.trim()).length
  const bulletLookingCompanies = exp.filter(r => r.company?.startsWith('●') || r.company?.startsWith('•')).length
  const titleLookingCompanies = exp.filter(r => /\b(executive|manager|director|analyst|associate|representative|engineer|specialist|coordinator)\b/i.test(r.company || '')).length

  const ok = exp.length > 0 && bulletLookingCompanies === 0 && titleLookingCompanies === 0
  if (ok) passed++; else issues++

  const statusIcon = ok ? '✅' : '❌'
  console.log(`\n${statusIcon} ${cv.id.slice(0, 8)}`)
  console.log(`   Preview: "${rawPreview}"`)
  console.log(`   Roles: ${exp.length} | Bullets: ${totalBullets} | EmptyCompany: ${emptyCompanies} | EmptyTitle: ${emptyTitles}`)
  if (bulletLookingCompanies > 0) console.log(`   ⚠️  BULLET-AS-COMPANY: ${bulletLookingCompanies} roles`)
  if (titleLookingCompanies > 0) console.log(`   ⚠️  JOB-TITLE-AS-COMPANY: ${titleLookingCompanies} roles`)

  for (const r of exp) {
    const bulletFlag = r.company?.startsWith('●') || r.company?.startsWith('•') ? ' ⚠️BULLET' : ''
    const titleFlag = /\b(executive|manager|director|analyst|associate|representative|engineer|specialist|coordinator)\b/i.test(r.company || '') ? ' ⚠️TITLE' : ''
    console.log(`     [${r.start}] title="${r.title?.slice(0, 35)}" | company="${r.company?.slice(0, 35)}"${bulletFlag}${titleFlag} | bullets=${r.bullets.length}`)
  }
}

console.log(`\n${'─'.repeat(60)}`)
console.log(`RESULT: ${passed}/${cvs.length} CVs look correct | ${issues} with issues`)
