// CV Pulse — LinkedIn extraction + skills truncation tests

import { extractLinkedIn, extractSkills } from '../parser'

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

describe('extractSkills — two-column PDF contamination', () => {
  const ANTHONY_BRANCH_SKILLS = `Time Management, Solutions Oriented, Contract & Negotiations, Sales Funnel Strategy, Lead Generation, Prospecting, Customer Success, Data & Analytics, Skilled Collaborator, Product Marketing, Revenue Tracking, SalesLoft - SalesForce, Cisco Jabber - Oracle, Netsuite, Google, Microsoft, KEY ACHIEVEMENTS:, Dish Network:, 1 of 5 representatives to achieve, 25+ sales in single, day. Exceeded, goal over 150% for over 3 years., AMSR:, Exceeded goal 110%, for the year., Sold 50 plus oxygen units in one, month., Angi:, Maintained 115% of goal for the, year. Signed 32 clients in one, month (Requirement was 2 clients, per week)., ANTHONY BRANCH, 904-376-0923, anthonybranch4444@icloud.com, Denver, Colorado`

  it('does not include email in skills', () => {
    const skills = extractSkills(ANTHONY_BRANCH_SKILLS)
    expect(skills).not.toContain('anthonybranch4444@icloud.com')
    expect(skills.some(s => s.includes('@'))).toBe(false)
  })

  it('does not include phone number in skills', () => {
    const skills = extractSkills(ANTHONY_BRANCH_SKILLS)
    expect(skills.some(s => /\d{3}[-.\s]\d{3}/.test(s))).toBe(false)
  })

  it('does not include person name in skills', () => {
    const skills = extractSkills(ANTHONY_BRANCH_SKILLS)
    expect(skills).not.toContain('ANTHONY BRANCH')
  })

  it('does not include KEY ACHIEVEMENTS: heading in skills', () => {
    const skills = extractSkills(ANTHONY_BRANCH_SKILLS)
    expect(skills).not.toContain('KEY ACHIEVEMENTS:')
  })

  it('does not include sentence fragments from achievements', () => {
    const skills = extractSkills(ANTHONY_BRANCH_SKILLS)
    // These are mid-sentence fragments from the key achievements section
    expect(skills.some(s => s.includes('representatives to achieve'))).toBe(false)
    expect(skills.some(s => s.includes('goal over 150%'))).toBe(false)
  })

  it('still extracts the real skills correctly', () => {
    const skills = extractSkills(ANTHONY_BRANCH_SKILLS)
    expect(skills).toContain('Time Management')
    expect(skills).toContain('Lead Generation')
    expect(skills).toContain('Customer Success')
    expect(skills).toContain('Data & Analytics')
  })
})
