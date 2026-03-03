/**
 * inspect-parse.ts
 * Usage: npx tsx scripts/inspect-parse.ts /path/to/cv.pdf
 *
 * Prints:
 *   1. Raw extracted text (what pdf-parse gives us before parsing)
 *   2. The structured output (roles, bullets, skills, education)
 *   3. Side-by-side diff view — raw text lines with a flag showing
 *      which bullets were captured vs missed
 */

import { readFileSync } from 'fs'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>

import { cleanText, detectSections, extractExperience } from '../src/lib/parser'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: npx tsx scripts/inspect-parse.ts /path/to/cv.pdf')
  process.exit(1)
}

async function main() {
  const buf = readFileSync(path.resolve(filePath))
  const { text: rawText } = await pdfParse(buf)
  const cleaned = cleanText(rawText)
  const sections = detectSections(cleaned)
  const experienceText = sections.experience ?? ''
  const roles = extractExperience(experienceText)

  console.log('\n' + '═'.repeat(80))
  console.log('RAW TEXT (full, from pdf-parse)')
  console.log('═'.repeat(80))
  console.log(rawText)

  console.log('\n' + '═'.repeat(80))
  console.log('CLEANED TEXT')
  console.log('═'.repeat(80))
  console.log(cleaned)

  console.log('\n' + '═'.repeat(80))
  console.log('DETECTED SECTIONS (keys)')
  console.log('═'.repeat(80))
  console.log(Object.keys(sections))

  console.log('\n' + '═'.repeat(80))
  console.log('EXPERIENCE SECTION TEXT (what the parser sees)')
  console.log('═'.repeat(80))
  console.log(experienceText || '(none detected)')

  console.log('\n' + '═'.repeat(80))
  console.log(`PARSED ROLES (${roles.length})`)
  console.log('═'.repeat(80))

  roles.forEach((role, i) => {
    console.log(`\n[Role ${i + 1}]`)
    console.log(`  Title:   ${role.title || '(none)'}`)
    console.log(`  Company: ${role.company || '(none)'}`)
    console.log(`  Start:   ${role.start}`)
    console.log(`  End:     ${role.end ?? 'Present'}`)
    console.log(`  Bullets: ${role.bullets.length}`)
    role.bullets.forEach((b, bi) => {
      console.log(`    ${bi + 1}. ${b}`)
    })
  })

  // ── Bullet coverage check ──────────────────────────────────────────────────
  // Find all lines in the experience text that look like bullets
  const BULLET_RE = /^[\s]*[•\-\*▪▸◦→·✓➤➢●○▶£►–—]\s*.{10,}/

  const rawBulletLines = experienceText
    .split('\n')
    .filter(l => BULLET_RE.test(l))
    .map(l => l.trim().replace(/^[•\-\*▪▸◦→·✓➤➢●○▶£►–—\s]+/, '').trim())

  const capturedBullets = roles.flatMap(r => r.bullets)

  console.log('\n' + '═'.repeat(80))
  console.log('BULLET COVERAGE CHECK')
  console.log('═'.repeat(80))
  console.log(`Raw bullet lines in experience section: ${rawBulletLines.length}`)
  console.log(`Bullets captured in roles:              ${capturedBullets.length}`)
  console.log('')

  const missed: string[] = []
  rawBulletLines.forEach(raw => {
    // Check if any captured bullet is a substring match (parser may strip prefix chars)
    const found = capturedBullets.some(c =>
      c.includes(raw.slice(0, 30)) || raw.includes(c.slice(0, 30))
    )
    if (!found) {
      missed.push(raw)
      console.log(`  MISSED: ${raw.slice(0, 100)}`)
    }
  })

  if (missed.length === 0) {
    console.log('  ✅ All raw bullet lines accounted for in parsed roles')
  } else {
    console.log(`\n  ⚠️  ${missed.length} bullet lines in the raw text were NOT captured`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
