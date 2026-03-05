// Parser fixes — March 2026, Batch 2
// Covers regressions identified from 498-CV batch test (2026-03-05):
//   1. U+2011 non-breaking hyphen in date separators (Camilletti pattern)
//   2. DATE_SEP "to" without leading/trailing space ("01/2024toPresent")
//   3. Reversed date format "YYYY Month" → normalised to "Month YYYY"
//   4. collapseSpacedChars: iterative collapse ("E M P L O Y M E N T" → "EMPLOYMENT")
//   5. No-space section headers ("PROFESSIONALEXPERIENCE", "CareerHistory")
//   6. Plural section header ("Professional Experiences")
//   7. "Experiences details:" section header variant

import { describe, it, expect } from 'vitest'
import { extractExperience, cleanText, collapseSpacedChars, detectSections } from '@/lib/parser'

// ─── Fix 1: U+2011 non-breaking hyphen ──────────────────────────────────────

describe('U+2011 non-breaking hyphen in date ranges', () => {
  it('parses dates separated by U+2011 (Camilletti pattern)', () => {
    // pdf-parse emits U+2011 (‑) instead of a regular hyphen in some fonts
    const u2011 = '\u2011'
    const text = [
      'Software Engineer (Remote)Novi, MI',
      `Delphinus Medical TechnologiesMay 2021 ${u2011} Aug 2024`,
      '• Developed software applications using Python and C++',
      '• Led code reviews to maintain coding standards',
      `Co-Op Student, Engineering DesignFarmington Hills, MI`,
      `MarelliMay 2019 ${u2011} Apr 2020`,
      '• Led innovations project proposal',
    ].join('\n')
    const cleaned = cleanText(text)
    const roles = extractExperience(cleaned)
    expect(roles.length).toBeGreaterThanOrEqual(2)
    expect(roles[0].company).toMatch(/Delphinus/i)
    expect(roles[1].company).toMatch(/Marelli/i)
  })
})

// ─── Fix 2: DATE_SEP "to" without space (toPresent / toCurrent) ─────────────

describe('Date separator "to" without surrounding spaces', () => {
  it('handles "MM/YYYYtoPresent" (no spaces around to)', () => {
    const text = [
      'Key Account Manager - Strategic Partnerships',
      'InMobi – Bengaluru, India',
      '06/2022to 10/2024',
      '• Managed cross-functional DSP campaigns totaling $1.5M',
    ].join('\n')
    const cleaned = cleanText(text)
    const roles = extractExperience(cleaned)
    expect(roles).toHaveLength(1)
    expect(roles[0].company).toMatch(/InMobi/i)
  })

  it('handles "YYYYtoPresent" with uppercase P (Deepak Bajaj pattern)', () => {
    const text = [
      'TekaccelInc,USA',
      'GoogleInc.-USA(Contract)-PrincipalUXDesigner',
      '01/2024toPresent',
      '• Designed forecasting tools at Google',
    ].join('\n')
    const cleaned = cleanText(text)
    const roles = extractExperience(cleaned)
    expect(roles).toHaveLength(1)
  })

  it('handles "10/2024to Current" (Anthony Iglesias pattern) — date parsed, role found', () => {
    // Format: date+title on same line, company on line below.
    // Parser looks backward for company so company may not be detected without more context,
    // but the key test is that the date range is found and a role is extracted.
    const text = [
      'Fiserv – Berkeley Heights, NJ',
      '10/2024to CurrentAccount Manager',
      '• Increase client satisfaction by building strong relationships',
      '• Maintain high client retention rate',
    ].join('\n')
    const cleaned = cleanText(text)
    const roles = extractExperience(cleaned)
    expect(roles).toHaveLength(1)
    expect(roles[0].company).toMatch(/Fiserv/i)
  })
})

// ─── Fix 3: Reversed date format "YYYY Month" ───────────────────────────────

describe('Reversed date format "YYYY Month"', () => {
  it('normalises "2022 Oct – Present" to "Oct 2022 – Present"', () => {
    const text = [
      'Eze Software',
      '2022 Oct – Present',
      'Recruited as Production Solution Engineer.',
      ' Collaborate with all teams within EZE Software Group.',
      ' Perform issue replication in virtual environments.',
    ].join('\n')
    const cleaned = cleanText(text)
    const roles = extractExperience(cleaned)
    expect(roles).toHaveLength(1)
    expect(roles[0].company).toMatch(/Eze Software/i)
  })

  it('normalises "2020 January – 2022 March" multi-year reversed range', () => {
    const text = [
      'Acme Corporation',
      '2020 January – 2022 March',
      '• Led enterprise sales initiatives',
    ].join('\n')
    const cleaned = cleanText(text)
    const roles = extractExperience(cleaned)
    expect(roles).toHaveLength(1)
  })
})

// ─── Fix 4: collapseSpacedChars — iterative collapse ────────────────────────

describe('collapseSpacedChars iterative loop', () => {
  it('fully collapses "E M P L O Y M E N T   H I S T O R Y" to "EMPLOYMENT HISTORY"', () => {
    expect(collapseSpacedChars('E M P L O Y M E N T   H I S T O R Y'))
      .toBe('EMPLOYMENT HISTORY')
  })

  it('fully collapses "O C T O B E R" to "OCTOBER"', () => {
    expect(collapseSpacedChars('O C T O B E R')).toBe('OCTOBER')
  })

  it('fully collapses "P R O F E S S I O N A L   E X P E R I E N C E" to "PROFESSIONAL EXPERIENCE"', () => {
    expect(collapseSpacedChars('P R O F E S S I O N A L   E X P E R I E N C E'))
      .toBe('PROFESSIONAL EXPERIENCE')
  })

  it('does not mangle normal lines', () => {
    const normal = 'Software Engineer at Acme Corp'
    expect(collapseSpacedChars(normal)).toBe(normal)
  })
})

// ─── Fix 5: No-space section headers ────────────────────────────────────────

describe('No-space section header detection', () => {
  it('detects "PROFESSIONALEXPERIENCE" as an experience section (Deepak Bajaj pattern)', () => {
    const text = [
      'SKILLS',
      'Python, Figma, Axure',
      'PROFESSIONALEXPERIENCE',
      'Google Inc. – USA (Contract)',
      '01/2024 to Present',
      '• Designed forecasting tools',
    ].join('\n')
    const cleaned = cleanText(text)
    const sections = detectSections(cleaned)
    expect(sections).toHaveProperty('experience')
  })

  it('detects "CareerHistory" as experience section (James Lyon pattern)', () => {
    const text = [
      'Education',
      'BSc Computer Science',
      'CareerHistory',
      'May2023-May2024CrownAgentsBank',
      '■ Business partnering with Banking departments.',
    ].join('\n')
    const cleaned = cleanText(text)
    const sections = detectSections(cleaned)
    expect(sections).toHaveProperty('experience')
  })

  it('detects "WorkExperience" (no space) as experience section', () => {
    const text = [
      'Summary',
      'Experienced marketer',
      'WorkExperience',
      'Acme Corp',
      'Jan 2022 – Present',
      '• Led marketing initiatives',
    ].join('\n')
    const cleaned = cleanText(text)
    const sections = detectSections(cleaned)
    expect(sections).toHaveProperty('experience')
  })
})

// ─── Fix 6: Plural section header ───────────────────────────────────────────

describe('Plural "Professional Experiences" section header', () => {
  it('detects "Professional Experiences" as experience section', () => {
    const text = [
      'Objective',
      'Seeking a role in tech',
      'Professional Experiences',
      'Eze Software',
      'Oct 2022 – Present',
      'Production Solution Engineer',
      '• Collaborated with all teams',
    ].join('\n')
    const cleaned = cleanText(text)
    const sections = detectSections(cleaned)
    expect(sections).toHaveProperty('experience')
  })
})

// ─── Fix 7: "Experience details:" section header ────────────────────────────

describe('"Experiencedetails" section header (Ting pattern)', () => {
  it('detects "Experiencedetails:" (no space) as experience section', () => {
    const text = [
      'Education:',
      'BSc Engineering',
      'Experiencedetails:',
      'Acme Corporation',
      'Jan 2020 – Dec 2024',
      '• Led revenue growth initiatives',
    ].join('\n')
    const cleaned = cleanText(text)
    const sections = detectSections(cleaned)
    expect(sections).toHaveProperty('experience')
  })
})
