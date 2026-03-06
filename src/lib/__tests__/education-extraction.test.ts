// CV Pulse — Education extraction tests

import { extractEducation } from '../parser'

describe('extractEducation — two-line pipe format (Anthony Branch pattern)', () => {
  const twoLine = `Florida State College at | Jacksonville - (AA)
Business Administration | Jacksonville, Florida`

  it('produces exactly one entry', () => {
    const entries = extractEducation(twoLine)
    expect(entries).toHaveLength(1)
  })

  it('institution is the college name (not a location)', () => {
    const [entry] = extractEducation(twoLine)
    expect(entry.institution).toContain('Florida State College')
    expect(entry.institution).not.toContain('Jacksonville')
  })

  it('qualification is the degree field', () => {
    const [entry] = extractEducation(twoLine)
    expect(entry.qualification).toContain('Business Administration')
  })

  it('qualification includes the degree abbreviation from line 1', () => {
    const [entry] = extractEducation(twoLine)
    expect(entry.qualification).toContain('AA')
  })

  it('does not include the institution or email in qualification', () => {
    const [entry] = extractEducation(twoLine)
    expect(entry.qualification).not.toContain('Florida State')
    expect(entry.qualification).not.toContain('Jacksonville')
  })
})

describe('extractEducation — standard reconstructed format (Qualification | Institution)', () => {
  const reconstructed = `Business Administration (AA) | Florida State College at Jacksonville`

  it('parses qualification and institution correctly', () => {
    const [entry] = extractEducation(reconstructed)
    expect(entry.qualification).toContain('Business Administration')
    expect(entry.institution).toContain('Florida State College')
  })
})

describe('extractEducation — institution-first pipe format (Harvard | MBA)', () => {
  const institutionFirst = `Harvard Business School | MBA`

  it('institution on left, qualification on right', () => {
    const [entry] = extractEducation(institutionFirst)
    expect(entry.institution).toContain('Harvard')
    expect(entry.qualification).toContain('MBA')
  })
})

describe('extractEducation — three-part pipe (Qualification | Institution | Year)', () => {
  const threePart = `Computer Science | MIT | 2019`

  it('parses all three fields', () => {
    const [entry] = extractEducation(threePart)
    expect(entry.qualification).toContain('Computer Science')
    expect(entry.institution).toContain('MIT')
    expect(entry.year).toBe('2019')
  })
})
