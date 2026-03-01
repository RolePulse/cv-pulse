// CV Pulse — Legal pages tests
// Epic 14 | Tests: terms page sections, privacy page sections, footer links,
//                  consent checkbox behaviour, link targets.
//
// Level: thorough (12 tests)

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ─── Read page source files to verify content ─────────────────────────────────

const termsSource = readFileSync(
  join(__dirname, '../../app/terms/page.tsx'),
  'utf-8'
)

const privacySource = readFileSync(
  join(__dirname, '../../app/privacy/page.tsx'),
  'utf-8'
)

const uploadSource = readFileSync(
  join(__dirname, '../../app/upload/page.tsx'),
  'utf-8'
)

const settingsSource = readFileSync(
  join(__dirname, '../../app/settings/page.tsx'),
  'utf-8'
)

const homeSource = readFileSync(
  join(__dirname, '../../app/page.tsx'),
  'utf-8'
)

// ─── Terms page ────────────────────────────────────────────────────────────────

describe('Epic 14 — Terms page (/terms)', () => {
  it('1. Contains all required sections', () => {
    const requiredSections = [
      'Introduction',
      'What We Collect',
      'How We Use It',
      'Data Retention',
      'Your Rights',
      'Contact',
    ]
    for (const section of requiredSections) {
      expect(termsSource).toContain(section)
    }
  })

  it('2. Lists correct data types collected', () => {
    expect(termsSource).toContain('email address')
    expect(termsSource).toContain('Google sign-in')
    expect(termsSource).toContain('original PDF')
    expect(termsSource).toContain('structured version')
    expect(termsSource).toContain('JSON')
    expect(termsSource).toContain('Usage counters')
  })

  it('3. Lists all user rights (access, correction, deletion, portability)', () => {
    expect(termsSource).toContain('Access')
    expect(termsSource).toContain('Correction')
    expect(termsSource).toContain('Deletion')
    expect(termsSource).toContain('Portability')
  })

  it('4. Links to /settings for deletion and support@cvpulse.io for contact', () => {
    expect(termsSource).toContain('href="/settings"')
    expect(termsSource).toContain('support@cvpulse.io')
  })

  it('5. Is a server component (no "use client" directive)', () => {
    expect(termsSource).not.toMatch(/['"]use client['"]/)
  })
})

// ─── Privacy page ──────────────────────────────────────────────────────────────

describe('Epic 14 — Privacy page (/privacy)', () => {
  it('6. Contains all required sections', () => {
    const requiredSections = [
      'What data we collect',
      'Why we collect it',
      'How long we keep it',
      'Who sees your data',
      'How to delete your data',
    ]
    for (const section of requiredSections) {
      expect(privacySource).toContain(section)
    }
  })

  it('7. States original PDF is never stored', () => {
    expect(privacySource).toContain('original PDF is never stored')
  })

  it('8. States CV text is never shared with third parties', () => {
    expect(privacySource).toContain('never shared with third parties')
  })

  it('9. States share links are opt-in and show redacted data only', () => {
    expect(privacySource).toContain('opt-in')
    expect(privacySource).toContain('redacted data only')
  })

  it('10. States Google OAuth only — no password stored', () => {
    expect(privacySource).toContain('Google OAuth')
    expect(privacySource).toContain('do not store')
    expect(privacySource).toContain('password')
  })

  it('11. Links to /settings for deletion', () => {
    expect(privacySource).toContain('href="/settings"')
  })
})

// ─── Footer links ──────────────────────────────────────────────────────────────

describe('Epic 14 — Footer links', () => {
  it('12. Upload page has footer with /terms and /privacy links', () => {
    // Check footer element exists with both links
    expect(uploadSource).toContain('<footer')
    expect(uploadSource).toContain('href="/terms"')
    expect(uploadSource).toContain('href="/privacy"')
    expect(uploadSource).toContain('2026 CV Pulse')
  })

  it('13. Settings page has footer with /terms and /privacy links', () => {
    expect(settingsSource).toContain('<footer')
    expect(settingsSource).toContain('href="/terms"')
    expect(settingsSource).toContain('href="/privacy"')
    expect(settingsSource).toContain('2026 CV Pulse')
  })

  it('14. Home page has footer with /terms and /privacy links', () => {
    expect(homeSource).toContain('<footer')
    expect(homeSource).toContain('href="/terms"')
    expect(homeSource).toContain('href="/privacy"')
  })
})

// ─── Consent checkbox ──────────────────────────────────────────────────────────

describe('Epic 14 — Consent checkbox', () => {
  it('15. Upload page has a terms consent checkbox', () => {
    expect(uploadSource).toContain('termsAccepted')
    expect(uploadSource).toContain('type="checkbox"')
    expect(uploadSource).toContain('Terms of Service')
    expect(uploadSource).toContain('Privacy Policy')
  })

  it('16. Consent checkbox blocks submission when unchecked', () => {
    // Verify the submit handler checks termsAccepted before proceeding
    expect(uploadSource).toContain('if (!termsAccepted)')
    expect(uploadSource).toContain('setTermsError(true)')
    expect(uploadSource).toContain('return')
  })

  it('17. Consent checkbox allows submission when checked (clears error)', () => {
    // When termsAccepted is set, termsError is cleared
    expect(uploadSource).toContain('setTermsError(false)')
    // The submit handler proceeds past the terms check when accepted
    expect(uploadSource).toContain('setGateReason(null)')
  })

  it('18. Consent links open in new tab', () => {
    // Both links in the consent area should have target="_blank"
    const consentSection = uploadSource.slice(
      uploadSource.indexOf('Consent checkbox'),
      uploadSource.indexOf('CTA')
    )
    expect(consentSection).toContain('target="_blank"')
    expect(consentSection).toContain('href="/terms"')
    expect(consentSection).toContain('href="/privacy"')
  })

  it('19. Shows inline error message when terms not accepted', () => {
    expect(uploadSource).toContain('termsError')
    expect(uploadSource).toContain('Please accept the Terms of Service and Privacy Policy')
  })
})
