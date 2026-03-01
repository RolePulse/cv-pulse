// CV Pulse — Deterministic Scoring Engine
// Epic 4 | No LLM. Same input = same output. Always.
//
// Score pipeline:
//   structured_json + raw_text + targetRole
//   → critical concerns check (instant fail)
//   → 4 bucket scores (impact 35 · ats 25 · formatting 20 · clarity 20)
//   → checklist items (actionable, with done detection)
//   → ScoreResult

import type { StructuredCV, ExperienceRole } from '@/types/database'
import type { TargetRole } from '@/lib/roleDetect'

// ─── Output types ────────────────────────────────────────────────────────────

export interface BucketResult {
  score: number
  maxScore: number
  positives: string[]
  issues: string[]
}

export interface ScorerChecklistItem {
  id: string
  category: 'critical' | 'impact' | 'ats' | 'formatting' | 'clarity'
  action: string
  whyItMatters: string
  potentialPoints: number
  done: boolean
}

export interface ScoreResult {
  overallScore: number          // 0–100
  passFail: boolean             // true = pass (≥70 AND no critical concerns)
  criticalConcerns: string[]    // list of instant-fail reasons
  buckets: {
    proofOfImpact: BucketResult   // max 35
    atsKeywords: BucketResult     // max 25
    formatting: BucketResult      // max 20
    clarity: BucketResult         // max 20
  }
  checklist: ScorerChecklistItem[]
  targetRole: TargetRole
  // Transparent keyword data (shown in UI)
  keywordData: {
    role: TargetRole
    total: number
    matched: string[]
    missing: string[]
  }
}

// ─── ATS keyword sets per role ────────────────────────────────────────────────
// Shown transparently in the UI — full visibility of what we're checking

const ATS_KEYWORDS: Record<TargetRole, string[]> = {
  SDR: [
    'outbound', 'prospecting', 'cold calling', 'sequences', 'pipeline',
    'sql', 'mql', 'outreach', 'salesloft', 'hubspot', 'salesforce',
    'quota', 'cold email', 'discovery', 'cadence', 'gong', 'zoominfo',
    'apollo', 'connect rate', 'demos booked', 'meetings booked',
    'pipeline generation', 'lead qualification', 'bdr', 'sdr',
  ],
  AE: [
    'closing', 'quota', 'arr', 'acv', 'enterprise', 'mid-market',
    'discovery', 'negotiation', 'contract', 'upsell', 'expansion',
    'salesforce', 'pipeline', 'forecast', 'meddic', 'new business',
    'new logo', 'deal cycle', 'win rate', 'revenue', 'b2b',
    'champion', 'proposals', 'territory', 'sales cycle',
  ],
  CSM: [
    'retention', 'churn', 'nps', 'csat', 'health score', 'onboarding',
    'qbr', 'renewal', 'expansion', 'upsell', 'gainsight', 'adoption',
    'customer success', 'stakeholder', 'escalation', 'roi', 'ebr',
    'lifecycle', 'playbook', 'at-risk', 'value realization',
    'success plan', 'totango', 'account management', 'risk',
  ],
  Marketing: [
    'demand gen', 'demand generation', 'content marketing', 'seo', 'sem',
    'paid social', 'email marketing', 'hubspot', 'marketo', 'abm',
    'mql', 'attribution', 'conversion rate', 'a/b testing', 'campaigns',
    'ctr', 'google analytics', 'linkedin ads', 'automation', 'inbound',
    'webinars', 'budget', 'pipeline', 'account based marketing',
  ],
  Leadership: [
    'revenue', 'p&l', 'arr', 'quota', 'forecast', 'hiring', 'coaching',
    'strategy', 'okrs', 'board', 'gtm', 'cross-functional', 'stakeholder',
    'headcount', 'performance management', 'pipeline', 'vp', 'director',
    'team building', 'executive', 'growth', 'market expansion', 'scaling',
    'c-suite',
  ],
}

// Tools commonly associated with each role
const ROLE_TOOLS: Record<TargetRole, string[]> = {
  SDR: ['outreach', 'salesloft', 'hubspot', 'salesforce', 'gong', 'zoominfo', 'apollo', 'groove', 'yesware', 'sales navigator'],
  AE: ['salesforce', 'hubspot', 'gong', 'chorus', 'docusign', 'pandadoc', 'zoom', 'clari', 'outreach'],
  CSM: ['gainsight', 'totango', 'churnzero', 'hubspot', 'salesforce', 'zendesk', 'intercom', 'mixpanel', 'planhat'],
  Marketing: ['hubspot', 'marketo', 'google analytics', 'semrush', 'salesforce', 'linkedin ads', 'google ads', 'mailchimp', 'pardot', 'ga4'],
  Leadership: ['salesforce', 'hubspot', 'tableau', 'gong', 'workday', 'greenhouse', 'lever', 'clari', 'looker'],
}

// Role signal keywords — what a recruiter scanning for this role would look for in title/summary
const ROLE_SIGNALS: Record<TargetRole, string[]> = {
  SDR:        ['sdr', 'bdr', 'sales development', 'business development representative', 'outbound', 'prospecting'],
  AE:         ['account executive', 'ae', 'account manager', 'sales executive', 'closing', 'quota'],
  CSM:        ['customer success', 'csm', 'customer success manager', 'account management', 'retention'],
  Marketing:  ['marketing', 'demand gen', 'growth', 'content', 'seo', 'campaign', 'marketing manager'],
  Leadership: ['vp', 'director', 'head of', 'chief', 'vice president', 'leadership', 'revenue leader'],
}

// ─── Helper: is a bullet quantified? ─────────────────────────────────────────

const METRIC_PATTERNS = [
  /\d+\s*%/,                     // 30%, 150%
  /\$\s*\d/,                     // $1M, $500k
  /£\s*\d/,                      // £250k
  /€\s*\d/,                      // €1M
  /\d+\s*x\b/i,                  // 3x, 10x
  /#\s*\d/,                      // #1, #3
  /top\s+\d+\s*%/i,              // top 5%, top 10%
  /\b(doubled|tripled|quadrupled)\b/i,
  /\d+\s*(million|billion|k)\b/i,  // $5 million, 200k
  /\d+\s*(clients?|customers?|accounts?|deals?|users?|leads?|companies)\b/i,
  /increased\s+by\s+\d/i,
  /reduced\s+by\s+\d/i,
  /\b\d{3,}\b/,                  // bare numbers 100+ (revenue, pipeline, counts)
  /ranked\s+(#|\d)/i,
  /\bq[1-4]\b.*\d/i,             // Q1 quota, Q3 attainment
]

function isQuantified(bullet: string): boolean {
  return METRIC_PATTERNS.some((re) => re.test(bullet))
}

// ─── Helper: rough date parsing → year+month timestamp ───────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

// Returns [year, month] or null
function parseDateToYM(raw: string): [number, number] | null {
  if (!raw) return null
  const s = raw.toLowerCase().trim()
  if (s === 'present' || s === 'now' || s === 'current' || s === 'ongoing') {
    const now = new Date()
    return [now.getFullYear(), now.getMonth() + 1]
  }
  // "Jan 2021" or "January 2021"
  const mY = s.match(/^([a-z]+)\s+(\d{4})$/)
  if (mY) {
    const month = MONTH_MAP[mY[1]]
    const year = parseInt(mY[2], 10)
    if (month && year) return [year, month]
  }
  // "2021" — year only → assume June
  const yOnly = s.match(/^(\d{4})$/)
  if (yOnly) return [parseInt(yOnly[1], 10), 6]
  // "Q1 2021"
  const qY = s.match(/q([1-4])\s*(\d{4})/i)
  if (qY) {
    const quarter = parseInt(qY[1], 10)
    return [parseInt(qY[2], 10), quarter * 3 - 1]
  }
  return null
}

function ymToMonths([year, month]: [number, number]): number {
  return year * 12 + month
}

// Gap in months between end of role A and start of role B
function gapMonths(endA: string | null, startB: string): number | null {
  const end = endA ? parseDateToYM(endA) : null
  const start = parseDateToYM(startB)
  if (!end || !start) return null
  return ymToMonths(start) - ymToMonths(end)
}

// ─── Helper: keyword count in text ───────────────────────────────────────────

function countKeywords(text: string, keywords: string[]): { matched: string[]; missing: string[] } {
  const lower = text.toLowerCase()
  const matched: string[] = []
  const missing: string[] = []
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) matched.push(kw)
    else missing.push(kw)
  }
  return { matched, missing }
}

// ─── Helper: word count estimate ─────────────────────────────────────────────

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

// ─── Helper: average bullet length ───────────────────────────────────────────

function avgBulletLength(experience: ExperienceRole[]): number {
  const all = experience.flatMap((r) => r.bullets)
  if (!all.length) return 0
  return all.reduce((sum, b) => sum + b.length, 0) / all.length
}

// ─── Helper: detect prose blocks in experience ───────────────────────────────
// A prose block is a bullet/line > 300 chars — indicates paragraph, not bullet

function proseBlockCount(experience: ExperienceRole[]): number {
  return experience.flatMap((r) => r.bullets).filter((b) => b.length > 300).length
}

// ─── Helper: check date format consistency ───────────────────────────────────
// Returns % of roles that have parseable dates

function dateParsRate(experience: ExperienceRole[]): number {
  if (!experience.length) return 0
  const parseable = experience.filter(
    (r) => parseDateToYM(r.start) !== null
  ).length
  return parseable / experience.length
}

// ─── Critical concerns check ─────────────────────────────────────────────────

interface CriticalResult {
  concerns: string[]
  checklistItems: ScorerChecklistItem[]
}

function checkCriticalConcerns(
  structured: StructuredCV,
  rawText: string,
): CriticalResult {
  const concerns: string[] = []
  const checklistItems: ScorerChecklistItem[] = []
  const lower = rawText.toLowerCase()

  // 1. Email address
  const hasEmail = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/.test(rawText)
  if (!hasEmail) {
    concerns.push('No email address found')
    checklistItems.push({
      id: 'missing-email',
      category: 'critical',
      action: 'Add your email address to the header of your CV',
      whyItMatters: 'Recruiters need to contact you. A CV without an email is an instant disqualification — they will not chase you for it.',
      potentialPoints: 0,
      done: false,
    })
  }

  // 2. LinkedIn — broad check: any linkedin.com URL, /in/ path, or "linkedin" near a profile marker
  const hasLinkedIn =
    lower.includes('linkedin.com') ||
    /linkedin\.com|linkedin\/in\/|\/in\/[\w-]{3,}/i.test(rawText)
  if (!hasLinkedIn) {
    concerns.push('No LinkedIn profile URL found')
    checklistItems.push({
      id: 'missing-linkedin',
      category: 'critical',
      action: 'Add your LinkedIn profile URL (linkedin.com/in/yourname)',
      whyItMatters: 'Most GTM recruiters check LinkedIn before responding to any application. A missing URL signals something to hide.',
      potentialPoints: 0,
      done: false,
    })
  }

  // 3. Missing/incomplete experience dates
  const rolesWithNoDates = structured.experience.filter(
    (r) => !parseDateToYM(r.start)
  )
  if (rolesWithNoDates.length > 0) {
    const roleNames = rolesWithNoDates.slice(0, 2).map((r) => `${r.title} at ${r.company}`).join(', ')
    concerns.push(`Missing dates on ${rolesWithNoDates.length} role(s): ${roleNames}`)
    checklistItems.push({
      id: 'missing-dates',
      category: 'critical',
      action: 'Add start and end dates to every role',
      whyItMatters: 'Missing dates are a red flag — recruiters assume you are hiding something (a short stint, a gap, or exaggerated tenure).',
      potentialPoints: 0,
      done: rolesWithNoDates.every((r) => !!parseDateToYM(r.start)),
    })
  }

  // 4. Unexplained gaps > 6 months
  // Sort experience by start date descending (most recent first)
  const datedRoles = structured.experience
    .filter((r) => parseDateToYM(r.start))
    .sort((a, b) => {
      const aYM = parseDateToYM(a.start)!
      const bYM = parseDateToYM(b.start)!
      return ymToMonths(bYM) - ymToMonths(aYM)
    })

  let hasLargeGap = false
  for (let i = 0; i < datedRoles.length - 1; i++) {
    const current = datedRoles[i]
    const next = datedRoles[i + 1]
    const gap = gapMonths(next.end, current.start)
    if (gap !== null && gap > 6) {
      hasLargeGap = true
      break
    }
  }

  if (hasLargeGap) {
    concerns.push('Employment gap of 6+ months detected with no explanation')
    checklistItems.push({
      id: 'employment-gap',
      category: 'critical',
      action: 'Address employment gaps directly in your CV (e.g. "Career break — consulting work", "Caregiver leave", "Sabbatical")',
      whyItMatters: 'Unexplained gaps signal risk. A brief, honest label removes the question before a recruiter asks it.',
      potentialPoints: 0,
      done: false, // can only be resolved by adding text — hard to auto-detect
    })
  }

  return { concerns, checklistItems }
}

// ─── Helper: clean role label for checklist action text ──────────────────────
// Handles garbled parser output: blank titles, bullets-as-titles, location strings,
// numeric company fields, and pipe-separated noise.

function cleanRoleLabel(title: string, company: string, index: number): string {
  const ORDINALS = ['most recent', 'second', 'third']
  const fallback = `your ${ORDINALS[index] ?? 'recent'} role`

  // Sanitise title
  const t = title.trim().replace(/^[•●▪▸\-\*]\s*/, '') // strip leading bullet chars
  const isBadTitle =
    !t ||
    t.length > 80 ||            // too long — likely a parsed bullet
    /\|/.test(t) ||             // contains pipe — garbled company+location in title field
    /^\d/.test(t) ||            // starts with a digit — date/number artifact
    /[.,;:]$/.test(t) ||        // ends with punctuation — sentence fragment, not a title
    / - [A-Z][a-z]+ /.test(t) || // "- New York, NY" style location embedded in title
    t.split(/\s+/).length > 9   // 10+ words — sentence, not a job title

  // Sanitise company
  const c = (company ?? '')
    .trim()
    .replace(/^[•●▪▸\-\*]\s*/, '')   // strip leading bullet chars
    .replace(/\s*\|.*$/, '')           // strip "| City, State" or "| Job Title" suffix
    .replace(/,\s*(LLC|Inc|Ltd|Corp|Co\.?)\s*$/i, '')
    .trim()
  const isBadCompany =
    !c ||
    c.length < 2 ||
    /^\d+\/?$/.test(c) ||  // just a number like "11/"
    c.length > 60

  if (!isBadTitle && !isBadCompany) return `your ${t} role at ${c}`
  if (!isBadTitle) return `your ${t} role`
  if (!isBadCompany) return `your role at ${c}`
  return fallback
}

// ─── Bucket 1: Proof of impact (max 35) ──────────────────────────────────────

function scoreProofOfImpact(structured: StructuredCV): BucketResult & { checklistItems: ScorerChecklistItem[] } {
  const positives: string[] = []
  const issues: string[] = []
  const checklistItems: ScorerChecklistItem[] = []

  const recentRoles = structured.experience.slice(0, 3)

  if (recentRoles.length === 0) {
    return {
      score: 0, maxScore: 35, positives, issues: ['No experience roles found'],
      checklistItems: [{
        id: 'no-experience',
        category: 'impact',
        action: 'Add your work experience with bullet points describing your achievements',
        whyItMatters: 'Without experience, there is nothing to score. Even 1 role with measurable results matters.',
        potentialPoints: 11,
        done: false,
      }],
    }
  }

  let totalPoints = 0
  // Fixed points per role (based on 3-role ideal: 11×3 = 33, capped to 35).
  // Using a fixed value prevents inflated single-item scores when a CV has only 1 role.
  const POINTS_PER_ROLE = 11

  for (let i = 0; i < recentRoles.length; i++) {
    const role = recentRoles[i]
    const quantifiedBullets = role.bullets.filter(isQuantified)
    const count = quantifiedBullets.length
    const roleLabel = cleanRoleLabel(role.title, role.company, i)

    if (count >= 2) {
      totalPoints += POINTS_PER_ROLE
      positives.push(`${roleLabel}: ${count} measurable results`)
    } else if (count === 1) {
      const partial = Math.round(POINTS_PER_ROLE * 0.4)
      totalPoints += partial
      issues.push(`${roleLabel}: only 1 measurable result (need 2+)`)
      checklistItems.push({
        id: `one-metric-role-${i}`,
        category: 'impact',
        action: `Add 1 more measurable result to ${roleLabel}`,
        whyItMatters: 'You have a metric here — one more transforms this into an achievements section rather than a list of responsibilities.',
        potentialPoints: POINTS_PER_ROLE - partial,
        done: false,
      })
    } else {
      issues.push(`${roleLabel}: no measurable results`)
      checklistItems.push({
        id: `no-metrics-role-${i}`,
        category: 'impact',
        action: `Add 2+ measurable results to ${roleLabel}`,
        whyItMatters: 'Recruiters scan for numbers first. Bullets without metrics are treated as responsibilities, not achievements — and responsibilities do not get callbacks.',
        potentialPoints: POINTS_PER_ROLE,
        done: false,
      })
    }
  }

  // Bonus: if first role has 3+ quantified bullets, early visibility is strong
  if (recentRoles[0]?.bullets.filter(isQuantified).length >= 3 && totalPoints >= POINTS_PER_ROLE) {
    positives.push('Metrics appear early and prominently — strong first impression')
  }

  const score = Math.min(totalPoints, 35)

  // Update done flags
  for (const item of checklistItems) {
    if (item.id.startsWith('one-metric-role-')) {
      const idx = parseInt(item.id.replace('one-metric-role-', ''), 10)
      item.done = (recentRoles[idx]?.bullets.filter(isQuantified).length ?? 0) >= 2
    }
    if (item.id.startsWith('no-metrics-role-')) {
      const idx = parseInt(item.id.replace('no-metrics-role-', ''), 10)
      item.done = (recentRoles[idx]?.bullets.filter(isQuantified).length ?? 0) >= 2
    }
  }

  return { score, maxScore: 35, positives, issues, checklistItems }
}

// ─── Bucket 2: ATS / keywords (max 25) ───────────────────────────────────────

function scoreATSKeywords(
  structured: StructuredCV,
  rawText: string,
  targetRole: TargetRole,
): BucketResult & { checklistItems: ScorerChecklistItem[]; keywordData: ScoreResult['keywordData'] } {
  const positives: string[] = []
  const issues: string[] = []
  const checklistItems: ScorerChecklistItem[] = []

  const keywords = ATS_KEYWORDS[targetRole]
  const { matched, missing } = countKeywords(rawText, keywords)
  const coverage = matched.length / keywords.length

  const keywordData: ScoreResult['keywordData'] = {
    role: targetRole,
    total: keywords.length,
    matched,
    missing,
  }

  // Keyword coverage: 0–15pts
  let keywordPts = 0
  if (coverage >= 0.8) {
    keywordPts = 15
    positives.push(`Strong keyword coverage: ${matched.length}/${keywords.length} role keywords present`)
  } else if (coverage >= 0.6) {
    keywordPts = 10
    positives.push(`Good keyword coverage: ${matched.length}/${keywords.length} role keywords present`)
    issues.push(`${missing.length} role keywords missing`)
  } else if (coverage >= 0.4) {
    keywordPts = 6
    issues.push(`Low keyword coverage: only ${matched.length}/${keywords.length} keywords present`)
    checklistItems.push({
      id: 'keyword-coverage-low',
      category: 'ats',
      action: `Add missing keywords to your CV: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`,
      whyItMatters: 'ATS systems filter CVs before a human sees them. Missing role-specific keywords = automatic rejection in many processes.',
      potentialPoints: 9,
      done: coverage >= 0.8,
    })
  } else {
    keywordPts = 2
    issues.push(`Very low keyword coverage: only ${matched.length}/${keywords.length} keywords present`)
    checklistItems.push({
      id: 'keyword-coverage-very-low',
      category: 'ats',
      action: `Weave these keywords naturally into your experience and skills: ${missing.slice(0, 8).join(', ')}`,
      whyItMatters: 'Your CV does not yet read as a strong match for this role. ATS and recruiters will both filter you out before your experience is considered.',
      potentialPoints: 13,
      done: coverage >= 0.8,
    })
  }

  // Standard headings: 0–5pts
  const hasExp = structured.experience.length > 0
  const hasSkills = structured.skills.length > 0
  const hasEdu = structured.education.length > 0
  const headingScore = (hasExp ? 2 : 0) + (hasSkills ? 2 : 0) + (hasEdu ? 1 : 0)

  if (headingScore >= 4) {
    positives.push('Standard section headings detected (Experience, Skills, Education)')
  } else {
    issues.push('Some standard section headings are missing')
    if (!hasExp) {
      checklistItems.push({
        id: 'no-experience-heading',
        category: 'ats',
        action: 'Use "Experience" or "Work Experience" as your section heading',
        whyItMatters: 'Many ATS parsers look for these exact headings. Custom headings like "Where I\'ve worked" can cause your experience to be missed entirely.',
        potentialPoints: 2,
        done: hasExp,
      })
    }
    if (!hasSkills) {
      checklistItems.push({
        id: 'no-skills-heading',
        category: 'ats',
        action: 'Add a "Skills" section with your key tools and competencies',
        whyItMatters: 'A skills section lets ATS extract your capabilities separately from your experience — and gives recruiters a fast reference.',
        potentialPoints: 2,
        done: hasSkills,
      })
    }
  }

  // Tools present: 0–3pts
  const tools = ROLE_TOOLS[targetRole]
  const lowerText = rawText.toLowerCase()
  const toolsFound = tools.filter((t) => lowerText.includes(t.toLowerCase()))
  const toolPts = toolsFound.length > 0 ? 3 : 0

  if (toolPts > 0) {
    positives.push(`Role-relevant tools mentioned: ${toolsFound.slice(0, 3).join(', ')}`)
  } else {
    issues.push('No role-relevant tools mentioned (Salesforce, HubSpot, etc.)')
    checklistItems.push({
      id: 'no-tools',
      category: 'ats',
      action: `Add the tools you use to your Skills section: ${tools.slice(0, 4).join(', ')}`,
      whyItMatters: 'Tool proficiency is often a hard filter. Recruiters search for specific tools — if yours are not listed, you are not found.',
      potentialPoints: 3,
      done: toolsFound.length > 0,
    })
  }

  // Title keyword match: 0–2pts
  const mostRecentTitle = structured.experience[0]?.title?.toLowerCase() ?? ''
  const signals = ROLE_SIGNALS[targetRole]
  const titleMatch = signals.some((s) => mostRecentTitle.includes(s.toLowerCase()))
  const titlePts = titleMatch ? 2 : 0

  if (!titleMatch) {
    issues.push('Most recent job title does not signal the target role to a recruiter')
    checklistItems.push({
      id: 'title-mismatch',
      category: 'ats',
      action: 'Add role-specific keywords to your most recent job title or summary (e.g. "Account Executive | SaaS | EMEA")',
      whyItMatters: 'Recruiters scan job titles first. A title that signals the wrong role reduces your callback rate.',
      potentialPoints: 2,
      done: titleMatch,
    })
  } else {
    positives.push('Most recent title signals the target role clearly')
  }

  const score = Math.min(keywordPts + headingScore + toolPts + titlePts, 25)

  return { score, maxScore: 25, positives, issues, checklistItems, keywordData }
}

// ─── Bucket 3: Formatting / readability (max 20) ─────────────────────────────

function scoreFormatting(structured: StructuredCV, rawText: string): BucketResult & { checklistItems: ScorerChecklistItem[] } {
  const positives: string[] = []
  const issues: string[] = []
  const checklistItems: ScorerChecklistItem[] = []

  // Word count: 0–5pts
  const wc = wordCount(rawText)
  let wcPts = 0
  if (wc >= 300 && wc <= 700) {
    wcPts = 5
    positives.push(`Good length: ~${wc} words (1 page equivalent)`)
  } else if (wc > 700 && wc <= 1000) {
    wcPts = 4
    positives.push(`Acceptable length: ~${wc} words (2 pages)`)
  } else if (wc > 200 && wc < 300) {
    wcPts = 2
    issues.push(`CV is short: ~${wc} words — may look thin`)
    checklistItems.push({
      id: 'cv-too-short',
      category: 'formatting',
      action: 'Expand your CV — add more detail to your roles, skills, or achievements',
      whyItMatters: 'A CV under 300 words looks like a placeholder. Recruiters expect enough detail to make a judgement.',
      potentialPoints: 3,
      done: wc >= 300,
    })
  } else if (wc > 1000) {
    wcPts = 2
    issues.push(`CV is long: ~${wc} words — likely 3+ pages`)
    checklistItems.push({
      id: 'cv-too-long',
      category: 'formatting',
      action: 'Trim your CV to 2 pages maximum (aim for ~600–800 words for senior, ~400–600 for mid)',
      whyItMatters: 'Recruiters spend 6–7 seconds on a first scan. Every extra page reduces the attention per section. Cut ruthlessly.',
      potentialPoints: 3,
      done: wc <= 1000,
    })
  } else {
    wcPts = 1
    issues.push(`CV is very short: ~${wc} words`)
  }

  // Average bullet length: 0–5pts
  const avgLen = avgBulletLength(structured.experience)
  let bulletPts = 0
  if (avgLen >= 60 && avgLen <= 180) {
    bulletPts = 5
    positives.push('Bullet length is ideal — scannable without being too thin')
  } else if (avgLen > 40 && avgLen < 250) {
    bulletPts = 3
    if (avgLen > 180) issues.push('Some bullets are running long — aim for 1–2 lines')
    else issues.push('Some bullets are very short — add more context or a result')
  } else if (avgLen === 0) {
    bulletPts = 0
    issues.push('No bullet points found in experience section')
    checklistItems.push({
      id: 'no-bullets',
      category: 'formatting',
      action: 'Rewrite your experience as bullet points, not paragraphs',
      whyItMatters: 'Recruiters scan CVs, they do not read them. Paragraphs get skipped. Bullets get read.',
      potentialPoints: 8,
      done: structured.experience.some((r) => r.bullets.length > 0),
    })
  } else {
    bulletPts = 1
    issues.push(`Bullet length is off — current average is ${Math.round(avgLen)} chars (aim for 60–180)`)
    checklistItems.push({
      id: 'bullet-length',
      category: 'formatting',
      action: avgLen > 250 ? 'Shorten your bullet points — aim for 1–2 lines each (60–180 characters)' : 'Add more detail to your bullets — they read as fragment notes, not achievements',
      whyItMatters: 'Bullet length signals experience and communication skill. Too long = walls of text. Too short = no substance.',
      potentialPoints: 4,
      done: avgLen >= 60 && avgLen <= 180,
    })
  }

  // Prose blocks: 0–5pts
  const proseCount = proseBlockCount(structured.experience)
  let prosePts = 0
  if (proseCount === 0) {
    prosePts = 5
    positives.push('No dense paragraph blocks — all experience is bullet-formatted')
  } else if (proseCount <= 2) {
    prosePts = 3
    issues.push(`${proseCount} experience bullet(s) are paragraph-length (>300 chars)`)
    checklistItems.push({
      id: 'prose-blocks',
      category: 'formatting',
      action: 'Break the long paragraph sections in your experience into 2–3 focused bullet points',
      whyItMatters: 'Paragraphs in experience sections are skipped by most recruiters. Bullets are read.',
      potentialPoints: 2,
      done: proseBlockCount(structured.experience) === 0,
    })
  } else {
    prosePts = 0
    issues.push(`${proseCount} experience sections contain dense paragraphs — needs reformatting`)
    checklistItems.push({
      id: 'many-prose-blocks',
      category: 'formatting',
      action: 'Reformat your experience section — convert all paragraphs to bullet points',
      whyItMatters: 'Your experience is written as prose. Recruiters scan in under 10 seconds. Paragraphs do not survive that scan.',
      potentialPoints: 5,
      done: proseBlockCount(structured.experience) === 0,
    })
  }

  // Date consistency: 0–5pts
  const parsedRate = dateParsRate(structured.experience)
  let datePts = 0
  if (parsedRate >= 0.9) {
    datePts = 5
    positives.push('Dates are consistent and parseable throughout')
  } else if (parsedRate >= 0.6) {
    datePts = 3
    issues.push('Some roles have inconsistent or unreadable date formats')
    checklistItems.push({
      id: 'inconsistent-dates',
      category: 'formatting',
      action: 'Use consistent date formats throughout — "Jan 2020 – Mar 2022" works well',
      whyItMatters: 'Mixed date formats (2020, January 2020, 01/2020) look careless and can confuse ATS date parsers.',
      potentialPoints: 2,
      done: dateParsRate(structured.experience) >= 0.9,
    })
  } else {
    datePts = 0
    issues.push('Most dates are missing or unreadable')
    checklistItems.push({
      id: 'missing-dates-format',
      category: 'formatting',
      action: 'Add clear start and end dates to every role in "Mon YYYY – Mon YYYY" format',
      whyItMatters: 'Missing dates are a critical concern for recruiters — they cannot assess your tenure or spot gaps without them.',
      potentialPoints: 5,
      done: dateParsRate(structured.experience) >= 0.9,
    })
  }

  const score = Math.min(wcPts + bulletPts + prosePts + datePts, 20)

  return { score, maxScore: 20, positives, issues, checklistItems }
}

// ─── Bucket 4: Clarity / structure (max 20) ──────────────────────────────────

function scoreClarity(
  structured: StructuredCV,
  rawText: string,
  targetRole: TargetRole,
): BucketResult & { checklistItems: ScorerChecklistItem[] } {
  const positives: string[] = []
  const issues: string[] = []
  const checklistItems: ScorerChecklistItem[] = []

  // Target role signal in title or summary: 0–5pts
  const signals = ROLE_SIGNALS[targetRole]
  const lowerSummary = structured.summary.toLowerCase()
  const mostRecentTitle = structured.experience[0]?.title?.toLowerCase() ?? ''
  const inSummary = signals.some((s) => lowerSummary.includes(s.toLowerCase()))
  const inTitle = signals.some((s) => mostRecentTitle.includes(s.toLowerCase()))

  let rolePts = 0
  if (inTitle && inSummary) {
    rolePts = 5
    positives.push('Target role is clear from both your summary and most recent title')
  } else if (inTitle || inSummary) {
    rolePts = 3
    const where = inTitle ? 'title' : 'summary'
    issues.push(`Target role signal appears in ${where} but not both`)
    checklistItems.push({
      id: 'role-signal-partial',
      category: 'clarity',
      action: inTitle
        ? 'Add role-specific keywords to your professional summary as well as your title'
        : 'Add role-specific keywords to your most recent job title or a headline',
      whyItMatters: 'Recruiters need to know in 2 seconds what role you are pursuing. Both your title and summary should signal it.',
      potentialPoints: 2,
      done: inTitle && inSummary,
    })
  } else {
    rolePts = 0
    issues.push('Target role is not clearly signalled in title or summary')
    checklistItems.push({
      id: 'role-not-clear',
      category: 'clarity',
      action: 'Make your target role explicit in your summary and/or most recent title (e.g. "Customer Success Manager | SaaS | Retention")',
      whyItMatters: 'Recruiters stack-rank applications. If your role is not obvious within 2 seconds, you are ranked below candidates who make it clear.',
      potentialPoints: 5,
      done: inTitle && inSummary,
    })
  }

  // Company context per role: 0–5pts
  const rolesWithCompany = structured.experience.filter((r) => r.company && r.company.trim().length > 1)
  const companyRate = structured.experience.length > 0
    ? rolesWithCompany.length / structured.experience.length
    : 0

  let companyPts = 0
  if (companyRate >= 0.9) {
    companyPts = 5
    positives.push('Company names present on all roles')
  } else if (companyRate >= 0.6) {
    companyPts = 3
    issues.push('Some roles are missing company names')
    checklistItems.push({
      id: 'missing-company',
      category: 'clarity',
      action: 'Add company name and a brief one-liner (stage, size, sector) to every role',
      whyItMatters: 'Recruiters do not know every company. One line of context instantly adds credibility and helps them place you.',
      potentialPoints: 2,
      done: companyRate >= 0.9,
    })
  } else {
    companyPts = 0
    issues.push('Most roles are missing company names')
    checklistItems.push({
      id: 'no-company',
      category: 'clarity',
      action: 'Add company name to every role, plus a brief one-liner: "Series B SaaS, 80-person team, UK-based"',
      whyItMatters: 'Without company context, your experience is floating. Recruiters cannot assess the scale, stage, or sector of your background.',
      potentialPoints: 5,
      done: companyRate >= 0.9,
    })
  }

  // Timeline scannable (2+ roles with parseable dates): 0–5pts
  const datedRoles = structured.experience.filter((r) => parseDateToYM(r.start))
  let timelinePts = 0
  if (datedRoles.length >= 2) {
    timelinePts = 5
    positives.push('Timeline is clear and scannable')
  } else if (datedRoles.length === 1) {
    timelinePts = 2
    issues.push('Only 1 role has readable dates — timeline is not scannable')
  } else {
    timelinePts = 0
    issues.push('No roles have readable dates — timeline is completely unclear')
  }

  // Summary present and substantial: 0–5pts
  const summaryLen = structured.summary.trim().length
  let summaryPts = 0
  if (summaryLen >= 150) {
    summaryPts = 5
    positives.push('Professional summary is present and substantial')
  } else if (summaryLen >= 60) {
    summaryPts = 3
    issues.push('Summary exists but is brief — could be stronger')
    checklistItems.push({
      id: 'summary-short',
      category: 'clarity',
      action: 'Expand your summary to 2–3 sentences: who you are, what you do best, and what you are looking for',
      whyItMatters: 'A strong summary tells a recruiter you are the right candidate before they read a single bullet point.',
      potentialPoints: 2,
      done: summaryLen >= 150,
    })
  } else {
    summaryPts = 0
    issues.push('No professional summary found')
    checklistItems.push({
      id: 'no-summary',
      category: 'clarity',
      action: 'Add a 2–3 sentence professional summary at the top of your CV',
      whyItMatters: 'Without a summary, recruiters have no context before diving into your history. A targeted summary immediately signals the right role, seniority, and fit.',
      potentialPoints: 5,
      done: summaryLen >= 60,
    })
  }

  const score = Math.min(rolePts + companyPts + timelinePts + summaryPts, 20)

  return { score, maxScore: 20, positives, issues, checklistItems }
}

// ─── Main scoring function ────────────────────────────────────────────────────

export function scoreCV(
  structured: StructuredCV,
  rawText: string,
  targetRole: TargetRole,
): ScoreResult {
  // 1. Critical concerns
  const { concerns, checklistItems: criticalItems } = checkCriticalConcerns(structured, rawText)

  // 2. Bucket scores
  const impact = scoreProofOfImpact(structured)
  const ats = scoreATSKeywords(structured, rawText, targetRole)
  const formatting = scoreFormatting(structured, rawText)
  const clarity = scoreClarity(structured, rawText, targetRole)

  // 3. Overall score
  const overallScore = impact.score + ats.score + formatting.score + clarity.score

  // 4. Pass/fail: 70+ AND no critical concerns
  const passFail = overallScore >= 70 && concerns.length === 0

  // 5. Merge checklist (critical first, then by potential points desc)
  const allChecklist: ScorerChecklistItem[] = [
    ...criticalItems,
    ...impact.checklistItems,
    ...ats.checklistItems,
    ...formatting.checklistItems,
    ...clarity.checklistItems,
  ]

  // Deduplicate by id (shouldn't happen but safety net)
  const seen = new Set<string>()
  const checklist = allChecklist.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })

  return {
    overallScore,
    passFail,
    criticalConcerns: concerns,
    buckets: {
      proofOfImpact: { score: impact.score, maxScore: 35, positives: impact.positives, issues: impact.issues },
      atsKeywords: { score: ats.score, maxScore: 25, positives: ats.positives, issues: ats.issues },
      formatting: { score: formatting.score, maxScore: 20, positives: formatting.positives, issues: formatting.issues },
      clarity: { score: clarity.score, maxScore: 20, positives: clarity.positives, issues: clarity.issues },
    },
    checklist,
    targetRole,
    keywordData: ats.keywordData,
  }
}
