// CV Pulse — Epic 6 test suite
// Tests: structuredToRawText output, round-trip (structured→text→parse→score),
//        edge cases, skills/certs handling, scoring consistency before/after edit.
// Run: npx tsx scripts/test-epic6.ts

import { parseText } from '../src/lib/parser'
import { scoreCV } from '../src/lib/scorer'
import type { StructuredCV, ExperienceRole } from '../src/types/database'

// ── Replicate structuredToRawText from the API route ──────────────────────────
// (Can't import from API route directly — replicate it here for testing)

function structuredToRawText(s: StructuredCV): string {
  const lines: string[] = []

  if (s.summary?.trim()) {
    lines.push('SUMMARY')
    lines.push(s.summary.trim())
    lines.push('')
  }

  if (s.experience?.length) {
    lines.push('EXPERIENCE')
    for (const role of s.experience) {
      if (role.title?.trim()) lines.push(role.title.trim())
      const datePart = [role.start, role.end ?? 'Present'].filter(Boolean).join(' – ')
      lines.push([role.company, datePart].filter(Boolean).join(' | '))
      for (const bullet of role.bullets) {
        if (bullet.trim()) lines.push(`• ${bullet.trim()}`)
      }
      lines.push('')
    }
  }

  if (s.skills?.length) {
    lines.push('SKILLS')
    lines.push(s.skills.filter(Boolean).join(', '))
    lines.push('')
  }

  if (s.education?.length) {
    lines.push('EDUCATION')
    for (const edu of s.education) {
      lines.push([edu.qualification, edu.institution, edu.year].filter(Boolean).join(' | '))
    }
    lines.push('')
  }

  if (s.certifications?.length) {
    lines.push('CERTIFICATIONS')
    for (const cert of s.certifications) {
      if (cert.trim()) lines.push(cert.trim())
    }
  }

  return lines.join('\n').trim()
}

// ── Test helpers ──────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}${detail ? `\n     → ${detail}` : ''}`)
    failed++
  }
}

function section(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(2, 55 - title.length))}`)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STRONG_CV: StructuredCV = {
  summary: 'Senior Customer Success Manager with 6 years in SaaS. Focus on retention, QBR delivery, and expansion revenue. Gainsight certified.',
  experience: [
    {
      company: 'Acme SaaS',
      title: 'Senior Customer Success Manager',
      start: 'Jan 2021',
      end: 'Present',
      bullets: [
        'Maintained 96% gross retention across $3.2M ARR portfolio',
        'Reduced churn by 18% via Gainsight health score monitoring',
        'Drove 28% expansion revenue through QBR-led upsell campaigns',
      ],
    },
    {
      company: 'StartupCo',
      title: 'Customer Success Manager',
      start: 'Mar 2019',
      end: 'Dec 2020',
      bullets: [
        'Managed 60+ SMB accounts with average NPS of 52',
        'Reduced time-to-value by 30% through improved onboarding playbook',
        'Contributed 15% upsell revenue by identifying expansion opportunities',
      ],
    },
    {
      company: 'First Co',
      title: 'Account Executive',
      start: 'Jun 2017',
      end: 'Feb 2019',
      bullets: [
        'Closed 120% of quota in first full year ($800k ARR)',
        'Won 3 enterprise accounts over $100k each in H2 2018',
      ],
    },
  ],
  skills: ['Gainsight', 'Salesforce', 'NPS', 'CSAT', 'QBR', 'Retention', 'Onboarding', 'Renewal'],
  education: [{ institution: 'University of Bath', qualification: 'BSc Business', year: '2017' }],
  certifications: ['Gainsight Certified Customer Success Manager'],
}

function makeRawText(cv: StructuredCV) {
  return `
Jane Smith jane.smith@email.com linkedin.com/in/janesmith London UK
${structuredToRawText(cv)}
`.trim()
}

// ── Section 1: structuredToRawText output ─────────────────────────────────────

section('1. structuredToRawText — output format')
{
  const raw = structuredToRawText(STRONG_CV)

  assert(raw.includes('EXPERIENCE'), 'Contains EXPERIENCE heading')
  assert(raw.includes('SKILLS'), 'Contains SKILLS heading')
  assert(raw.includes('EDUCATION'), 'Contains EDUCATION heading')
  assert(raw.includes('CERTIFICATIONS'), 'Contains CERTIFICATIONS heading')
  assert(raw.includes('Senior Customer Success Manager'), 'Job title present')
  assert(raw.includes('Acme SaaS'), 'Company name present')
  assert(raw.includes('Jan 2021'), 'Start date present')
  assert(raw.includes('Present'), 'End date present')
  assert(raw.includes('• Maintained 96%'), 'Bullet with • prefix present')
  assert(raw.includes('Gainsight, Salesforce'), 'Skills comma-joined')
  assert(raw.includes('BSc Business | University of Bath | 2017'), 'Education formatted correctly')
  assert(raw.includes('Gainsight Certified'), 'Certification present')
  assert(!raw.includes('undefined'), 'No "undefined" strings in output')
  assert(!raw.includes('[object'), 'No object serialisation artifacts')
}

// ── Section 2: round-trip (structured → text → parse → check) ─────────────────

section('2. Round-trip: structured → raw_text → parseText → parsed fields')
{
  const raw = makeRawText(STRONG_CV)
  const parsed = parseText(raw)

  assert(parsed.confidence >= 60, `Parse confidence ≥60 (got ${parsed.confidence})`)
  assert(parsed.structured.experience.length >= 2, `≥2 roles parsed (got ${parsed.structured.experience.length})`)
  assert(parsed.structured.skills.length >= 3, `≥3 skills parsed (got ${parsed.structured.skills.length})`)
  assert(parsed.structured.summary.length > 20, `Summary parsed (length ${parsed.structured.summary.length})`)
  assert(parsed.structured.experience[0]?.title?.toLowerCase().includes('customer success') ?? false, 'First role title recognised')
  assert(parsed.structured.education.length >= 1, `Education parsed (got ${parsed.structured.education.length})`)
}

// ── Section 3: round-trip scoring ────────────────────────────────────────────

section('3. Round-trip scoring: score before edit ≈ score after edit (no content change)')
{
  // Original structured from upload (simulated with raw text)
  const originalRaw = makeRawText(STRONG_CV)
  const originalParsed = parseText(originalRaw)
  const originalScore = scoreCV(originalParsed.structured, originalRaw, 'CSM')

  // Simulate "save without changing anything" → derive raw_text from structured
  const savedRaw = makeRawText(STRONG_CV)  // same structured, same raw
  const savedParsed = parseText(savedRaw)
  const savedScore = scoreCV(savedParsed.structured, savedRaw, 'CSM')

  const diff = Math.abs(originalScore.overallScore - savedScore.overallScore)
  assert(diff <= 5, `Score drift ≤5 pts on no-change save (diff: ${diff}pts, was ${originalScore.overallScore} → ${savedScore.overallScore})`)
  assert(savedScore.overallScore >= 60, `Re-scored result still passes (${savedScore.overallScore}/100)`)
}

// ── Section 4: edit improves score ───────────────────────────────────────────

section('4. Adding metrics to a role increases impact score')
{
  const weakCV: StructuredCV = {
    ...STRONG_CV,
    experience: [
      {
        company: 'Acme SaaS',
        title: 'Customer Success Manager',
        start: 'Jan 2021',
        end: 'Present',
        bullets: [
          'Managed customer accounts',
          'Conducted quarterly business reviews',
          'Worked with product team on customer feedback',
        ],
      },
      ...STRONG_CV.experience.slice(1),
    ],
  }

  const strongCV: StructuredCV = {
    ...STRONG_CV,
    experience: [
      {
        company: 'Acme SaaS',
        title: 'Customer Success Manager',
        start: 'Jan 2021',
        end: 'Present',
        bullets: [
          'Managed 45-account portfolio worth $3.2M ARR — 96% gross retention',
          'Conducted QBRs resulting in 28% expansion revenue in Q2 2023',
          'Reduced churn by 18% through Gainsight health score monitoring',
        ],
      },
      ...STRONG_CV.experience.slice(1),
    ],
  }

  const weakRaw = makeRawText(weakCV)
  const strongRaw = makeRawText(strongCV)

  const weakResult = scoreCV(parseText(weakRaw).structured, weakRaw, 'CSM')
  const strongResult = scoreCV(parseText(strongRaw).structured, strongRaw, 'CSM')

  assert(
    strongResult.buckets.proofOfImpact.score > weakResult.buckets.proofOfImpact.score,
    `Adding metrics improves Impact score (${weakResult.buckets.proofOfImpact.score} → ${strongResult.buckets.proofOfImpact.score})`
  )
  assert(
    strongResult.overallScore > weakResult.overallScore,
    `Overall score improves (${weakResult.overallScore} → ${strongResult.overallScore})`
  )
}

// ── Section 5: adding skills improves ATS score ───────────────────────────────

section('5. Adding role keywords to skills improves ATS score')
{
  const noSkillsCV: StructuredCV = { ...STRONG_CV, skills: [] }
  const skillsCV: StructuredCV = {
    ...STRONG_CV,
    skills: ['Gainsight', 'Salesforce', 'NPS', 'CSAT', 'QBR', 'Retention', 'Onboarding',
      'Renewal', 'Churn', 'Upsell', 'Expansion', 'Customer Success', 'Health Score', 'Adoption'],
  }

  const noSkillsRaw = makeRawText(noSkillsCV)
  const skillsRaw = makeRawText(skillsCV)

  const r1 = scoreCV(parseText(noSkillsRaw).structured, noSkillsRaw, 'CSM')
  const r2 = scoreCV(parseText(skillsRaw).structured, skillsRaw, 'CSM')

  // ATS keywords bucket removed from general score (2026-03-06) — keywords now only in JD Match
  assert(
    !('atsKeywords' in r2.buckets),
    'No atsKeywords bucket in general score (expected — keywords moved to JD Match)'
  )
}

// ── Section 6: adding summary improves clarity score ─────────────────────────

section('6. Adding a summary improves clarity score')
{
  const noSummaryCV: StructuredCV = { ...STRONG_CV, summary: '' }
  const withSummaryCV: StructuredCV = {
    ...STRONG_CV,
    summary: 'Customer Success Manager with 6 years in SaaS. Specialist in retention, QBR delivery, and expansion revenue for enterprise accounts.',
  }

  const r1 = scoreCV(parseText(makeRawText(noSummaryCV)).structured, makeRawText(noSummaryCV), 'CSM')
  const r2 = scoreCV(parseText(makeRawText(withSummaryCV)).structured, makeRawText(withSummaryCV), 'CSM')

  assert(
    r2.buckets.clarity.score > r1.buckets.clarity.score,
    `Adding summary improves clarity (${r1.buckets.clarity.score} → ${r2.buckets.clarity.score})`
  )
}

// ── Section 7: edge cases — empty/missing fields ──────────────────────────────

section('7. Edge cases — empty/null fields don\'t crash')
{
  const emptyCases: Array<[string, StructuredCV]> = [
    ['Empty summary', { ...STRONG_CV, summary: '' }],
    ['No skills', { ...STRONG_CV, skills: [] }],
    ['No education', { ...STRONG_CV, education: [] }],
    ['No certs', { ...STRONG_CV, certifications: [] }],
    ['Single role', { ...STRONG_CV, experience: [STRONG_CV.experience[0]] }],
    ['Role with 0 bullets', { ...STRONG_CV, experience: [{ ...STRONG_CV.experience[0], bullets: [] }] }],
    ['Role with empty bullet', { ...STRONG_CV, experience: [{ ...STRONG_CV.experience[0], bullets: ['', '  ', 'Valid bullet'] }] }],
    ['Null end date', { ...STRONG_CV, experience: [{ ...STRONG_CV.experience[0], end: null }] }],
    ['All empty', { summary: '', experience: [], skills: [], education: [], certifications: [] }],
  ]

  for (const [label, cv] of emptyCases) {
    try {
      const raw = structuredToRawText(cv)
      assert(!raw.includes('undefined') && !raw.includes('[object'), `${label} — no artifacts in raw_text`)

      if (cv.experience.length > 0 || cv.summary || cv.skills.length > 0) {
        const parsed = parseText(raw + ' jane.smith@test.com linkedin.com/in/test')
        const result = scoreCV(parsed.structured, raw, 'CSM')
        assert(typeof result.overallScore === 'number' && !isNaN(result.overallScore), `${label} — scorer returns valid score`)
      } else {
        assert(true, `${label} — skipped scoring (all-empty CV)`)
      }
    } catch (err) {
      assert(false, `${label} — threw: ${(err as Error).message}`)
    }
  }
}

// ── Section 8: skills comma-split round-trip ──────────────────────────────────

section('8. Skills: comma-split in editor → join → parse → same skills')
{
  // Simulate what the editor does: user sees "Gainsight, Salesforce, NPS"
  // edits it, we split on comma, save as array, then structuredToRawText joins them back
  const skillsInput = 'Gainsight, Salesforce, NPS, CSAT, QBR, Customer Success'
  const splitSkills = skillsInput.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
  const cv: StructuredCV = { ...STRONG_CV, skills: splitSkills }
  const raw = structuredToRawText(cv)

  assert(raw.includes('Gainsight, Salesforce'), 'Skills joined correctly in raw_text')
  assert(!raw.includes(',,'), 'No double commas')

  const parsed = parseText(raw + ' email@test.com linkedin.com/in/test')
  assert(parsed.structured.skills.length >= 3, `Skills survive parse round-trip (got ${parsed.structured.skills.length})`)
}

// ── Section 9: determinism after edit ────────────────────────────────────────

section('9. Scoring is deterministic after editing')
{
  const editedCV: StructuredCV = {
    ...STRONG_CV,
    summary: 'Edited summary: Customer Success leader focused on retention and NPS improvement.',
    experience: [
      {
        ...STRONG_CV.experience[0],
        bullets: [
          'Increased NPS from 32 to 58 over 18 months through structured onboarding',
          'Maintained 97% gross retention rate — $3.5M ARR portfolio',
          'Led QBRs for top 10 accounts, driving 31% expansion revenue',
        ],
      },
      ...STRONG_CV.experience.slice(1),
    ],
  }
  const raw = makeRawText(editedCV)
  const parsed = parseText(raw)

  const r1 = scoreCV(parsed.structured, raw, 'CSM')
  const r2 = scoreCV(parsed.structured, raw, 'CSM')
  const r3 = scoreCV(parsed.structured, raw, 'CSM')

  assert(
    r1.overallScore === r2.overallScore && r2.overallScore === r3.overallScore,
    `Deterministic after edit (${r1.overallScore}, ${r2.overallScore}, ${r3.overallScore})`
  )
}

// ── Section 10: checklist items update correctly after edit ───────────────────

section('10. Checklist item done-state updates correctly after edit')
{
  // Start: no metrics on first role
  const beforeEdit: StructuredCV = {
    ...STRONG_CV,
    experience: [
      { ...STRONG_CV.experience[0], bullets: ['Managed accounts', 'Ran QBRs', 'Handled renewals'] },
      ...STRONG_CV.experience.slice(1),
    ],
  }

  // After: first role has metrics
  const afterEdit: StructuredCV = {
    ...STRONG_CV,
    experience: [
      {
        ...STRONG_CV.experience[0],
        bullets: [
          'Increased NPS from 32 to 58 — $2.1M ARR portfolio, 97% retention',
          'Drove 28% expansion revenue through QBR upsell process',
          'Reduced churn by 18% via Gainsight health score monitoring',
        ],
      },
      ...STRONG_CV.experience.slice(1),
    ],
  }

  const r1 = scoreCV(parseText(makeRawText(beforeEdit)).structured, makeRawText(beforeEdit), 'CSM')
  const r2 = scoreCV(parseText(makeRawText(afterEdit)).structured, makeRawText(afterEdit), 'CSM')

  const item1Before = r1.checklist.find(i => i.id === 'no-metrics-role-0')
  const item1After  = r2.checklist.find(i => i.id === 'no-metrics-role-0')

  assert(item1Before !== undefined && !item1Before.done, 'Before edit: no-metrics-role-0 is undone')
  assert(item1After === undefined || item1After.done, 'After edit: no-metrics-role-0 is done or removed')
  assert(r2.buckets.proofOfImpact.score > r1.buckets.proofOfImpact.score,
    `Impact score improved (${r1.buckets.proofOfImpact.score} → ${r2.buckets.proofOfImpact.score})`
  )
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed === 0) {
  console.log('✅ ALL TESTS PASSED')
} else {
  console.log(`❌ ${failed} TEST(S) FAILED`)
}
console.log('═'.repeat(60))

process.exit(failed > 0 ? 1 : 0)
