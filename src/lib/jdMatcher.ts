// CV Pulse — JD Match Engine
// Epic 9 | Deterministic keyword-based JD matching. No LLM. Same input = same output.
//
// Algorithm:
//   1. Build a universe of known role keywords + tools (from scorer sets)
//   2. Find which universe keywords appear in the JD → "JD keyword set"
//   3. Compare JD keyword set against CV raw_text
//   4. Compute weighted match score:
//        - target-role keywords in JD  → weight 3 (highest relevance)
//        - target-role tools in JD     → weight 2
//        - other keywords in JD        → weight 1
//   5. For Marketing CVs, infer subtype (demand-gen / content / growth / brand)
//
// All keyword sets are transparent in the UI — no black boxes.

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

export interface JDMatchResult {
  matchScore: number          // 0–100
  jdKeywords: string[]        // full keyword set extracted from JD (transparent)
  matchedKeywords: string[]   // JD keywords present in CV
  missingKeywords: string[]   // JD keywords absent from CV
  breakdown: {
    roleKeywords: JDKeywordGroup     // target-role keywords from ATS set, found in JD
    toolKeywords: JDKeywordGroup     // target-role tools, found in JD
    generalKeywords: JDKeywordGroup  // other-role keywords found in JD
  }
  marketingSubtype?: string   // inferred for Marketing role CVs (demand-gen, content, growth, brand)
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
    // JD uses non-standard language — return a neutral result
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
    }
  }

  // ── Step 2: Which JD keywords appear in the CV? ────────────────────────────
  const roleMatched = presentIn(cvRawText, roleKeywordsInJD)
  const roleMissing = absentFrom(cvRawText, roleKeywordsInJD)

  const toolMatched = presentIn(cvRawText, toolKeywordsInJD)
  const toolMissing = absentFrom(cvRawText, toolKeywordsInJD)

  const generalMatched = presentIn(cvRawText, generalKeywordsInJD)
  const generalMissing = absentFrom(cvRawText, generalKeywordsInJD)

  // ── Step 3: Weighted match score ───────────────────────────────────────────
  // Role keywords in JD  → weight 3 (highest signal)
  // Tool keywords in JD  → weight 2
  // General keywords     → weight 1
  const WEIGHT_ROLE = 3
  const WEIGHT_TOOL = 2
  const WEIGHT_GENERAL = 1

  const totalWeight =
    roleKeywordsInJD.length * WEIGHT_ROLE +
    toolKeywordsInJD.length * WEIGHT_TOOL +
    generalKeywordsInJD.length * WEIGHT_GENERAL

  const matchedWeight =
    roleMatched.length * WEIGHT_ROLE +
    toolMatched.length * WEIGHT_TOOL +
    generalMatched.length * WEIGHT_GENERAL

  const rawScore = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0
  const matchScore = Math.round(Math.min(rawScore, 100))

  // ── Step 4: Flatten matched / missing lists ────────────────────────────────
  const matchedKeywords = [...roleMatched, ...toolMatched, ...generalMatched]
  const missingKeywords = [...roleMissing, ...toolMissing, ...generalMissing]

  // ── Step 5: Marketing subtype inference ───────────────────────────────────
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
  }
}
