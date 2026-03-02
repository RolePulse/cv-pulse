import { parseCV } from '../src/lib/parser'
import { readFileSync } from 'fs'

async function main() {
  const name = process.argv[2]
  if (!name) { console.log('Usage: npx tsx scripts/inspect-cv.ts "filename.pdf"'); process.exit(1) }
  const buf = readFileSync(process.env.HOME + '/Downloads/' + name)
  const r = await parseCV(buf)
  console.log('=== CONFIDENCE:', r.confidence, '| ROLES:', r.structured.experience.length, '===\n')
  console.log('--- RAW TEXT (first 3000 chars) ---')
  console.log(r.rawText.slice(0, 3000))
  console.log('\n--- EXPERIENCE EXTRACTED ---')
  console.log(JSON.stringify(r.structured.experience.slice(0, 5), null, 2))
}
main()
