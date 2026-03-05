import { describe, it } from 'vitest'
import { parseCV, extractExperience } from '../src/lib/parser'
import fs from 'fs'
import path from 'path'

const DL = path.join(process.env.HOME!, 'Downloads')

describe('Problem CV diagnostics', () => {
  it('MaxCespedes — roles', async () => {
    const buf = fs.readFileSync(path.join(DL, 'MaxCespedes_Resume_2025.pdf'))
    const result = await parseCV(buf)
    console.log('\n=== MaxCespedes ===')
    console.log('Confidence:', result.confidence)
    console.log('Roles:', result.structured.experience.length)
    result.structured.experience.forEach((r, i) => {
      console.log(`  [${i+1}] "${r.title}" @ "${r.company}" | ${r.start}–${r.end ?? 'present'}`)
    })
  })

  it('Alex Lovato — full raw text + date lines', async () => {
    const buf = fs.readFileSync(path.join(DL, 'Alex Lovato Resume.pdf'))
    const result = await parseCV(buf)
    console.log('\n=== Alex Lovato raw text ===')
    console.log(result.rawText.slice(0, 2000))
  })

  it('Clarisse T — full raw text', async () => {
    const buf = fs.readFileSync(path.join(DL, '2025 Clarisse T. Resume.docx.pdf'))
    const result = await parseCV(buf)
    console.log('\n=== Clarisse T raw text ===')
    console.log(result.rawText.slice(0, 2000))
  })
})
