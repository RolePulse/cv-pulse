import { parseCV, DATE_RANGE_RE } from '../src/lib/parser'
import { readFileSync } from 'fs'

async function main() {
  const name = process.argv[2]
  const buf = readFileSync(process.env.HOME + '/Downloads/' + name)
  const r = await parseCV(buf)
  
  const rawText = r.rawText
  const lines = rawText.split('\n').map(l => l.trimEnd())
  
  console.log(`Total lines: ${lines.length}`)
  console.log('\n--- Date-matching lines ---')
  lines.forEach((line, i) => {
    if (DATE_RANGE_RE.test(line)) {
      console.log(`[${i}] "${line}"`)
      if (i > 0) console.log(`  prev1: "${lines[i-1]}"`)
      if (i > 1) console.log(`  prev2: "${lines[i-2]}"`)
      if (i > 2) console.log(`  prev3: "${lines[i-3]}"`)
    }
  })
}
main()
