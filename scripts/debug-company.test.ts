import { describe, it } from 'vitest'
import { parseCV, cleanCompanyLine } from '../src/lib/parser'
import fs from 'fs'
import path from 'path'

const DL = path.join(process.env.HOME!, 'Downloads')

describe('Company recovery debug', () => {
  it('cleanCompanyLine smoke test', () => {
    const cases = [
      ['Staffbase- New York, NY', 'Staffbase'],
      ['Slack - New York, NY', 'Slack'],
      ['Happeo- New York, NY', 'Happeo'],
      ['Salesforce, San Francisco, CA', 'Salesforce'],
      ['Google London, UK', 'Google'],
      ['Acme Corp', 'Acme Corp'],
    ]
    for (const [input, expected] of cases) {
      const result = cleanCompanyLine(input)
      const ok = result === expected ? '✓' : `✗ (got "${result}")`
      console.log(`  cleanCompanyLine("${input}") → "${result}" ${ok}`)
    }
  })

  it('Wolfson full roles', async () => {
    const buf = fs.readFileSync(path.join(DL, 'Alex Wolfson Resume .pdf'))
    const result = await parseCV(buf)
    console.log('\nWolfson roles:')
    result.structured.experience.forEach((r, i) => {
      console.log(`  [${i+1}] title="${r.title}" | company="${r.company}" | ${r.start}–${r.end ?? 'present'}`)
    })
  })

  it('An Ta', async () => {
    try {
      const buf = fs.readFileSync(path.join(DL, 'An Ta - Resume .pdf'))
      const result = await parseCV(buf)
      console.log('\nAn Ta roles:')
      result.structured.experience.forEach((r, i) => {
        console.log(`  [${i+1}] title="${r.title}" | company="${r.company}"`)
      })
    } catch { console.log('not found') }
  })

  it('MaxCespedes', async () => {
    const buf = fs.readFileSync(path.join(DL, 'MaxCespedes_Resume_2025.pdf'))
    const result = await parseCV(buf)
    console.log('\nMaxCespedes roles:', result.structured.experience.length)
    result.structured.experience.forEach((r, i) => {
      console.log(`  [${i+1}] title="${r.title}" | company="${r.company}"`)
    })
  })
})
