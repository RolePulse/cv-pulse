import { parseCV } from '../src/lib/parser.ts'
import fs from 'fs'

const buf = fs.readFileSync('/Users/jamesfowles/Downloads/Alex Wolfson Resume .pdf')
const result = await parseCV(buf)
console.log('Confidence:', result.confidence)
console.log('Roles:', result.structured.experience.length)
console.log('')
result.structured.experience.forEach((r, i) => {
  console.log(`Role ${i+1}:`)
  console.log(`  Title:   ${r.title}`)
  console.log(`  Company: ${r.company}`)
  console.log(`  Start:   ${r.start}`)
  console.log(`  End:     ${r.end ?? 'Present'}`)
  console.log(`  Bullets: ${r.bullets.length}`)
  console.log('')
})
