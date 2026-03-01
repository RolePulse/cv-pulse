// CV Pulse — Share link tests
// Epic 12 | Tests: buildRedactedSummary, calculateExpiresAt, isShareExpired,
//                  buildShareUrl, data shape validation, privacy guarantees.
//
// Level: thorough (18 tests)

import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  buildRedactedSummary,
  calculateExpiresAt,
  isShareExpired,
  buildShareUrl,
} from '@/lib/share'
import type { BucketScores, ChecklistItem, RedactedSummary } from '@/types/database'

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeBucketScores(overrides: Partial<BucketScores> = {}): BucketScores {
  return {
    proof_of_impact: 24,
    ats_keywords: 18,
    formatting: 16,
    clarity: 14,
    ...overrides,
  }
}

function makeChecklist(count = 4): ChecklistItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `check-${i + 1}`,
    done: i === 0,
    action: `Fix item ${i + 1}`,
    why: `This matters because of reason ${i + 1}`,
    example: `Example for item ${i + 1}`,
    points: 5 + i,
  }))
}

function makeScoreRow(overrides: Partial<{
  overall_score: number
  pass_fail: boolean
  bucket_scores_json: BucketScores
  checklist_json: ChecklistItem[]
  created_at: string
}> = {}) {
  return {
    overall_score: 72,
    pass_fail: true,
    bucket_scores_json: makeBucketScores(),
    checklist_json: makeChecklist(),
    created_at: '2026-02-15T10:30:00.000Z',
    ...overrides,
  }
}

// ─── buildRedactedSummary — shape validation ─────────────────────────────────

describe('Epic 12 — buildRedactedSummary()', () => {

  it('1. Returns correct top-level shape with all required fields', () => {
    const summary = buildRedactedSummary(makeScoreRow(), 'Account Executive')

    expect(summary).toHaveProperty('score')
    expect(summary).toHaveProperty('pass_fail')
    expect(summary).toHaveProperty('bucket_scores')
    expect(summary).toHaveProperty('checklist_titles')
    expect(summary).toHaveProperty('target_role')
    expect(summary).toHaveProperty('scored_at')
  })

  it('2. Score and pass_fail match input', () => {
    const summary = buildRedactedSummary(makeScoreRow({ overall_score: 85, pass_fail: true }), 'SDR')

    expect(summary.score).toBe(85)
    expect(summary.pass_fail).toBe(true)
  })

  it('3. Bucket scores match input exactly', () => {
    const buckets = makeBucketScores({ proof_of_impact: 30, ats_keywords: 22, formatting: 18, clarity: 15 })
    const summary = buildRedactedSummary(makeScoreRow({ bucket_scores_json: buckets }), 'AE')

    expect(summary.bucket_scores).toEqual({
      proof_of_impact: 30,
      ats_keywords: 22,
      formatting: 18,
      clarity: 15,
    })
  })

  it('4. Checklist titles are action strings only — no descriptions, no points, no IDs', () => {
    const checklist = makeChecklist(3)
    const summary = buildRedactedSummary(makeScoreRow({ checklist_json: checklist }), 'CSM')

    expect(summary.checklist_titles).toEqual([
      'Fix item 1',
      'Fix item 2',
      'Fix item 3',
    ])
    // Verify these are plain strings, not objects
    summary.checklist_titles.forEach((title) => {
      expect(typeof title).toBe('string')
    })
  })

  it('5. Target role is preserved', () => {
    const summary = buildRedactedSummary(makeScoreRow(), 'Marketing')
    expect(summary.target_role).toBe('Marketing')
  })

  it('6. Target role null is preserved', () => {
    const summary = buildRedactedSummary(makeScoreRow(), null)
    expect(summary.target_role).toBeNull()
  })

  it('7. scored_at matches the score created_at', () => {
    const summary = buildRedactedSummary(
      makeScoreRow({ created_at: '2026-01-20T08:00:00.000Z' }),
      'SDR'
    )
    expect(summary.scored_at).toBe('2026-01-20T08:00:00.000Z')
  })

  it('8. Does NOT contain raw_text, email, name, or structured_json', () => {
    const summary = buildRedactedSummary(makeScoreRow(), 'AE')
    const keys = Object.keys(summary)

    expect(keys).not.toContain('raw_text')
    expect(keys).not.toContain('email')
    expect(keys).not.toContain('name')
    expect(keys).not.toContain('structured_json')
    expect(keys).not.toContain('company')
    expect(keys).not.toContain('contact')
    expect(keys).not.toContain('phone')
    expect(keys).not.toContain('linkedin')
    expect(keys).not.toContain('address')
  })

  it('9. Redacted summary has exactly 6 top-level keys — no extras', () => {
    const summary = buildRedactedSummary(makeScoreRow(), 'SDR')
    const keys = Object.keys(summary)

    expect(keys.sort()).toEqual([
      'bucket_scores',
      'checklist_titles',
      'pass_fail',
      'score',
      'scored_at',
      'target_role',
    ])
  })

  it('10. Empty checklist produces empty titles array', () => {
    const summary = buildRedactedSummary(makeScoreRow({ checklist_json: [] }), 'AE')
    expect(summary.checklist_titles).toEqual([])
    expect(summary.checklist_titles).toHaveLength(0)
  })

  it('11. Failing score (pass_fail=false) is represented correctly', () => {
    const summary = buildRedactedSummary(
      makeScoreRow({ overall_score: 45, pass_fail: false }),
      'SDR'
    )
    expect(summary.score).toBe(45)
    expect(summary.pass_fail).toBe(false)
  })

})

// ─── calculateExpiresAt — expiry timing ──────────────────────────────────────

describe('Epic 12 — calculateExpiresAt()', () => {

  it('12. Expires approximately 90 days from now (+/-5 seconds)', () => {
    const now = new Date()
    const expiresAt = calculateExpiresAt(now)
    const expiresDate = new Date(expiresAt)

    const expected90Days = now.getTime() + 90 * 24 * 60 * 60 * 1000
    const diff = Math.abs(expiresDate.getTime() - expected90Days)

    expect(diff).toBeLessThan(5000) // within 5 seconds
  })

  it('13. Returns a valid ISO 8601 string', () => {
    const expiresAt = calculateExpiresAt()
    const parsed = new Date(expiresAt)
    expect(parsed.toISOString()).toBe(expiresAt)
  })

  it('14. Expiry is in the future', () => {
    const expiresAt = calculateExpiresAt()
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

})

// ─── isShareExpired — expiry checking ────────────────────────────────────────

describe('Epic 12 — isShareExpired()', () => {

  it('15. Returns true for a date in the past', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString()
    expect(isShareExpired(pastDate)).toBe(true)
  })

  it('16. Returns false for a date in the future', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString()
    expect(isShareExpired(futureDate)).toBe(false)
  })

  it('17. Returns false for null expires_at (no expiry set)', () => {
    expect(isShareExpired(null)).toBe(false)
  })

})

// ─── buildShareUrl ───────────────────────────────────────────────────────────

describe('Epic 12 — buildShareUrl()', () => {

  it('18. Builds correct URL format', () => {
    const token = 'abc-123-def-456'
    expect(buildShareUrl(token)).toBe('https://cvpulse.io/share/abc-123-def-456')
  })

})

// ─── Token generation (crypto.randomUUID) ────────────────────────────────────

describe('Epic 12 — Token generation', () => {

  it('19. crypto.randomUUID generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => crypto.randomUUID()))
    expect(tokens.size).toBe(100)
  })

  it('20. Token is a valid UUID v4 format', () => {
    const token = crypto.randomUUID()
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(token).toMatch(uuidRegex)
  })

})

// ─── Real CV integration (buildRedactedSummary with realistic data) ──────────

describe('Epic 12 — Realistic data shapes', () => {

  it('21. High-scoring CV produces correct redacted shape', () => {
    const summary = buildRedactedSummary(
      makeScoreRow({
        overall_score: 92,
        pass_fail: true,
        bucket_scores_json: { proof_of_impact: 33, ats_keywords: 23, formatting: 19, clarity: 17 },
        checklist_json: [
          { id: 'c1', done: true, action: 'Add metrics to recent roles', why: 'Recruiters scan for numbers', example: '', points: 8 },
          { id: 'c2', done: true, action: 'Include LinkedIn URL', why: 'Standard contact info', example: '', points: 3 },
        ],
      }),
      'Account Executive'
    )

    expect(summary.score).toBe(92)
    expect(summary.pass_fail).toBe(true)
    expect(summary.checklist_titles).toEqual([
      'Add metrics to recent roles',
      'Include LinkedIn URL',
    ])
    // No personal data leaked
    const json = JSON.stringify(summary)
    expect(json).not.toContain('email')
    expect(json).not.toContain('@')
    expect(json).not.toContain('linkedin.com')
  })

  it('22. Low-scoring CV with many checklist items', () => {
    const bigChecklist = makeChecklist(15)
    const summary = buildRedactedSummary(
      makeScoreRow({
        overall_score: 35,
        pass_fail: false,
        checklist_json: bigChecklist,
      }),
      'SDR'
    )

    expect(summary.score).toBe(35)
    expect(summary.pass_fail).toBe(false)
    expect(summary.checklist_titles).toHaveLength(15)
    expect(summary.target_role).toBe('SDR')
  })

  it('23. Bucket scores with zero values are preserved', () => {
    const zeroBuckets: BucketScores = {
      proof_of_impact: 0,
      ats_keywords: 0,
      formatting: 0,
      clarity: 0,
    }
    const summary = buildRedactedSummary(
      makeScoreRow({ overall_score: 0, pass_fail: false, bucket_scores_json: zeroBuckets }),
      'Marketing'
    )

    expect(summary.bucket_scores.proof_of_impact).toBe(0)
    expect(summary.bucket_scores.ats_keywords).toBe(0)
    expect(summary.bucket_scores.formatting).toBe(0)
    expect(summary.bucket_scores.clarity).toBe(0)
  })

  it('24. Max bucket scores are preserved', () => {
    const maxBuckets: BucketScores = {
      proof_of_impact: 35,
      ats_keywords: 25,
      formatting: 20,
      clarity: 20,
    }
    const summary = buildRedactedSummary(
      makeScoreRow({ overall_score: 100, pass_fail: true, bucket_scores_json: maxBuckets }),
      'Leadership'
    )

    expect(summary.bucket_scores.proof_of_impact).toBe(35)
    expect(summary.bucket_scores.ats_keywords).toBe(25)
    expect(summary.bucket_scores.formatting).toBe(20)
    expect(summary.bucket_scores.clarity).toBe(20)
    expect(summary.score).toBe(100)
  })

})
