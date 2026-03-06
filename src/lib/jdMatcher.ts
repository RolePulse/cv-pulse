// CV Pulse — JD Match Engine
// Epic 9 | Deterministic keyword-based JD matching. No LLM. Same input = same output.
//
// v2 scoring model (2026-03-06): start at 100, deduct for gaps.
//
// Algorithm:
//   1. Build a universe of known role keywords + tools
//   2. Find which universe keywords appear in the JD → "JD keyword set"
//   3. Compare JD keyword set against CV raw_text → matched / missing
//   4. Detect the JD's role independently (by keyword density)
//   5. Compute score by deducting from 100:
//        - Role mismatch:    −25 (CV targeting wrong role for this JD)
//        - Adjacent role:    −12 (e.g. AE applying to SDR)
//        - Missing role kws: −3 each, capped at −30
//        - Missing tools:    −2 each, capped at −12
//        - Segment mismatch: −8 (JD is enterprise, CV signals SMB)
//   6. For Marketing CVs, infer subtype (demand-gen / content / growth / brand)
//
// All keyword sets and deduction reasons are exposed in the result — no black boxes.

import type { TargetRole } from '@/lib/roleDetect'

// ─── Re-exported from scorer — kept in sync ──────────────────────────────────
// (Duplicated here so jdMatcher has no circular dep on scorer)

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
  SE: [
    'solutions engineer', 'sales engineer', 'presales', 'pre-sales',
    'proof of concept', 'poc', 'technical discovery', 'solution design',
    'rfp', 'rfi', 'demo', 'value engineering', 'roi', 'business case',
    'api', 'integration', 'cloud', 'enterprise', 'architecture',
    'meddic', 'champion', 'technical champion', 'win rate',
    'pipeline influenced', 'deals supported', 'technical evaluation',
    'solutions consultant', 'value engineer', 'sandbox',
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
  RevOps: [
    'revenue operations', 'revops', 'sales operations', 'salesforce', 'crm',
    'forecasting', 'pipeline management', 'territory planning', 'quota setting',
    'attribution', 'data quality', 'process optimisation', 'process optimization',
    'reporting', 'dashboards', 'workflow automation', 'tech stack', 'hubspot',
    'sales ops', 'marketing ops', 'pipeline hygiene', 'gtm operations',
    'compensation planning', 'deal desk', 'renewal ops',
  ],
}

const ROLE_TOOLS: Record<TargetRole, string[]> = {
  SDR: ['outreach', 'salesloft', 'hubspot', 'salesforce', 'gong', 'zoominfo', 'apollo', 'groove', 'yesware', 'sales navigator'],
  AE: ['salesforce', 'hubspot', 'gong', 'chorus', 'docusign', 'pandadoc', 'zoom', 'clari', 'outreach'],
  SE: ['salesforce', 'gong', 'jira', 'confluence', 'postman', 'aws', 'azure', 'zoom', 'loom', 'consensus', 'loopio', 'rfpio', 'hubspot'],
  CSM: ['gainsight', 'totango', 'churnzero', 'hubspot', 'salesforce', 'zendesk', 'intercom', 'mixpanel', 'planhat'],
  Marketing: ['hubspot', 'marketo', 'google analytics', 'semrush', 'salesforce', 'linkedin ads', 'google ads', 'mailchimp', 'pardot', 'ga4'],
  Leadership: ['salesforce', 'hubspot', 'tableau', 'gong', 'workday', 'greenhouse', 'lever', 'clari', 'looker'],
  RevOps: ['salesforce', 'hubspot', 'marketo', 'clari', 'gong', 'tableau', 'looker', 'outreach', 'salesloft', 'zapier', 'zoominfo', 'people.ai', 'crossbeam'],
}

// Marketing subtypes — used to infer context from JD and surface more targeted advice
const MARKETING_SUBTYPES: Record<string, string[]> = {
  'demand-gen': [
    'demand gen', 'demand generation', 'pipeline', 'mql', 'sql', 'abm',
    'account based marketing', 'paid campaigns', 'paid social', 'linkedin ads',
    'google ads', 'performance marketing', 'cpl', 'cac', 'attribution',
  ],
  'content': [
    'content marketing', 'content strategy', 'blog', 'seo', 'copywriting',
    'editorial', 'thought leadership', 'content calendar', 'storytelling',
    'whitepapers', 'ebooks', 'case studies',
  ],
  'growth': [
    'growth', 'a/b testing', 'conversion rate', 'product-led', 'plg',
    'funnel optimisation', 'cro', 'retention', 'activation', 'referral',
    'viral', 'experiments',
  ],
  'brand': [
    'brand', 'brand awareness', 'brand positioning', 'brand strategy',
    'creative', 'design', 'events', 'sponsorships', 'pr', 'communications',
    'messaging', 'positioning',
  ],
}

// All keywords across all roles (deduped) — used to find non-target-role JD keywords
const ALL_KEYWORDS: string[] = Array.from(
  new Set([
    ...Object.values(ATS_KEYWORDS).flat(),
    ...Object.values(ROLE_TOOLS).flat(),
  ])
)

// ─── Output types ─────────────────────────────────────────────────────────────

export interface JDKeywordGroup {
  matched: string[]
  missing: string[]
}

export interface JDDeductions {
  role: number       // penalty for role mismatch / adjacent role
  keywords: number   // penalty for missing role keywords
  tools: number      // penalty for missing tools
  segment: number    // penalty for seniority/segment mismatch
  total: number      // sum of all deductions
}

export interface JDMatchResult {
  matchScore: number          // 0–100 (100 - deductions)
  jdKeywords: string[]        // full keyword set extracted from JD (transparent)
  matchedKeywords: string[]   // JD keywords present in CV
  missingKeywords: string[]   // JD keywords absent from CV
  breakdown: {
    roleKeywords: JDKeywordGroup     // target-role keywords from ATS set, found in JD
    toolKeywords: JDKeywordGroup     // target-role tools, found in JD
    generalKeywords: JDKeywordGroup  // other-role keywords found in JD
  }
  marketingSubtype?: string          // inferred for Marketing role CVs
  // v2 scoring fields
  detectedJDRole: TargetRole | null  // JD's role inferred from keyword density
  roleAlignment: 'match' | 'adjacent' | 'mismatch'
  segmentMismatch: boolean           // JD is enterprise, CV signals SMB background
  deductions: JDDeductions
}

// ─── Role detection & alignment ───────────────────────────────────────────────

// Pairs of roles considered "adjacent" (one step removed, natural career moves)
const ADJACENT_PAIRS: Array<[TargetRole, TargetRole]> = [
  ['SDR',        'AE'],
  ['SDR',        'Marketing'],  // top-of-funnel overlap
  ['AE',         'SE'],
  ['AE',         'CSM'],
  ['AE',         'Leadership'],
  ['SE',         'Leadership'],
  ['CSM',        'Leadership'],
  ['RevOps',     'AE'],
  ['RevOps',     'CSM'],
  ['RevOps',     'Marketing'],
  ['RevOps',     'Leadership'],
  ['RevOps',     'SDR'],
]

function getRoleAlignment(
  cvRole: TargetRole,
  jdRole: TargetRole,
): 'match' | 'adjacent' | 'mismatch' {
  if (cvRole === jdRole) return 'match'
  const isAdjacent = ADJACENT_PAIRS.some(
    ([a, b]) => (a === cvRole && b === jdRole) || (b === cvRole && a === jdRole),
  )
  return isAdjacent ? 'adjacent' : 'mismatch'
}

// Explicit role title patterns — checked first, before keyword density.
// This prevents strategic/senior AE JDs being misclassified as Leadership
// because they use words like "strategy", "stakeholder", "scaling".
const ROLE_TITLE_PATTERNS: Record<TargetRole, RegExp[]> = {
  SDR:        [/\bsdr\b/i, /\bbdr\b/i, /sales development rep/i, /business development rep/i, /outbound sales rep/i],
  AE:         [/account executive/i, /\bae\b[^a-z]/i, /closing\s+rep/i, /field sales rep/i],
  SE:         [/solutions engineer/i, /sales engineer/i, /\bpresales\b/i, /pre-sales/i, /solutions consultant/i],
  CSM:        [/customer success manager/i, /\bcsm\b/i, /client success/i, /account manager.*success/i],
  Marketing:  [/marketing manager/i, /demand gen(eration)?\s+manager/i, /content manager/i, /growth manager/i, /head of marketing/i],
  Leadership: [/\bvp\b.*sales/i, /\bsvp\b/i, /\bevp\b/i, /director of sales/i, /head of sales/i, /chief revenue/i, /\bcro\b/i, /vp of revenue/i],
  RevOps:     [/revenue operations/i, /\brevops\b/i, /sales operations manager/i, /sales ops/i],
}

/**
 * Detect the most likely role this JD is for.
 * Step 1: look for explicit job title patterns (most reliable).
 * Step 2: fall back to keyword density if no title match.
 * Returns null if confidence is too low.
 */
function detectJDRole(jdText: string): TargetRole | null {
  const ROLES: TargetRole[] = ['SDR', 'AE', 'SE', 'CSM', 'Marketing', 'Leadership', 'RevOps']

  // Step 1: explicit title match — check first 3 non-empty lines only.
  // Restricting to the title area prevents false matches when a role is merely
  // mentioned mid-JD (e.g. "work closely with Account Executives").
  const titleArea = jdText.split('\n').filter((l) => l.trim()).slice(0, 3).join(' ')
  for (const role of ROLES) {
    if (ROLE_TITLE_PATTERNS[role].some((p) => p.test(titleArea))) {
      return role
    }
  }

  // Step 2: keyword density fallback
  const lower = jdText.toLowerCase()
  let best: TargetRole | null = null
  let bestCount = 0

  for (const role of ROLES) {
    const all = [...ATS_KEYWORDS[role], ...ROLE_TOOLS[role]]
    const count = all.filter((kw) => lower.includes(kw.toLowerCase())).length
    if (count > bestCount) { bestCount = count; best = role }
  }

  return bestCount >= 3 ? best : null
}

// ─── Segment (market tier) detection ─────────────────────────────────────────

const ENTERPRISE_SIGNALS = [
  'enterprise', 'strategic accounts', 'f500', 'fortune 500', 'global accounts',
  'large enterprise', 'major accounts', 'named accounts', 'upmarket', 'strategic sales',
  'enterprise sales', 'c-suite', 'exec-level',
]

const SMB_SIGNALS = [
  'smb', 'small business', 'small and medium', 'startup', 'early stage',
  'scale-up', 'scaleup', 'growth stage', 'series a', 'series b',
]

function detectSegment(text: string): 'enterprise' | 'smb' | 'mixed' | 'unknown' {
  const lower = text.toLowerCase()
  const ent = ENTERPRISE_SIGNALS.filter((s) => lower.includes(s)).length
  const smb = SMB_SIGNALS.filter((s) => lower.includes(s)).length

  if (ent >= 2 && smb < 2) return 'enterprise'
  if (smb >= 2 && ent < 2) return 'smb'
  if (ent >= 1 && smb >= 1) return 'mixed'
  return 'unknown'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function includesKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase())
}

function presentIn(text: string, keywords: string[]): string[] {
  return keywords.filter((kw) => includesKeyword(text, kw))
}

function absentFrom(text: string, keywords: string[]): string[] {
  return keywords.filter((kw) => !includesKeyword(text, kw))
}

/**
 * Infer Marketing subtype from JD text.
 * Returns the subtype with the most keyword matches, or undefined if none clear.
 */
function inferMarketingSubtype(jdText: string): string | undefined {
  const lower = jdText.toLowerCase()
  let bestType: string | undefined
  let bestCount = 0

  for (const [subtype, keywords] of Object.entries(MARKETING_SUBTYPES)) {
    const count = keywords.filter((kw) => lower.includes(kw)).length
    if (count > bestCount) {
      bestCount = count
      bestType = subtype
    }
  }

  // Only infer if at least 2 matching signals — avoids false positives
  return bestCount >= 2 ? bestType : undefined
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Match a CV against a job description.
 *
 * @param cvRawText    - Raw text extracted from the CV
 * @param jdText       - Pasted job description text
 * @param targetRole   - CV's selected target role
 */
export function matchJD(
  cvRawText: string,
  jdText: string,
  targetRole: TargetRole,
): JDMatchResult {
  // ── Step 1: What keywords does the JD contain from our universe? ───────────
  // Priority assignment: role keywords (weight 3) > tool keywords (weight 2) > general (weight 1).
  // A keyword is assigned to the HIGHEST-priority category only — no cross-set duplicates.

  const roleKeywordsInJD = presentIn(jdText, ATS_KEYWORDS[targetRole])
  const roleSet = new Set(roleKeywordsInJD.map((k) => k.toLowerCase()))

  // Tools: only those NOT already captured as role keywords
  const toolKeywordsInJD = presentIn(jdText, ROLE_TOOLS[targetRole]).filter(
    (k) => !roleSet.has(k.toLowerCase())
  )
  const toolSet = new Set(toolKeywordsInJD.map((k) => k.toLowerCase()))

  // "General" = other-role keywords that appear in JD, not already in role or tool sets
  const otherKeywords = ALL_KEYWORDS.filter(
    (kw) =>
      !ATS_KEYWORDS[targetRole].includes(kw) &&
      !ROLE_TOOLS[targetRole].includes(kw),
  )
  const generalKeywordsInJD = presentIn(jdText, otherKeywords).filter(
    (k) => !roleSet.has(k.toLowerCase()) && !toolSet.has(k.toLowerCase())
  )

  // Full JD keyword set — guaranteed no duplicates because of category exclusion above
  const jdKeywords = [...roleKeywordsInJD, ...toolKeywordsInJD, ...generalKeywordsInJD]

  if (jdKeywords.length === 0) {
    // JD uses non-standard language — can't compute a meaningful score
    return {
      matchScore: 0,
      jdKeywords: [],
      matchedKeywords: [],
      missingKeywords: [],
      breakdown: {
        roleKeywords: { matched: [], missing: [] },
        toolKeywords: { matched: [], missing: [] },
        generalKeywords: { matched: [], missing: [] },
      },
      detectedJDRole: null,
      roleAlignment: 'match',
      segmentMismatch: false,
      deductions: { role: 0, keywords: 0, tools: 0, segment: 0, total: 0 },
    }
  }

  // ── Step 2: Which JD keywords appear in the CV? ────────────────────────────
  const roleMatched = presentIn(cvRawText, roleKeywordsInJD)
  const roleMissing = absentFrom(cvRawText, roleKeywordsInJD)

  const toolMatched = presentIn(cvRawText, toolKeywordsInJD)
  const toolMissing = absentFrom(cvRawText, toolKeywordsInJD)

  const generalMatched = presentIn(cvRawText, generalKeywordsInJD)
  const generalMissing = absentFrom(cvRawText, generalKeywordsInJD)

  const matchedKeywords = [...roleMatched, ...toolMatched, ...generalMatched]
  const missingKeywords = [...roleMissing, ...toolMissing, ...generalMissing]

  // ── Step 3: v2 scoring — start at 100, deduct for gaps ────────────────────
  //
  // Deduction table:
  //   Role mismatch (wrong role detected)         −25
  //   Adjacent role (e.g. AE applying for SDR)   −12
  //   Missing role keyword (from JD)              −3 each, max −30
  //   Missing tool (from JD)                      −2 each, max −12
  //   Segment mismatch (enterprise JD, SMB CV)    −8
  //
  // Floor: 0.  Ceiling: 100.

  const DEDUCT_MISMATCH   = 25
  const DEDUCT_ADJACENT   = 12
  const DEDUCT_KW         = 3
  const DEDUCT_TOOL       = 2
  const CAP_KW            = 30
  const CAP_TOOL          = 12
  const DEDUCT_SEGMENT    = 8

  // Role alignment
  const detectedJDRole  = detectJDRole(jdText)
  const roleAlignment   = detectedJDRole
    ? getRoleAlignment(targetRole, detectedJDRole)
    : 'match'  // can't detect → don't penalise

  const roleDeduction = roleAlignment === 'mismatch' ? DEDUCT_MISMATCH
    : roleAlignment === 'adjacent'  ? DEDUCT_ADJACENT
    : 0

  // Keyword & tool deductions
  const kwDeduction   = Math.min(roleMissing.length  * DEDUCT_KW,   CAP_KW)
  const toolDeduction = Math.min(toolMissing.length  * DEDUCT_TOOL, CAP_TOOL)

  // Segment mismatch
  const jdSegment  = detectSegment(jdText)
  const cvSegment  = detectSegment(cvRawText)
  const segmentMismatch = jdSegment === 'enterprise' && cvSegment === 'smb'
  const segmentDeduction = segmentMismatch ? DEDUCT_SEGMENT : 0

  const totalDeduction = roleDeduction + kwDeduction + toolDeduction + segmentDeduction
  const matchScore = Math.max(100 - totalDeduction, 0)

  // ── Step 4: Marketing subtype inference ───────────────────────────────────
  const marketingSubtype =
    targetRole === 'Marketing' ? inferMarketingSubtype(jdText) : undefined

  return {
    matchScore,
    jdKeywords,
    matchedKeywords,
    missingKeywords,
    breakdown: {
      roleKeywords: { matched: roleMatched, missing: roleMissing },
      toolKeywords: { matched: toolMatched, missing: toolMissing },
      generalKeywords: { matched: generalMatched, missing: generalMissing },
    },
    marketingSubtype,
    detectedJDRole,
    roleAlignment,
    segmentMismatch,
    deductions: {
      role:     roleDeduction,
      keywords: kwDeduction,
      tools:    toolDeduction,
      segment:  segmentDeduction,
      total:    totalDeduction,
    },
  }
}
