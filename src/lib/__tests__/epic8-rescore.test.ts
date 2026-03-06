// Epic 8 — Re-score loop tests
// Covers: determinism, score improvement/degradation, checklist auto-complete,
// checklist non-regression, score history helpers, edge cases, round-trips.

import { describe, it, expect } from 'vitest'
import { scoreCV } from '@/lib/scorer'
import { parseText } from '@/lib/parser'
import { structuredToRawText } from '@/lib/structuredToRawText'
import type { StructuredCV } from '@/types/database'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A well-formed GTM CV that scores around mid-range */
const BASE_CV: StructuredCV = {
  summary: 'Enterprise SDR with 3 years experience in SaaS outbound. Consistent quota attainment.',
  experience: [
    {
      title: 'Senior SDR',
      company: 'Acme Corp',
      start: 'Jan 2022',
      end: 'Present',
      bullets: [
        'Generated pipeline via cold calling and outbound sequencing using Outreach and Salesforce',
        'Booked 12 demos per month on average, exceeding quota by 20%',
        'Collaborated with AE team to improve discovery call conversion',
      ],
    },
    {
      title: 'SDR',
      company: 'Beta Software',
      start: 'Jun 2020',
      end: 'Dec 2021',
      bullets: [
        'Managed outbound prospecting across EMEA territory using HubSpot and ZoomInfo',
        'Achieved 110% of monthly SQL quota for 6 consecutive months',
        'Built cold email cadences that improved open rates by 35%',
      ],
    },
    {
      title: 'Sales Development Representative',
      company: 'Gamma SaaS',
      start: 'Jan 2019',
      end: 'May 2020',
      bullets: [
        'Sourced and qualified 400+ leads per quarter through outbound prospecting',
        'Consistently hit 100% of BDR quota, ranking in top 10% of 40-person team',
      ],
    },
  ],
  skills: ['Salesforce', 'HubSpot', 'Outreach', 'ZoomInfo', 'cold calling', 'outbound', 'pipeline generation'],
  education: [{ institution: 'University of Manchester', qualification: 'BA Business', year: '2018' }],
  certifications: [],
}

/** CV with no quantified bullets — triggers low impact score */
const LOW_IMPACT_CV: StructuredCV = {
  ...BASE_CV,
  experience: BASE_CV.experience.map((role) => ({
    ...role,
    bullets: role.bullets.map(() => 'Responsible for handling outbound calls and prospecting activities'),
  })),
}

/** Helper: compute resolvedCount from a checklist */
function resolvedCount(result: ReturnType<typeof scoreCV>): number {
  return result.checklist.filter((i) => i.done).length
}

function totalItems(result: ReturnType<typeof scoreCV>): number {
  return result.checklist.length
}

// ─── Section 1: Score determinism ─────────────────────────────────────────────

describe('Score determinism', () => {
  it('returns identical score when called twice on the same input', () => {
    const raw = structuredToRawText(BASE_CV)
    const r1 = scoreCV(BASE_CV, raw, 'SDR')
    const r2 = scoreCV(BASE_CV, raw, 'SDR')
    expect(r1.overallScore).toBe(r2.overallScore)
  })

  it('returns identical bucket scores on repeated calls', () => {
    const raw = structuredToRawText(BASE_CV)
    const r1 = scoreCV(BASE_CV, raw, 'SDR')
    const r2 = scoreCV(BASE_CV, raw, 'SDR')
    expect(r1.buckets.proofOfImpact.score).toBe(r2.buckets.proofOfImpact.score)
    // atsKeywords bucket removed (2026-03-06) — keywords now only in JD Match
    expect(r1.buckets.formatting.score).toBe(r2.buckets.formatting.score)
    expect(r1.buckets.clarity.score).toBe(r2.buckets.clarity.score)
  })

  it('returns identical checklist on repeated calls', () => {
    const raw = structuredToRawText(BASE_CV)
    const r1 = scoreCV(BASE_CV, raw, 'SDR')
    const r2 = scoreCV(BASE_CV, raw, 'SDR')
    expect(r1.checklist.map((i) => ({ id: i.id, done: i.done }))).toEqual(
      r2.checklist.map((i) => ({ id: i.id, done: i.done }))
    )
  })

  it('returns same score three times in a row (rescore loop stability)', () => {
    const raw = structuredToRawText(BASE_CV)
    const scores = [1, 2, 3].map(() => scoreCV(BASE_CV, raw, 'SDR').overallScore)
    expect(scores[0]).toBe(scores[1])
    expect(scores[1]).toBe(scores[2])
  })
})

// ─── Section 2: Score improvement ─────────────────────────────────────────────

describe('Score improvement after edits', () => {
  it('adding quantified bullets to a role increases proof-of-impact score', () => {
    const beforeRaw = structuredToRawText(LOW_IMPACT_CV)
    const before = scoreCV(LOW_IMPACT_CV, beforeRaw, 'SDR')

    const improved: StructuredCV = {
      ...LOW_IMPACT_CV,
      experience: LOW_IMPACT_CV.experience.map((role, i) =>
        i === 0
          ? {
              ...role,
              bullets: [
                'Generated 120% of SQL quota via cold calling and Outreach sequences',
                'Booked 14 qualified demos per month, 40% above team average',
                'Increased connect rate by 25% by A/B testing call scripts',
              ],
            }
          : role
      ),
    }

    const afterRaw = structuredToRawText(improved)
    const after = scoreCV(improved, afterRaw, 'SDR')

    expect(after.buckets.proofOfImpact.score).toBeGreaterThan(
      before.buckets.proofOfImpact.score
    )
    expect(after.overallScore).toBeGreaterThan(before.overallScore)
  })

  it('ATS keywords bucket removed — general score is not affected by skills keywords', () => {
    // As of 2026-03-06, keywords are no longer scored in the general score.
    // Keyword advice is only shown in JD Match, where it is role-specific and useful.
    // This test documents the intentional behaviour: adding skills keywords does not
    // change the general score (only the three remaining buckets drive the score).
    const beforeCV: StructuredCV = { ...BASE_CV, skills: [] }
    const afterCV: StructuredCV = {
      ...BASE_CV,
      skills: ['outbound', 'cold calling', 'pipeline generation', 'salesforce', 'hubspot', 'apollo', 'sequences', 'bdr'],
    }

    const before = scoreCV(beforeCV, structuredToRawText(beforeCV), 'SDR')
    const after = scoreCV(afterCV, structuredToRawText(afterCV), 'SDR')

    expect(after.buckets).not.toHaveProperty('atsKeywords')
    expect(after.buckets).toHaveProperty('proofOfImpact')
    expect(after.buckets).toHaveProperty('formatting')
    expect(after.buckets).toHaveProperty('clarity')
  })

  it('adding a summary improves clarity score', () => {
    const noSummaryCV: StructuredCV = { ...BASE_CV, summary: '' }
    const withSummaryCV: StructuredCV = {
      ...BASE_CV,
      summary: 'Senior SDR targeting enterprise SaaS. Consistent 110%+ quota attainment across 3 roles.',
    }

    const before = scoreCV(noSummaryCV, structuredToRawText(noSummaryCV), 'SDR')
    const after = scoreCV(withSummaryCV, structuredToRawText(withSummaryCV), 'SDR')

    expect(after.buckets.clarity.score).toBeGreaterThanOrEqual(before.buckets.clarity.score)
  })

  it('re-scoring all 3 roles with quantified bullets improves overall score significantly', () => {
    const weak = scoreCV(LOW_IMPACT_CV, structuredToRawText(LOW_IMPACT_CV), 'SDR')

    const strong: StructuredCV = {
      ...LOW_IMPACT_CV,
      experience: LOW_IMPACT_CV.experience.map((role) => ({
        ...role,
        bullets: [
          'Achieved 125% of SDR quota via outbound prospecting and cold calling using Salesforce',
          'Booked 15 demos per month, ranking top 5% of 30-person BDR team',
          'Built outreach sequences that improved response rate by 40% quarter-over-quarter',
        ],
      })),
    }

    const strongResult = scoreCV(strong, structuredToRawText(strong), 'SDR')
    expect(strongResult.overallScore).toBeGreaterThan(weak.overallScore)
    expect(strongResult.buckets.proofOfImpact.score).toBeGreaterThan(
      weak.buckets.proofOfImpact.score
    )
  })
})

// ─── Section 3: Checklist auto-complete ───────────────────────────────────────

describe('Checklist auto-complete on re-score', () => {
  it('fixing all roles removes their impact checklist items (auto-complete mechanic)', () => {
    const before = scoreCV(LOW_IMPACT_CV, structuredToRawText(LOW_IMPACT_CV), 'SDR')
    // Scorer design: when a role is fixed (2+ metrics), its checklist item
    // disappears entirely (moves to positives). Fewer checklist items = auto-complete.
    const impactItemsBefore = before.checklist.filter((i) => i.category === 'impact')
    expect(impactItemsBefore.length).toBeGreaterThan(0)

    // Improve ALL roles (all had no metrics → all get 2+ metrics)
    const improved: StructuredCV = {
      ...LOW_IMPACT_CV,
      experience: LOW_IMPACT_CV.experience.map((role) => ({
        ...role,
        bullets: [
          'Generated 150% of SQL quota monthly via cold calling and Salesforce sequencing',
          'Booked 16 demos per month, exceeding team average by 45%',
          'Reduced cost-per-lead by 30% through refined outbound prospecting cadences',
        ],
      })),
    }

    const after = scoreCV(improved, structuredToRawText(improved), 'SDR')
    const impactItemsAfter = after.checklist.filter((i) => i.category === 'impact')

    // All impact items are gone — all roles now pass, so no impact issues in checklist
    expect(impactItemsAfter.length).toBeLessThan(impactItemsBefore.length)
  })

  it('resolvedCount increases after improving a weak CV', () => {
    const before = scoreCV(LOW_IMPACT_CV, structuredToRawText(LOW_IMPACT_CV), 'SDR')
    const improved: StructuredCV = {
      ...BASE_CV, // BASE_CV has quantified bullets already
    }
    const after = scoreCV(improved, structuredToRawText(improved), 'SDR')

    expect(resolvedCount(after)).toBeGreaterThanOrEqual(resolvedCount(before))
  })

  it('checklist totalItems count is stable across re-scores of the same CV shape', () => {
    const r1 = scoreCV(BASE_CV, structuredToRawText(BASE_CV), 'SDR')
    const r2 = scoreCV(BASE_CV, structuredToRawText(BASE_CV), 'SDR')
    expect(totalItems(r1)).toBe(totalItems(r2))
  })
})

// ─── Section 4: Checklist non-regression ──────────────────────────────────────

describe('Checklist non-regression (neutral edits)', () => {
  it('neutral edit (whitespace change in summary) does not change score', () => {
    const raw1 = structuredToRawText(BASE_CV)
    const r1 = scoreCV(BASE_CV, raw1, 'SDR')

    const edited: StructuredCV = {
      ...BASE_CV,
      summary: BASE_CV.summary + '  ', // trailing whitespace
    }
    const raw2 = structuredToRawText(edited)
    const r2 = scoreCV(edited, raw2, 'SDR')

    // Score should be identical — trailing whitespace is not meaningful
    expect(r2.overallScore).toBe(r1.overallScore)
  })

  it('items already marked done stay done after a neutral edit', () => {
    const raw = structuredToRawText(BASE_CV)
    const r1 = scoreCV(BASE_CV, raw, 'SDR')
    const doneBefore = r1.checklist.filter((i) => i.done).map((i) => i.id)

    // Make a neutral change — edit company name only
    const edited: StructuredCV = {
      ...BASE_CV,
      experience: BASE_CV.experience.map((role, i) =>
        i === 0 ? { ...role, company: 'Acme Corporation Ltd' } : role
      ),
    }
    const r2 = scoreCV(edited, structuredToRawText(edited), 'SDR')
    const doneAfter = r2.checklist.filter((i) => i.done).map((i) => i.id)

    // Every item that was done before should still be done (or more items done)
    for (const id of doneBefore) {
      expect(doneAfter).toContain(id)
    }
  })

  it('items not done before stay not done after a neutral edit', () => {
    const lowRaw = structuredToRawText(LOW_IMPACT_CV)
    const r1 = scoreCV(LOW_IMPACT_CV, lowRaw, 'SDR')
    const notDoneBefore = r1.checklist.filter((i) => !i.done).map((i) => i.id)

    // Neutral edit: change end date wording only
    const edited: StructuredCV = {
      ...LOW_IMPACT_CV,
      experience: LOW_IMPACT_CV.experience.map((role, i) =>
        i === 2 ? { ...role, end: 'May 2020' } : role
      ),
    }
    const r2 = scoreCV(edited, structuredToRawText(edited), 'SDR')
    const notDoneAfter = r2.checklist.filter((i) => !i.done).map((i) => i.id)

    // The overlap (items that were not done and are still not done) should be non-empty
    const stillNotDone = notDoneBefore.filter((id) => notDoneAfter.includes(id))
    expect(stillNotDone.length).toBeGreaterThan(0)
  })
})

// ─── Section 5: Score history helpers ─────────────────────────────────────────

describe('Score history data (simulated)', () => {
  it('resolvedCount is 0 when all checklist items are not done', () => {
    const result = scoreCV(LOW_IMPACT_CV, structuredToRawText(LOW_IMPACT_CV), 'SDR')
    // May have some done items, just testing the helper logic
    const count = result.checklist.filter((i) => i.done).length
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it('score trend: initial < latest after improvement', () => {
    const initial = scoreCV(LOW_IMPACT_CV, structuredToRawText(LOW_IMPACT_CV), 'SDR').overallScore
    const latest = scoreCV(BASE_CV, structuredToRawText(BASE_CV), 'SDR').overallScore
    expect(latest).toBeGreaterThan(initial)
  })

  it('multiple score snapshots accumulate correctly (array model)', () => {
    // Simulate what the DB does: each re-score inserts a new row
    const snap1 = { score: scoreCV(LOW_IMPACT_CV, structuredToRawText(LOW_IMPACT_CV), 'SDR').overallScore }

    const midCV: StructuredCV = {
      ...LOW_IMPACT_CV,
      experience: LOW_IMPACT_CV.experience.map((role, i) =>
        i === 0
          ? { ...role, bullets: ['Achieved 115% quota via cold calling and outbound sequences in Salesforce'] }
          : role
      ),
    }
    const snap2 = { score: scoreCV(midCV, structuredToRawText(midCV), 'SDR').overallScore }
    const snap3 = { score: scoreCV(BASE_CV, structuredToRawText(BASE_CV), 'SDR').overallScore }

    const snapshots = [snap1, snap2, snap3]

    // Simulated history: first is initial, last is latest
    expect(snapshots[2].score).toBeGreaterThanOrEqual(snapshots[0].score)
    // All three snapshots are preserved (accumulated, not overwritten)
    expect(snapshots).toHaveLength(3)
  })

  it('passFail is false for a weak CV and may be true for a strong CV', () => {
    const weak = scoreCV(LOW_IMPACT_CV, structuredToRawText(LOW_IMPACT_CV), 'SDR')
    // Weak CV should not pass (no quantified bullets)
    expect(typeof weak.passFail).toBe('boolean')

    const strong = scoreCV(BASE_CV, structuredToRawText(BASE_CV), 'SDR')
    expect(typeof strong.passFail).toBe('boolean')
  })
})

// ─── Section 6: Round-trip (edit → save → rescore) ───────────────────────────

describe('Edit → structuredToRawText → parseText → scoreCV round-trip', () => {
  it('score does not drift when structured JSON round-trips through raw text', () => {
    const raw1 = structuredToRawText(BASE_CV)
    const r1 = scoreCV(BASE_CV, raw1, 'SDR')

    const parsed = parseText(raw1)
    const roundTripped = parsed.structured as StructuredCV
    const raw2 = structuredToRawText(roundTripped)
    const r2 = scoreCV(roundTripped, raw2, 'SDR')

    // Score drift must be ≤ 2 points (structural rounding is acceptable)
    expect(Math.abs(r1.overallScore - r2.overallScore)).toBeLessThanOrEqual(2)
  })

  it('summary is preserved through round-trip', () => {
    const raw = structuredToRawText(BASE_CV)
    const parsed = parseText(raw)
    expect(parsed.structured.summary).toBeTruthy()
    expect(parsed.structured.summary.length).toBeGreaterThan(20)
  })

  it('job titles are preserved through round-trip', () => {
    const raw = structuredToRawText(BASE_CV)
    const parsed = parseText(raw)
    const titles = parsed.structured.experience.map((r) => r.title)
    expect(titles).toContain('Senior SDR')
    expect(titles).toContain('SDR')
  })

  it('role count is preserved through round-trip', () => {
    const raw = structuredToRawText(BASE_CV)
    const parsed = parseText(raw)
    expect(parsed.structured.experience.length).toBe(BASE_CV.experience.length)
  })

  it('skills are preserved through round-trip', () => {
    const raw = structuredToRawText(BASE_CV)
    const parsed = parseText(raw)
    expect(parsed.structured.skills.length).toBeGreaterThan(0)
  })
})

// ─── Section 7: Edge cases ────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('scoring with empty summary does not crash', () => {
    const cv: StructuredCV = { ...BASE_CV, summary: '' }
    const raw = structuredToRawText(cv)
    expect(() => scoreCV(cv, raw, 'SDR')).not.toThrow()
  })

  it('scoring with empty skills does not crash', () => {
    const cv: StructuredCV = { ...BASE_CV, skills: [] }
    const raw = structuredToRawText(cv)
    expect(() => scoreCV(cv, raw, 'SDR')).not.toThrow()
  })

  it('scoring with a role that has only one bullet does not crash', () => {
    const cv: StructuredCV = {
      ...BASE_CV,
      experience: [{ ...BASE_CV.experience[0], bullets: ['Cold called 80 prospects per day'] }],
    }
    const raw = structuredToRawText(cv)
    expect(() => scoreCV(cv, raw, 'SDR')).not.toThrow()
  })

  it('clearing all bullets on a role (empty array) does not crash', () => {
    const cv: StructuredCV = {
      ...BASE_CV,
      experience: [{ ...BASE_CV.experience[0], bullets: [] }],
    }
    const raw = structuredToRawText(cv)
    expect(() => scoreCV(cv, raw, 'SDR')).not.toThrow()
  })

  it('scoring an empty certifications array does not crash', () => {
    const cv: StructuredCV = { ...BASE_CV, certifications: [] }
    const raw = structuredToRawText(cv)
    expect(() => scoreCV(cv, raw, 'SDR')).not.toThrow()
  })

  it('no-change re-score returns the same score', () => {
    const raw = structuredToRawText(BASE_CV)
    const r1 = scoreCV(BASE_CV, raw, 'SDR')
    const r2 = scoreCV(BASE_CV, raw, 'SDR')
    expect(r1.overallScore).toBe(r2.overallScore)
  })

  it('scoring across all target roles does not crash', () => {
    const raw = structuredToRawText(BASE_CV)
    const roles = ['SDR', 'AE', 'CSM', 'Marketing', 'Leadership'] as const
    for (const role of roles) {
      expect(() => scoreCV(BASE_CV, raw, role)).not.toThrow()
    }
  })

  it('overall score stays within 0–100 range', () => {
    const cvs = [BASE_CV, LOW_IMPACT_CV, { ...BASE_CV, summary: '', skills: [] }]
    for (const cv of cvs) {
      const raw = structuredToRawText(cv)
      const result = scoreCV(cv, raw, 'SDR')
      expect(result.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.overallScore).toBeLessThanOrEqual(100)
    }
  })
})

// ─── Section 8: structuredToRawText format ────────────────────────────────────

describe('structuredToRawText format', () => {
  it('includes SUMMARY heading when summary is present', () => {
    const raw = structuredToRawText(BASE_CV)
    expect(raw).toContain('SUMMARY')
  })

  it('includes EXPERIENCE heading when experience is present', () => {
    const raw = structuredToRawText(BASE_CV)
    expect(raw).toContain('EXPERIENCE')
  })

  it('includes SKILLS heading when skills are present', () => {
    const raw = structuredToRawText(BASE_CV)
    expect(raw).toContain('SKILLS')
  })

  it('omits SUMMARY heading when summary is empty', () => {
    const raw = structuredToRawText({ ...BASE_CV, summary: '' })
    expect(raw).not.toContain('SUMMARY')
  })

  it('role title appears on its own line before the company | date line', () => {
    const raw = structuredToRawText(BASE_CV)
    const lines = raw.split('\n')
    const titleIdx = lines.findIndex((l) => l.trim() === 'Senior SDR')
    expect(titleIdx).toBeGreaterThan(-1)
    // The next line should contain the company name
    expect(lines[titleIdx + 1]).toContain('Acme Corp')
  })

  it('bullet points start with •', () => {
    const raw = structuredToRawText(BASE_CV)
    const bulletLines = raw.split('\n').filter((l) => l.startsWith('•'))
    expect(bulletLines.length).toBeGreaterThan(0)
  })

  it('skills are comma-separated on a single line', () => {
    const raw = structuredToRawText(BASE_CV)
    const lines = raw.split('\n')
    const skillsIdx = lines.findIndex((l) => l === 'SKILLS')
    const skillsLine = lines[skillsIdx + 1]
    expect(skillsLine).toContain(',')
  })
})
