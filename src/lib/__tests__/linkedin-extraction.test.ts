// CV Pulse — LinkedIn extraction tests

import { extractLinkedIn } from '../parser'

describe('extractLinkedIn', () => {
  it('extracts full https URL', () => {
    const raw = 'John Smith\nhttps://www.linkedin.com/in/johnsmith\njohn@email.com'
    expect(extractLinkedIn(raw)).toBe('linkedin.com/in/johnsmith')
  })

  it('extracts URL without https or www', () => {
    const raw = 'John Smith\nlinkedin.com/in/john-smith-123\njohn@email.com'
    expect(extractLinkedIn(raw)).toBe('linkedin.com/in/john-smith-123')
  })

  it('extracts bare /in/handle pattern', () => {
    const raw = 'John Smith | /in/jsmith | London'
    expect(extractLinkedIn(raw)).toBe('linkedin.com/in/jsmith')
  })

  it('returns undefined when no LinkedIn in first 20 lines', () => {
    const raw = Array(25).fill('No LinkedIn here').join('\n')
    expect(extractLinkedIn(raw)).toBeUndefined()
  })

  it('does not match LinkedIn mentions in body (after line 20)', () => {
    const header = Array(21).fill('Just a line').join('\n')
    const raw = header + '\nhttps://www.linkedin.com/in/deepbody'
    expect(extractLinkedIn(raw)).toBeUndefined()
  })

  it('handles uppercase URL gracefully', () => {
    const raw = 'Name\nHTTPS://WWW.LINKEDIN.COM/IN/JSMITH\nEmail'
    expect(extractLinkedIn(raw)).toBe('linkedin.com/in/jsmith')
  })
})
