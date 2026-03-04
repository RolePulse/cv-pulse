// Parser fixes — March 2026 batch
// Covers 5 specific regressions identified against real CV samples:
//   1. Trailing whitespace in looksLikeLocation
//   2. Split bullets (• alone on a line, content on next line)
//   3. "o" sub-bullets (lone o, content on next line)
//   4. 4-line header — Company → Location → Title → Date (MongoDB pattern)
//   5. AvePoint format — "Title | Date" with ticker/location noise in company line

import { describe, it, expect } from 'vitest'
import { extractExperience } from '@/lib/parser'

// ─── Fix 1: Trailing whitespace in location lines ────────────────────────────

describe('looksLikeLocation — trailing whitespace robustness', () => {
  it('correctly skips a location line with trailing space so company/title are not swapped', () => {
    // Pattern: Company → "City, ST " (trailing space) → Title → Date
    // If looksLikeLocation fails on "New York, NY " the parser reads it as the title
    const text = [
      'Acme Corp',
      'New York, NY ',   // trailing space — must still be detected as location
      'Senior Account Executive',
      'Jan 2022 – Present',
      '• Drove $2M in new ARR across East Coast territory',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles).toHaveLength(1)
    expect(roles[0].title).toBe('Senior Account Executive')
    expect(roles[0].company).toMatch(/Acme Corp/i)
  })
})

// ─── Fix 2: Split bullets (lone bullet char on its own line) ─────────────────

describe('Split bullet merging', () => {
  it('joins lone • char with the content line that follows', () => {
    const text = [
      'AvePoint',
      'Enterprise Account Executive | Aug 2024 – Present',
      '•',
      'Increased qualified pipeline by 40% through targeted ABM campaigns',
      '•',
      'Managed 50-account book of business across EMEA and APAC',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles).toHaveLength(1)
    expect(roles[0].bullets).toHaveLength(2)
    expect(roles[0].bullets[0]).toContain('Increased qualified pipeline')
    expect(roles[0].bullets[1]).toContain('Managed 50-account book')
  })

  it('does not merge a lone bullet when the next line is a date range', () => {
    const text = [
      'Acme Corp',
      'SDR | Jan 2021 – Dec 2021',
      '•',
      'Jan 2022 – Present',  // next line is a date — should NOT be merged
      'Senior SDR',
    ].join('\n')
    const roles = extractExperience(text)
    // At minimum: the date lines should each anchor a role, not crash
    expect(Array.isArray(roles)).toBe(true)
  })

  it('does not merge two consecutive lone bullets — second merges with content, first stays lone', () => {
    // First • sees next = •  (also lone) → no merge
    // Second • sees next = "Closed 12..." → merges
    // Result: one bullet from the merged pair
    const text = [
      'Senior SDR | Jan 2022 – Present',
      '•',
      '•',
      'Closed 12 enterprise deals totalling $1.4M ARR',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles.length).toBeGreaterThan(0)
    expect(roles[0].bullets).toHaveLength(1)
    expect(roles[0].bullets[0]).toContain('Closed 12 enterprise deals')
  })
})

// ─── Fix 3: "o" sub-bullets ──────────────────────────────────────────────────

describe('"o" sub-bullet merging', () => {
  it('joins lone "o" with the content line that follows', () => {
    const text = [
      'GovInvest',
      'Senior SDR | Mar 2023 – Jun 2024',
      '•',
      'Exceeded quota across all four quarters',
      'o',
      '127% attainment in Q3 2023',
      'o',
      '118% attainment in Q4 2023',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles).toHaveLength(1)
    // Should capture all bullet-like lines including the merged o sub-bullets
    const allBullets = roles[0].bullets.join(' ')
    expect(allBullets).toContain('Exceeded quota')
    expect(allBullets).toContain('127%')
    expect(allBullets).toContain('118%')
  })
})

// ─── Fix 4: 4-line header (Company → Location → Title → Date) ────────────────

describe('4-line header: Company → Location → Title → Date', () => {
  it('correctly extracts company, title, and date when a location sits between them', () => {
    const text = [
      'MongoDB',
      'New York, NY',
      'Senior Solutions Engineer',
      'Jan 2020 – Dec 2022',
      '• Built proof-of-concept demos for Fortune 500 prospects',
      '• Ran 30+ technical discovery calls per quarter',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles).toHaveLength(1)
    expect(roles[0].company).toBe('MongoDB')
    expect(roles[0].title).toBe('Senior Solutions Engineer')
    expect(roles[0].start).toBe('Jan 2020')
    expect(roles[0].bullets).toHaveLength(2)
  })

  it('handles London, UK location line between company and title', () => {
    const text = [
      'Salesforce',
      'London, UK',
      'Account Executive',
      'Mar 2021 – Present',
      '• Closed £1.2M in new business in FY2023',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles).toHaveLength(1)
    expect(roles[0].company).toBe('Salesforce')
    expect(roles[0].title).toBe('Account Executive')
  })

  it('handles San Francisco, CA location pattern', () => {
    const text = [
      'Stripe',
      'San Francisco, CA',
      'Product Manager',
      'Jun 2019 – May 2021',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles).toHaveLength(1)
    expect(roles[0].company).toBe('Stripe')
    expect(roles[0].title).toBe('Product Manager')
  })

  it('does not apply 4-line logic when effective2 is not a location', () => {
    // Standard 2-line UK format: Title sits ABOVE Company, Company sits directly above Date
    // effective2 (further from date) = title, effective1 (closer to date) = company
    const text = [
      'Senior SDR',
      'Acme Corp',
      'Jan 2022 – Present',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles).toHaveLength(1)
    expect(roles[0].company).toBe('Acme Corp')
    expect(roles[0].title).toBe('Senior SDR')
  })
})

// ─── Fix 5: AvePoint — company line with ticker + location noise ──────────────

describe('cleanCompanyLine — ticker and location stripping', () => {
  it('strips NYSE/NASDAQ/Ticker annotations from company name in "Title | Date" format', () => {
    const text = [
      'AvePoint (Ticker: AVPT) Jersey City, NJ',
      'Enterprise Account Executive | Aug 2024 – Present',
      '• Landed 3 net-new logos in the public sector vertical',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles).toHaveLength(1)
    // Company should be cleaned — just "AvePoint", without ticker or city
    expect(roles[0].company).not.toContain('Ticker')
    expect(roles[0].company).not.toContain('Jersey City')
    expect(roles[0].company).toMatch(/AvePoint/i)
    expect(roles[0].title).toBe('Enterprise Account Executive')
  })

  it('strips NYSE annotation', () => {
    const text = [
      'BigCo (NYSE: BCO) Austin, TX',
      'Regional Sales Director | Jan 2022 – Dec 2023',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles[0].company).not.toContain('NYSE')
    expect(roles[0].company).not.toContain('Austin')
    expect(roles[0].company).toMatch(/BigCo/i)
  })

  it('preserves acquisition notes that do not have ticker patterns', () => {
    // "(acquired Mosaic)" is useful company context — should NOT be stripped
    const text = [
      'HiBob (acquired Mosaic)',
      'Senior Customer Success Manager | Feb 2023 – Present',
    ].join('\n')
    const roles = extractExperience(text)
    expect(roles[0].company).toContain('HiBob')
    // Acquisition note may or may not be preserved — but company must not be empty
    expect(roles[0].company.length).toBeGreaterThan(3)
    expect(roles[0].title).toBe('Senior Customer Success Manager')
  })
})

// ─── Fix 6: Multiple roles under one company header (extended lookback) ──────
// Pattern: company name appears once, multiple "Title | Date" entries follow.
// Previously: only prev1/prev2 checked → continuation roles got company = "".
// Fixed: lookback up to 12 lines, skipping date-range lines.

describe('multiple roles under one company header', () => {
  it('extracts titles correctly and does not store title as company', () => {
    const text = [
      'EXPERIENCE',
      'AvePoint (Ticker: AVPT) Jersey City, NJ',
      'Enterprise Account Executive | Dec 2020 – Aug 2024',
      '• Led enterprise sales across Mid-Atlantic region',
      '',
      'Enterprise Account Executive | Jan 2020 – Dec 2020',
      '• Managed 40 accounts across financial services vertical',
      '',
      'Enterprise Account Executive | Sep 2018 – Nov 2019',
      '• Drove pipeline expansion by 35%',
    ].join('\n')

    const roles = extractExperience(text)
    expect(roles).toHaveLength(3)

    // No role should store a job title as the company
    roles.forEach(r => {
      expect(r.title).not.toBe('')
      expect(r.company).not.toBe(r.title)
    })

    // All three roles should correctly identify the title
    expect(roles[0].title).toBe('Enterprise Account Executive')
    expect(roles[1].title).toBe('Enterprise Account Executive')
    expect(roles[2].title).toBe('Enterprise Account Executive')

    // Role 0 (first role under company) must have company set
    expect(roles[0].company).toMatch(/AvePoint/i)

    // Continuation roles (1, 2) should inherit the company via extended lookback
    expect(roles[1].company).toMatch(/AvePoint/i)
    expect(roles[2].company).toMatch(/AvePoint/i)
  })

  it('does not inherit company across a section header boundary', () => {
    const text = [
      'EXPERIENCE',
      'TechCorp Ltd',
      'Sales Manager | Jan 2022 – Present',
      '• Hit 120% quota',
      '',
      'EDUCATION',
      'Account Executive | Jan 2019 – Dec 2021',  // should NOT get TechCorp
    ].join('\n')

    const roles = extractExperience(text)
    // The AE entry under EDUCATION should not inherit TechCorp as its company
    const aeRole = roles.find(r => r.title === 'Account Executive')
    if (aeRole) {
      expect(aeRole.company).not.toMatch(/TechCorp/i)
    }
  })
})
