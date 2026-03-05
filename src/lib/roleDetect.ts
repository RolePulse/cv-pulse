// CV Pulse — Role Detection
// Epic 3 | Deterministic keyword-based role inference. No LLM.

export type TargetRole = 'SDR' | 'AE' | 'SE' | 'CSM' | 'Marketing' | 'Leadership' | 'RevOps'

// Ordered for the role picker grid: sales stack row 1, post-sales/ops row 2, leadership row 3
export const ALL_ROLES: TargetRole[] = ['SDR', 'AE', 'SE', 'CSM', 'Marketing', 'RevOps', 'Leadership']

export const ROLE_LABELS: Record<TargetRole, string> = {
  SDR: 'SDR / BDR',
  AE: 'Account Executive',
  SE: 'Solutions Engineer',
  CSM: 'Customer Success',
  Marketing: 'Marketing',
  Leadership: 'Leadership / VP',
  RevOps: 'RevOps',
}

export const ROLE_DESCRIPTIONS: Record<TargetRole, string> = {
  SDR: 'Pipeline generation, outbound, sequences',
  AE: 'Closing, quota, new business',
  SE: 'Demos, POCs, technical discovery, value selling',
  CSM: 'Retention, renewals, customer health',
  Marketing: 'Demand gen, content, campaigns',
  Leadership: 'Team building, strategy, revenue org',
  RevOps: 'CRM, process, revenue operations',
}

const ROLE_KEYWORDS: Record<TargetRole, string[]> = {
  SDR: [
    'outbound',
    'prospecting',
    'cold calling',
    'cold call',
    'pipeline generation',
    'sequences',
    'outreach',
    'salesloft',
    'bdr',
    'sdr',
    'business development representative',
    'sales development representative',
  ],
  AE: [
    'closing',
    'quota attainment',
    'new business',
    'acv',
    'arr',
    'deals closed',
    'enterprise sales',
    'discovery calls',
    'account executive',
    'negotiation',
    'contract value',
    'net new',
  ],
  SE: [
    'solutions engineer',
    'sales engineer',
    'presales',
    'pre-sales',
    'proof of concept',
    'poc',
    'technical discovery',
    'value engineer',
    'solutions consultant',
    'solution engineering',
    'technical evaluation',
    'rfp',
    'rfi',
    'sandbox',
    'technical champion',
  ],
  CSM: [
    'churn',
    'retention',
    'nps',
    'onboarding',
    'qbr',
    'renewal',
    'expansion revenue',
    'upsell',
    'health score',
    'customer success',
    'adoption',
    'csat',
    'customer satisfaction',
  ],
  Marketing: [
    'demand gen',
    'demand generation',
    'content marketing',
    'seo',
    'campaigns',
    'mql',
    'attribution',
    'paid social',
    'email marketing',
    'abm',
    'account based marketing',
    'marketing manager',
    'growth marketing',
  ],
  Leadership: [
    'vp of',
    'director of',
    'head of',
    'vp,',
    'managed a team',
    'built a team',
    'hiring',
    'okrs',
    'revenue org',
    'p&l',
    'board',
    'chief',
    'c-suite',
  ],
  RevOps: [
    'revenue operations',
    'revops',
    'sales operations',
    'sales ops',
    'marketing ops',
    'crm administration',
    'salesforce admin',
    'pipeline hygiene',
    'territory planning',
    'quota setting',
    'forecasting',
    'process optimisation',
    'process optimization',
    'data quality',
    'revenue ops',
    'gtm operations',
  ],
}

const MIN_HITS_TO_DETECT = 3

// Extract searchable text from structured CV JSON
function extractText(structured: Record<string, unknown>): string {
  const parts: string[] = []

  if (typeof structured.summary === 'string') {
    parts.push(structured.summary)
  }

  if (Array.isArray(structured.skills)) {
    parts.push(...structured.skills.map((s: unknown) => String(s)))
  }

  if (Array.isArray(structured.experience)) {
    for (const role of structured.experience as Record<string, unknown>[]) {
      if (typeof role.title === 'string') parts.push(role.title)
      if (typeof role.company === 'string') parts.push(role.company)
      if (Array.isArray(role.bullets)) {
        parts.push(...role.bullets.map((b: unknown) => String(b)))
      }
    }
  }

  return parts.join(' ').toLowerCase()
}

export function detectRole(structured: Record<string, unknown>): TargetRole | null {
  const text = extractText(structured)

  const counts = {} as Record<TargetRole, number>

  for (const role of ALL_ROLES) {
    let hits = 0
    for (const keyword of ROLE_KEYWORDS[role]) {
      if (text.includes(keyword)) hits++
    }
    counts[role] = hits
  }

  const sorted = (Object.entries(counts) as [TargetRole, number][]).sort((a, b) => b[1] - a[1])
  const [topRole, topCount] = sorted[0]

  return topCount >= MIN_HITS_TO_DETECT ? topRole : null
}
