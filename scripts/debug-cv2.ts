import { extractExperience, DATE_RANGE_RE, cleanText, isBulletLine } from '../src/lib/parser'
import { readFileSync } from 'fs'
const pdfParse = require('../node_modules/pdf-parse/lib/pdf-parse.js')

async function main() {
  const name = process.argv[2]
  const buf = readFileSync(process.env.HOME + '/Downloads/' + name)
  const data = await pdfParse(buf)
  const rawText = cleanText(data.text)
  const lines = rawText.split('\n').map((l: string) => l.trimEnd())

  console.log(`Lines: ${lines.length}`)
  for (const [i, line] of lines.entries()) {
    if (DATE_RANGE_RE.test(line)) {
      const rangeMatch = line.match(DATE_RANGE_RE)!
      const dateStart = line.indexOf(rangeMatch[0])
      const textBefore = line.slice(0, dateStart).trim().replace(/[|·—,]+$/, '').trim()
      const prev1 = i > 0 ? lines[i-1] : ''
      const prev2 = i > 1 ? lines[i-2] : ''
      const prev3 = i > 2 ? lines[i-3] : ''
      console.log(`\n[LINE ${i}] "${line}"`)
      console.log(`  match: "${rangeMatch[0]}"`)
      console.log(`  textBefore: "${textBefore}" (len=${textBefore.length})`)
      console.log(`  prev1: "${prev1}"`)
      console.log(`  prev2: "${prev2}"`)
      console.log(`  prev3: "${prev3}"`)
    }
  }

  const roles = extractExperience(rawText)
  console.log(`\n=== ROLES: ${roles.length} ===`)
  roles.forEach((r, i) => console.log(`[${i}] title="${r.title}" company="${r.company}" start="${r.start}"`))
}
main()
