// CV Pulse — Paywall + Usage gate tests
// Epic 10 | Tests: isPaywalled logic, CSV parser, usage tracking rules.
//
// Level: medium (9 checks)

import { describe, it, expect } from 'vitest'
import { isPaywalled } from '@/lib/data'
import { parseAllowlistCSV } from '@/lib/parseAllowlistCSV'
import type { Usage } from '@/types/database'

// ─── isPaywalled() unit tests ─────────────────────────────────────────────────

function makeUsage(overrides: Partial<Usage> = {}): Usage {
  return {
    user_id: 'user-123',
    free_rescores_used: 0,
    free_jd_checks_used: 0,
    paid_status: 'free',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('Epic 10 — isPaywalled()', () => {

  it('1. Free user with 0 rescores used is NOT paywalled for rescore', () => {
    expect(isPaywalled(makeUsage({ free_rescores_used: 0 }), 'rescore')).toBe(false)
  })

  it('2. Free user with 1 rescore used IS paywalled for rescore', () => {
    expect(isPaywalled(makeUsage({ free_rescores_used: 1 }), 'rescore')).toBe(true)
  })

  it('3. Free user with 2+ rescores used IS paywalled for rescore', () => {
    expect(isPaywalled(makeUsage({ free_rescores_used: 5 }), 'rescore')).toBe(true)
  })

  it('4. Free user with 1 JD check used is NOT paywalled for jd_check', () => {
    expect(isPaywalled(makeUsage({ free_jd_checks_used: 1 }), 'jd_check')).toBe(false)
  })

  it('5. Free user with 2 JD checks used IS paywalled for jd_check', () => {
    expect(isPaywalled(makeUsage({ free_jd_checks_used: 2 }), 'jd_check')).toBe(true)
  })

  it('6. RolePulse paid user is NEVER paywalled regardless of usage', () => {
    const usage = makeUsage({
      paid_status: 'rolepulse_paid',
      free_rescores_used: 99,
      free_jd_checks_used: 99,
    })
    expect(isPaywalled(usage, 'rescore')).toBe(false)
    expect(isPaywalled(usage, 'jd_check')).toBe(false)
  })

  it('7. Stripe paid user is NEVER paywalled', () => {
    const usage = makeUsage({
      paid_status: 'paid_stripe',
      free_rescores_used: 99,
      free_jd_checks_used: 99,
    })
    expect(isPaywalled(usage, 'rescore')).toBe(false)
    expect(isPaywalled(usage, 'jd_check')).toBe(false)
  })

})

// ─── parseAllowlistCSV() unit tests ──────────────────────────────────────────

describe('Epic 10 — parseAllowlistCSV()', () => {

  it('8. Parses a bare email list', () => {
    const csv = 'james@example.com\nsarah@example.com\ntom@example.com'
    expect(parseAllowlistCSV(csv)).toEqual([
      'james@example.com',
      'sarah@example.com',
      'tom@example.com',
    ])
  })

  it('9. Skips header row, strips duplicates, lowercases, handles multi-column CSV', () => {
    const csv = [
      'email,name,plan',
      'James@RolePulse.com,James Fowles,paid',
      'sarah@example.com,Sarah Jones,free',
      'JAMES@rolepulse.com,James Again,paid',   // duplicate (case-insensitive)
      'not-an-email,bad row',                    // invalid — should be skipped
      '',                                         // blank line
      'tom@example.com,Tom Smith,paid',
    ].join('\n')

    const result = parseAllowlistCSV(csv)
    expect(result).toEqual([
      'james@rolepulse.com',
      'sarah@example.com',
      'tom@example.com',
    ])
    expect(result).toHaveLength(3)
    // No duplicates
    expect(new Set(result).size).toBe(result.length)
  })

})
