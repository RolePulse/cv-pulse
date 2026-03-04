import { describe, it } from 'vitest'
import { parseCV } from '../src/lib/parser'
import fs from 'fs'
import path from 'path'

const DL = path.join(process.env.HOME!, 'Downloads')

describe('Raw text debug', () => {
  it('Alex Wolfson raw text', async () => {
    const buf = fs.readFileSync(path.join(DL, 'Alex Wolfson Resume .pdf'))
    const result = await parseCV(buf)
    console.log('\n=== WOLFSON RAW TEXT ===')
    console.log(result.rawText.slice(0, 2000))
    console.log('\n=== WOLFSON ROLES ===')
    result.structured.experience.forEach((r, i) => {
      console.log(`[${i+1}] title="${r.title}" | company="${r.company}" | ${r.start}–${r.end ?? 'present'}`)
    })
  })

  it('MaxCespedes raw text', async () => {
    const buf = fs.readFileSync(path.join(DL, 'MaxCespedes_Resume_2025.pdf'))
    const result = await parseCV(buf)
    console.log('\n=== MAXCESPEDES RAW TEXT ===')
    console.log(result.rawText.slice(0, 1500))
  })

  it('An Ta raw text', async () => {
    try {
      const buf = fs.readFileSync(path.join(DL, 'An Ta - Resume .pdf'))
      const result = await parseCV(buf)
      console.log('\n=== AN TA RAW TEXT ===')
      console.log(result.rawText.slice(0, 1500))
    } catch { console.log('not found') }
  })
})
