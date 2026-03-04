import { describe, it } from 'vitest'
import { parseCV } from '../src/lib/parser'
import fs from 'fs'
import path from 'path'

const DL = path.join(process.env.HOME!, 'Downloads')

describe('Specific CV spot checks', () => {
  it('Alex Wolfson — titles should NOT be in company field', async () => {
    const buf = fs.readFileSync(path.join(DL, 'Alex Wolfson Resume .pdf'))
    const result = await parseCV(buf)
    console.log('\n=== Alex Wolfson ===')
    console.log('Roles:', result.structured.experience.length)
    result.structured.experience.forEach((r, i) => {
      console.log(`  [${i+1}] title="${r.title}" | company="${r.company}" | ${r.start}–${r.end ?? 'present'}`)
    })
  })

  it('MaxCespedes — zero roles diagnostic', async () => {
    const buf = fs.readFileSync(path.join(DL, 'MaxCespedes_Resume_2025.pdf'))
    const result = await parseCV(buf)
    console.log('\n=== MaxCespedes ===')
    console.log('Roles:', result.structured.experience.length)
    console.log('Summary length:', result.structured.summary.length)
    console.log('Raw text (first 500):', result.rawText.slice(0, 500))
  })

  it('Alex Lovato — title/company swap check', async () => {
    try {
      const buf = fs.readFileSync(path.join(DL, 'Alex Lovato Resume.pdf'))
      const result = await parseCV(buf)
      console.log('\n=== Alex Lovato ===')
      console.log('Roles:', result.structured.experience.length)
      result.structured.experience.forEach((r, i) => {
        console.log(`  [${i+1}] title="${r.title}" | company="${r.company}"`)
      })
    } catch { console.log('Alex Lovato not found') }
  })

  it('2025 Clarisse T — swap check', async () => {
    try {
      const buf = fs.readFileSync(path.join(DL, '2025 Clarisse T. Resume.docx.pdf'))
      const result = await parseCV(buf)
      console.log('\n=== Clarisse T ===')
      result.structured.experience.forEach((r, i) => {
        console.log(`  [${i+1}] title="${r.title}" | company="${r.company}"`)
      })
    } catch { console.log('Clarisse not found') }
  })
})
