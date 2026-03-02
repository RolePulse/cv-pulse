// CV Pulse — One-click CV fixes
// Epic 7 | Deterministic transformations. No LLM. Same input = same output.

import type { StructuredCV, ExperienceRole } from '@/types/database'

// ─── Fix types ────────────────────────────────────────────────────────────────

export type FixId =
  | 'convert-paragraphs'
  | 'add-metric-placeholders'
  | 'add-company-one-liners'
  | 'add-gap-explanations'
  | 'add-short-stint-labels'
  | 'replace-weak-verbs'

export interface AvailableFix {
  id: FixId
  label: string
  description: string
  rolesAffected: number
}

// ─── Helpers (mirrored from scorer — not exported from there) ─────────────────

const METRIC_PATTERNS = [
  /\d+\s*%/,
  /\$\s*\d/,
  /£\s*\d/,
  /€\s*\d/,
  /\d+\s*x\b/i,
  /#\s*\d/,
  /top\s+\d+\s*%/i,
  /\b(doubled|tripled|quadrupled)\b/i,
  /\d+\s*(million|billion|k)\b/i,
  /\d+\s*(clients?|customers?|accounts?|deals?|users?|leads?|companies)\b/i,
  /increased\s+by\s+\d/i,
  /reduced\s+by\s+\d/i,
  /\b\d{3,}\b/,
  /ranked\s+(#|\d)/i,
  /\bq[1-4]\b.*\d/i,
]

function isQuantified(bullet: string): boolean {
  return METRIC_PATTERNS.some((re) => re.test(bullet))
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

function parseDateToYM(raw: string): [number, number] | null {
  if (!raw) return null
  const s = raw.toLowerCase().trim()
  if (['present', 'now', 'current', 'ongoing'].includes(s)) {
    const now = new Date()
    return [now.getFullYear(), now.getMonth() + 1]
  }
  // "Jan 2022" or "January 2022"
  const monthYear = s.match(/([a-z]+)\s+(\d{4})/)
  if (monthYear) {
    const month = MONTH_MAP[monthYear[1]]
    if (month) return [parseInt(monthYear[2], 10), month]
  }
  // "2022-01" or "01/2022"
  const isoLike = s.match(/(\d{4})[-/](\d{1,2})/)
  if (isoLike) return [parseInt(isoLike[1], 10), parseInt(isoLike[2], 10)]
  // Bare year "2022"
  const year = s.match(/^(\d{4})$/)
  if (year) return [parseInt(year[1], 10), 6] // assume mid-year
  return null
}

function monthDiff(a: [number, number], b: [number, number]): number {
  return (b[0] - a[0]) * 12 + (b[1] - a[1])
}

// ─── Weak verb swap list ──────────────────────────────────────────────────────

interface WeakVerbSwap {
  pattern: RegExp
  replacement: string  // empty string = remove prefix, capitalise rest
}

const WEAK_VERB_SWAPS: WeakVerbSwap[] = [
  { pattern: /^responsible for managing\s+/i,   replacement: 'Managed ' },
  { pattern: /^responsible for developing\s+/i, replacement: 'Developed ' },
  { pattern: /^responsible for leading\s+/i,    replacement: 'Led ' },
  { pattern: /^responsible for building\s+/i,   replacement: 'Built ' },
  { pattern: /^responsible for driving\s+/i,    replacement: 'Drove ' },
  { pattern: /^responsible for owning\s+/i,     replacement: 'Owned ' },
  { pattern: /^responsible for\s+/i,            replacement: '' },
  { pattern: /^was responsible for\s+/i,        replacement: '' },
  { pattern: /^helped to\s+/i,                  replacement: '' },
  { pattern: /^helped\s+/i,                     replacement: '' },
  { pattern: /^assisted in\s+/i,                replacement: '' },
  { pattern: /^assisted with\s+/i,              replacement: '' },
  { pattern: /^assisted\s+/i,                   replacement: '' },
  { pattern: /^worked closely with\s+/i,        replacement: 'Partnered with ' },
  { pattern: /^worked on\s+/i,                  replacement: 'Delivered ' },
  { pattern: /^worked to\s+/i,                  replacement: '' },
  { pattern: /^worked with\s+/i,                replacement: 'Collaborated with ' },
  { pattern: /^involved in\s+/i,                replacement: 'Contributed to ' },
  { pattern: /^tasked with\s+/i,                replacement: '' },
  { pattern: /^duties included\s+/i,            replacement: '' },
  { pattern: /^my duties included\s+/i,         replacement: '' },
]

const WEAK_VERB_DETECT = new RegExp(
  '^(responsible for|was responsible for|helped to?|assisted (in|with)?|' +
  'worked (on|to|with|closely with)|involved in|tasked with|duties included|' +
  'my duties included)',
  'i'
)

function applyWeakVerbSwap(bullet: string): string {
  for (const { pattern, replacement } of WEAK_VERB_SWAPS) {
    if (pattern.test(bullet)) {
      const rest = bullet.replace(pattern, replacement)
      // Capitalise first char if replacement is empty (we removed the prefix)
      return replacement === '' ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest
    }
  }
  return bullet
}

function hasWeakVerb(bullet: string): boolean {
  return WEAK_VERB_DETECT.test(bullet.trim())
}

// ─── Detection — which fixes are applicable right now? ────────────────────────

export function detectAvailableFixes(cv: StructuredCV): AvailableFix[] {
  const fixes: AvailableFix[] = []
  const roles = cv.experience ?? []

  // 1. Paragraph bullets (bullet text > 150 chars — likely a prose paragraph)
  const paraRoles = roles.filter((r) => r.bullets.some((b) => b.trim().length > 150))
  if (paraRoles.length > 0) {
    fixes.push({
      id: 'convert-paragraphs',
      label: 'Split long bullets into shorter ones',
      description: `${paraRoles.length} role${paraRoles.length > 1 ? 's have' : ' has'} bullets that are too long — ATS parsers truncate them.`,
      rolesAffected: paraRoles.length,
    })
  }

  // 2. Metric placeholders (roles with 0 quantified bullets AND no placeholder already added)
  const noMetricRoles = roles.slice(0, 3).filter(
    (r) => r.bullets.filter(isQuantified).length === 0 && !r.bullets.some((b) => b.startsWith('[Add metric:'))
  )
  if (noMetricRoles.length > 0) {
    fixes.push({
      id: 'add-metric-placeholders',
      label: 'Add metric placeholders',
      description: `${noMetricRoles.length} role${noMetricRoles.length > 1 ? 's have' : ' has'} no measurable results. Adds reminder bullets — replace them with real numbers to boost your score.`,
      rolesAffected: noMetricRoles.length,
    })
  }

  // 3. Company one-liners (roles with no short context bullet AND no placeholder already added)
  const noContextRoles = roles.filter(
    (r) =>
      !r.bullets.some((b) => b.trim().length < 80 && b.trim().length > 10) &&
      !r.bullets.some((b) => b.startsWith('[Context:'))
  )
  if (noContextRoles.length > 0) {
    fixes.push({
      id: 'add-company-one-liners',
      label: 'Add company context lines',
      description: `${noContextRoles.length} role${noContextRoles.length > 1 ? 's are' : ' is'} missing a one-liner explaining what the company does.`,
      rolesAffected: noContextRoles.length,
    })
  }

  // 4. Gap explanations (consecutive roles with gap > 6 months AND no gap note already added)
  const sortedRoles = [...roles].sort((a, b) => {
    const [ay, am] = parseDateToYM(a.start) ?? [0, 0]
    const [by, bm] = parseDateToYM(b.start) ?? [0, 0]
    return ay !== by ? ay - by : am - bm
  })
  let gapCount = 0
  for (let i = 0; i < sortedRoles.length - 1; i++) {
    const endDate = parseDateToYM(sortedRoles[i].end ?? 'present')
    const nextStart = parseDateToYM(sortedRoles[i + 1].start)
    const alreadyLabelled = sortedRoles[i].bullets.some((b) => b.startsWith('[Gap note:'))
    if (endDate && nextStart && monthDiff(endDate, nextStart) > 6 && !alreadyLabelled) {
      gapCount++
    }
  }
  if (gapCount > 0) {
    fixes.push({
      id: 'add-gap-explanations',
      label: 'Label career gaps',
      description: `${gapCount} gap${gapCount > 1 ? 's' : ''} over 6 months detected — add a brief explanation to each.`,
      rolesAffected: gapCount,
    })
  }

  // 5. Short stint labels (roles lasting < 12 months AND no label already added)
  const shortStintRoles = roles.filter((r) => {
    if (!r.end || r.end.toLowerCase().includes('present')) return false
    const start = parseDateToYM(r.start)
    const end = parseDateToYM(r.end)
    if (!start || !end) return false
    if (monthDiff(start, end) >= 12) return false
    return !r.bullets.some((b) => b.startsWith('[Short tenure'))
  })
  if (shortStintRoles.length > 0) {
    fixes.push({
      id: 'add-short-stint-labels',
      label: 'Label short tenures',
      description: `${shortStintRoles.length} role${shortStintRoles.length > 1 ? 's are' : ' is'} under 12 months — adding a context line helps recruiters.`,
      rolesAffected: shortStintRoles.length,
    })
  }

  // 6. Weak verb replacement
  const weakVerbRoles = roles.filter((r) => r.bullets.some((b) => hasWeakVerb(b.trim())))
  if (weakVerbRoles.length > 0) {
    fixes.push({
      id: 'replace-weak-verbs',
      label: 'Replace weak verbs',
      description: `${weakVerbRoles.length} role${weakVerbRoles.length > 1 ? 's have' : ' has'} bullets starting with weak phrases ("responsible for", "helped", etc.).`,
      rolesAffected: weakVerbRoles.length,
    })
  }

  return fixes
}

// ─── Application — transform the CV for a given fix ──────────────────────────

export function applyFix(cv: StructuredCV, fixId: FixId): StructuredCV {
  switch (fixId) {
    case 'convert-paragraphs':
      return applyConvertParagraphs(cv)
    case 'add-metric-placeholders':
      return applyMetricPlaceholders(cv)
    case 'add-company-one-liners':
      return applyCompanyOneLiners(cv)
    case 'add-gap-explanations':
      return applyGapExplanations(cv)
    case 'add-short-stint-labels':
      return applyShortStintLabels(cv)
    case 'replace-weak-verbs':
      return applyReplaceWeakVerbs(cv)
    default:
      return cv
  }
}

// ─── Fix implementations ──────────────────────────────────────────────────────

/** Split long bullets (>150 chars) on sentence boundaries into multiple shorter bullets */
function applyConvertParagraphs(cv: StructuredCV): StructuredCV {
  return {
    ...cv,
    experience: cv.experience.map((role) => ({
      ...role,
      bullets: role.bullets.flatMap((bullet) => {
        if (bullet.trim().length <= 150) return [bullet]
        // Split on ". " where both halves are > 20 chars
        const parts = bullet
          .split(/\.\s+/)
          .map((p) => p.trim())
          .filter((p) => p.length > 20)
        if (parts.length < 2) return [bullet]
        // Re-add trailing period where needed
        return parts.map((p) => (p.endsWith('.') ? p : p + '.'))
      }),
    })),
  }
}

/** Add a metric placeholder bullet to roles with no quantified results */
function applyMetricPlaceholders(cv: StructuredCV): StructuredCV {
  return {
    ...cv,
    experience: cv.experience.map((role, i) => {
      // Only apply to first 3 roles (same as scorer scope)
      if (i >= 3) return role
      const hasMetrics = role.bullets.filter(isQuantified).length > 0
      if (hasMetrics) return role
      // Check if we already added a placeholder
      const alreadyHasPlaceholder = role.bullets.some((b) => b.startsWith('[Add metric:'))
      if (alreadyHasPlaceholder) return role
      return {
        ...role,
        bullets: [
          ...role.bullets,
          '[Add metric: e.g. achieved X% improvement / drove £X revenue / hit X% of quota]',
        ],
      }
    }),
  }
}

/** Add a company one-liner template to roles that lack short context bullets */
function applyCompanyOneLiners(cv: StructuredCV): StructuredCV {
  return {
    ...cv,
    experience: cv.experience.map((role) => {
      const hasShortBullet = role.bullets.some(
        (b) => b.trim().length < 80 && b.trim().length > 10
      )
      if (hasShortBullet) return role
      const alreadyHas = role.bullets.some((b) => b.startsWith('[Context:'))
      if (alreadyHas) return role
      return {
        ...role,
        bullets: [
          `[Context: ${role.company} — add one sentence: what does the company do and how big is it?]`,
          ...role.bullets,
        ],
      }
    }),
  }
}

/** Add gap explanation notes to roles where a >6 month gap follows */
function applyGapExplanations(cv: StructuredCV): StructuredCV {
  const roles = [...cv.experience]

  // Sort by start date to find gaps
  const sortedIndexed = roles
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => {
      const [ay, am] = parseDateToYM(a.r.start) ?? [0, 0]
      const [by, bm] = parseDateToYM(b.r.start) ?? [0, 0]
      return ay !== by ? ay - by : am - bm
    })

  const updated = [...roles]
  for (let i = 0; i < sortedIndexed.length - 1; i++) {
    const curr = sortedIndexed[i]
    const next = sortedIndexed[i + 1]
    const endDate = parseDateToYM(curr.r.end ?? 'present')
    const nextStart = parseDateToYM(next.r.start)
    if (!endDate || !nextStart) continue
    const gap = monthDiff(endDate, nextStart)
    if (gap <= 6) continue

    // Add a note to the role that ends before the gap
    const role = updated[curr.idx]
    const noteText = `[Gap note: ${gap} months between this role and ${next.r.title} at ${next.r.company}. Add brief explanation — e.g. career break, freelancing, caring responsibilities]`
    const alreadyHas = role.bullets.some((b) => b.startsWith('[Gap note:'))
    if (!alreadyHas) {
      updated[curr.idx] = { ...role, bullets: [...role.bullets, noteText] }
    }
  }

  return { ...cv, experience: updated }
}

/** Add a short tenure context line to roles lasting under 12 months */
function applyShortStintLabels(cv: StructuredCV): StructuredCV {
  return {
    ...cv,
    experience: cv.experience.map((role) => {
      if (!role.end || role.end.toLowerCase().includes('present')) return role
      const start = parseDateToYM(role.start)
      const end = parseDateToYM(role.end)
      if (!start || !end) return role
      const duration = monthDiff(start, end)
      if (duration >= 12) return role
      const alreadyHas = role.bullets.some((b) => b.startsWith('[Short tenure'))
      if (alreadyHas) return role
      return {
        ...role,
        bullets: [
          `[Short tenure (${duration} months): add context — e.g. contract role, company acquired, team restructured, role made redundant]`,
          ...role.bullets,
        ],
      }
    }),
  }
}

/** Replace weak verb phrases in bullets with stronger action-oriented alternatives */
function applyReplaceWeakVerbs(cv: StructuredCV): StructuredCV {
  return {
    ...cv,
    experience: cv.experience.map((role) => ({
      ...role,
      bullets: role.bullets.map((bullet) =>
        hasWeakVerb(bullet.trim()) ? applyWeakVerbSwap(bullet.trim()) : bullet
      ),
    })),
  }
}
