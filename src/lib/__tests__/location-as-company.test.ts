// CV Pulse — Location-as-company regression tests (Anthony Branch pattern)
// Three role formats where location was being assigned as company name.

import { extractExperience } from '../parser'

const ANTHONY_BRANCH_EXPERIENCE = `EXPERIENCE
Denver, Colorado | Remote
Account Executive | December 2023 – Present
• Outreach to potential clients to discuss Angi's value proposition.
• Negotiate advertising solutions while building trust.
• Developed creative prospecting strategies.

Account Executive - Medical Sales
Denver, Colorado | Hybrid | January 2023 – December 2023
• Represented/promoted oxygen products and services to a large partner group.
• Developed deep relationships with customers.

Senior Account Executive - Telecommunications
Littleton, Colorado | January 2019 – May 2022
• Scaled my team to 20+ sales representatives.
• Maintained strong knowledge of sales strategies.`

describe('extractExperience — location-as-company bug', () => {
  let roles: ReturnType<typeof extractExperience>
  beforeEach(() => { roles = extractExperience(ANTHONY_BRANCH_EXPERIENCE) })

  it('extracts exactly 3 roles', () => {
    expect(roles).toHaveLength(3)
  })

  it('Role 1: title is Account Executive (not a location)', () => {
    expect(roles[0].title).toBe('Account Executive')
    expect(roles[0].title).not.toMatch(/Colorado|Remote|Hybrid/)
  })

  it('Role 1: company is NOT a location string', () => {
    expect(roles[0].company).not.toMatch(/Denver|Colorado|Remote/)
  })

  it('Role 1: dates parsed correctly', () => {
    expect(roles[0].start).toContain('December 2023')
    expect(roles[0].end).toBeNull()
  })

  it('Role 2: title is Account Executive - Medical Sales', () => {
    expect(roles[1].title).toContain('Account Executive - Medical Sales')
  })

  it('Role 2: company is NOT a location string', () => {
    expect(roles[1].company).not.toMatch(/Denver|Colorado|Hybrid/)
  })

  it('Role 2: dates parsed correctly', () => {
    expect(roles[1].start).toContain('January 2023')
    expect(roles[1].end).toContain('December 2023')
  })

  it('Role 3: title is Senior Account Executive - Telecommunications', () => {
    expect(roles[2].title).toContain('Senior Account Executive')
  })

  it('Role 3: company is NOT Littleton, Colorado', () => {
    expect(roles[2].company).not.toBe('Littleton, Colorado')
    expect(roles[2].company).not.toMatch(/Colorado/)
  })

  it('Role 3: dates parsed correctly', () => {
    expect(roles[2].start).toContain('January 2019')
    expect(roles[2].end).toContain('May 2022')
  })
})
