// CV Pulse — Rule-based CV parser
// Epic 2 | No LLMs. Same input = same output. Always.
//
// Parse pipeline:
//   Buffer/text → cleanText → collapseSpacedChars → detectSections → extract* → confidence gate

// pdf-parse is lazy-loaded to avoid its test file read at module init
// (known issue with pdf-parse and Next.js bundlers)
type PdfParseResult = { text: string; numpages: number }
async function pdfParse(buffer: Buffer): Promise<PdfParseResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const parse = require('pdf-parse') as (buffer: Buffer) => Promise<PdfParseResult>
  return parse(buffer)
}

import type { StructuredCV, ExperienceRole, EducationEntry } from '@/types/database'

// ─── Text cleaning ────────────────────────────────────────────────────────────

/**
 * Detect and collapse "spaced-out" characters — a common PDF artifact from
 * decorative fonts: "O C T O B E R   2 0 2 3" → "OCTOBER 2023"
 * Also handles "T H O M A S" → "THOMAS"
 */
export function collapseSpacedChars(line: string): string {
  const trimmed = line.trim()
  // Matches: single chars (A-Z, 0-9) separated by 1-3 spaces, 4+ chars total
  // e.g. "E M P L O Y M E N T" or "O C T O B E R   2 0 2 3"
  if (/^[A-Z0-9]([ ]{1,3}[A-Z0-9]){3,}/.test(trimmed)) {
    // Collapse: remove spaces between individual chars, keep multi-space as single space
    return trimmed
      .replace(/([A-Z0-9]) ([A-Z0-9])/g, '$1$2')  // "A B" → "AB"
      .replace(/([A-Z0-9])  +([A-Z0-9])/g, '$1 $2') // "AB  CD" → "AB CD"
      .replace(/ +/g, ' ')
      .trim()
  }
  return line
}

export function cleanText(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Null bytes in PDFs are often encoding artifacts for en-dashes (date ranges, salary ranges)
    // Replace with en-dash so date parsers can find "05/2024 – Present" correctly
    .replace(/\u0000/g, '–')
    // Strip remaining control characters (leave \n alone — handled by split/join)
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .split('\n')
    .map(collapseSpacedChars) // collapse "O C T O B E R" → "OCTOBER" per line

  return lines
    .join('\n')
    // Replace 8+ consecutive spaces with a newline — preserves two-column PDF layout
    // where columns are space-padded on the same row (e.g. "COMPANY         LOCATION")
    .replace(/ {8,}/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim()
}

// ─── Section detection ────────────────────────────────────────────────────────

// Trailing noise after section headings: spaces, colons, underscores, dashes, dots, equals
const SECTION_TAIL = '[\\s:_\\-\\.=]*$'

const SECTION_PATTERNS: Record<string, RegExp> = {
  summary: new RegExp(`^(summary|profile|professional\\s+summary|career\\s+summary|about\\s+me|executive\\s+summary|personal\\s+statement|career\\s+objective|objective|about|career\\s+profile|professional\\s+profile|personal\\s+profile|introduction|highlights?)${SECTION_TAIL}`, 'im'),
  experience: new RegExp(`^(experience|work\\s+experience|employment\\s+history|professional\\s+experience|work\\s+history|career\\s+history|relevant\\s+experience|employment|positions?\\s+held|professional\\s+background|career\\s+background|relevant\\s+work|work\\s+&\\s+experience|experience\\s+&\\s+skills)${SECTION_TAIL}`, 'im'),
  education: new RegExp(`^(education|academic\\s+background|qualifications|academic\\s+history|educational\\s+background|academic\\s+qualifications|education\\s+&?\\s*training|education\\s+&?\\s*certifications?|academic\\s+achievements?)${SECTION_TAIL}`, 'im'),
  skills: new RegExp(`^(skills|technical\\s+skills|core\\s+skills|key\\s+skills|competencies|areas\\s+of\\s+expertise|expertise|core\\s+competencies|tools?\\s+&\\s+technologies|technologies|technical\\s+proficiencies?|core\\s+strengths?|areas\\s+of\\s+strength|strengths?|languages?\\s+&\\s+tools?|tech\\s+stack)${SECTION_TAIL}`, 'im'),
  certifications: new RegExp(`^(certifications?|certificates?|credentials?|licen[sc]es?|professional\\s+development|courses?|training|achievements?|awards?\\s+&\\s+achievements?|honours?|accomplishments?)${SECTION_TAIL}`, 'im'),
  projects: new RegExp(`^(projects?|personal\\s+projects?|key\\s+projects?|notable\\s+projects?|portfolio|volunteer|volunteering|activities|interests?|additional\\s+information|other|languages?)${SECTION_TAIL}`, 'im'),
  // French CV section headings
  french: new RegExp(`^(exp[eé]riences?\\s+professionnelles?|exp[eé]riences?|formation|comp[eé]tences?|profil\\s+professionnel|profil|langues?|centres?\\s+d.int[eé]r[eê]ts?|r[eé]f[eé]rences?|certifications?|loisirs?)${SECTION_TAIL}`, 'im'),
}

// Compressed section keywords — for garbled/spaced encodings like "WOR K   E X P E R I E NC E"
const COMPRESSED_SECTION_KEYWORDS = [
  'EXPERIENCE', 'WORKEXPERIENCE', 'EMPLOYMENTHISTORY', 'PROFESSIONALEXPERIENCE',
  'WORKHISTORY', 'CAREERHISTORY', 'EDUCATION', 'SKILLS', 'TECHNICALSKILLS',
  'COMPETENCIES', 'SUMMARY', 'PROFILE', 'OBJECTIVE', 'CERTIFICATIONS',
  'QUALIFICATIONS', 'ACHIEVEMENTS', 'PROJECTS', 'LANGUAGES', 'TRAINING',
]

export function detectSections(text: string): Record<string, string> {
  const lines = text.split('\n')
  const sectionStarts: Array<{ section: string; lineIndex: number }> = []

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > 70) return
    for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
      if (pattern.test(trimmed)) {
        sectionStarts.push({ section, lineIndex: i })
        break
      }
    }
  })

  const sections: Record<string, string> = {}

  sectionStarts.forEach(({ section, lineIndex }, idx) => {
    const nextLineIndex = sectionStarts[idx + 1]?.lineIndex ?? lines.length
    sections[section] = lines.slice(lineIndex + 1, nextLineIndex).join('\n').trim()
  })

  // No explicit summary — grab first paragraph before first detected section
  if (!sections.summary && sectionStarts.length > 0) {
    const preamble = lines
      .slice(0, sectionStarts[0].lineIndex)
      .map(l => l.trim())
      .filter(Boolean)
    if (preamble.length > 5) {
      sections.summary = preamble.slice(4).join(' ').trim()
    }
  }

  return sections
}

// ─── Date utilities ───────────────────────────────────────────────────────────

const MONTHS_PATTERN = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?'

// A single date token: "Jan 2020", "2020", "01/2020"
export const DATE_TOKEN_RE = new RegExp(
  `(?:(?:${MONTHS_PATTERN})\\.?\\s+)?(?:20|19)\\d{2}|(?:0[1-9]|1[0-2])\\/(?:20|19)?\\d{2}`,
  'i'
)

// A full date range: "Jan 2020 – Dec 2021" / "2019 – Present" / "2019-2022"
export const DATE_RANGE_RE = new RegExp(
  `(?:(?:${MONTHS_PATTERN})\\.?\\s+)?(?:20|19)\\d{2}\\s*[-–—]\\s*(?:(?:(?:${MONTHS_PATTERN})\\.?\\s+)?(?:20|19)\\d{2}|present|current|now)`,
  'i'
)

// Abbreviated 2-digit year range: "Oct 24 – Dec 24" / "Apr 21 – Jul 24"
// Requires full month name on both sides to avoid false positives
export const DATE_RANGE_SHORT_RE = new RegExp(
  `(?:${MONTHS_PATTERN})\\.?\\s+\\d{2}\\s*[-–—]\\s*(?:(?:${MONTHS_PATTERN})\\.?\\s+\\d{2}|present|current|now)`,
  'i'
)

// Any standalone 4-digit year in 19xx or 20xx range
export const YEAR_RE = /\b(?:19|20)\d{2}\b/g

function looksLikeDateRange(line: string): boolean {
  return DATE_RANGE_RE.test(line)
}

function parseEndDate(raw: string): string | null {
  return /present|current|now/i.test(raw) ? null : raw.trim()
}

// ─── Bullet extraction ────────────────────────────────────────────────────────

// Comprehensive bullet chars including font-encoding substitutes (£ → •, etc.)
const BULLET_CHARS = '•\\-\\*▪▸◦→·✓➤➢●○▶£►–—'

// Allow optional space after bullet char (many CVs use •Text not • Text)
const BULLET_LINE_RE = new RegExp(`^[\\s]*[${BULLET_CHARS}]\\s*.{10,}`)
const NUMBERED_BULLET_RE = /^\s*\d+[.)]\s+.{10,}/

export function isBulletLine(line: string): boolean {
  return BULLET_LINE_RE.test(line) || NUMBERED_BULLET_RE.test(line)
}

export function extractBullets(text: string): string[] {
  return text
    .split('\n')
    .filter(l => isBulletLine(l))
    .map(l => l.replace(new RegExp(`^[\\s${BULLET_CHARS}\\d.)]+\\s*`), '').trim())
    .filter(Boolean)
}

// ─── Experience extraction ────────────────────────────────────────────────────
//
// Strategy: primary = anchor on date ranges; fallback = anchor on year tokens.

export function extractExperience(text: string): ExperienceRole[] {
  if (!text.trim()) return []

  const lines = text.split('\n').map(l => l.trim())
  const roles: ExperienceRole[] = []

  // Primary: find lines containing full date ranges
  let dateLineIndices: number[] = []
  lines.forEach((line, i) => {
    if (DATE_RANGE_RE.test(line)) dateLineIndices.push(i)
  })

  // Fallback: if no ranges found, anchor on lines containing year tokens
  // (handles multi-column PDFs where start/end dates appear separately)
  if (dateLineIndices.length === 0) {
    lines.forEach((line, i) => {
      if (/\b(?:19|20)\d{2}\b/.test(line) && line.length < 80) {
        dateLineIndices.push(i)
      }
    })
    // Limit fallback anchors to avoid flooding (max 15)
    dateLineIndices = dateLineIndices.slice(0, 15)
  }

  if (dateLineIndices.length === 0) return []

  dateLineIndices.forEach((dateIdx, position) => {
    const dateLine = lines[dateIdx]
    const rangeMatch = dateLine.match(DATE_RANGE_RE)
    if (!rangeMatch) return

    const fullRange = rangeMatch[0]
    const rangeParts = fullRange.split(/[-–—]/).map(s => s.trim())
    const start = rangeParts[0] || ''
    const end = parseEndDate(rangeParts[1] || '')

    // ── Determine title + company ──────────────────────────────────────────
    let title = ''
    let company = ''

    // Case A: date range inline — "Company Name   Jan 2020 – Dec 2021"
    const dateStart = dateLine.indexOf(rangeMatch[0])
    const textBefore = dateLine.slice(0, dateStart).trim().replace(/[|·—,]+$/, '').trim()
    if (textBefore.length > 2) company = textBefore

    const prev1 = dateIdx > 0 ? lines[dateIdx - 1] : ''
    const prev2 = dateIdx > 1 ? lines[dateIdx - 2] : ''

    if (!company) {
      if (prev1 && (prev1.includes('|') || prev1.includes('·') || prev1.includes(',') && prev1.length < 60)) {
        // "Title | Company" or "Title · Company" or "Title, Company"
        const sep = prev1.includes('|') ? '|' : prev1.includes('·') ? '·' : ','
        const parts = prev1.split(sep).map(s => s.trim())
        title = parts[0] || ''
        company = parts[1] || ''
      } else if (prev1 && prev2 && !looksLikeDateRange(prev2) && !looksLikeDateRange(prev1)) {
        // Two separate lines
        title = prev2
        company = prev1
      } else if (prev1 && !looksLikeDateRange(prev1)) {
        title = prev1
      }
    } else if (prev1 && !looksLikeDateRange(prev1)) {
      title = prev1
    }

    // ── Extract bullets forward ────────────────────────────────────────────
    const nextDateIdx = dateLineIndices[position + 1] ?? lines.length
    const bullets = lines.slice(dateIdx + 1, nextDateIdx)
      .filter(l => isBulletLine(l))
      .map(l => l.replace(new RegExp(`^[${BULLET_CHARS}\\d.)]+\\s*`), '').trim())
      .filter(Boolean)

    if (title || company) {
      roles.push({ company, title, start, end, bullets })
    }
  })

  // Deduplicate
  return roles.filter((role, i) => {
    if (i === 0) return true
    const prev = roles[i - 1]
    return !(role.title === prev.title && role.company === prev.company && role.start === prev.start)
  })
}

// ─── Skills extraction ────────────────────────────────────────────────────────

export function extractSkills(text: string): string[] {
  if (!text.trim()) return []
  return text
    .split(/[,|•\n·\/]/)
    .map(s => {
      let skill = s.replace(new RegExp(`^[\\-\\*\\s${BULLET_CHARS}]+`), '').trim()
      // Strip category label prefixes like "Languages: ", "Tools: ", "Methods: "
      skill = skill.replace(/^[A-Za-z][A-Za-z\s&\/]{1,20}:\s+/, '')
      return skill.trim()
    })
    .filter(s => s.length >= 2 && s.length <= 60 && !/^\d+$/.test(s))
    .slice(0, 60)
}

// ─── Education extraction ─────────────────────────────────────────────────────

export function extractEducation(text: string): EducationEntry[] {
  if (!text.trim()) return []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const entries: EducationEntry[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const yearMatch = line.match(/\b((?:19|20)\d{2})\b/)
    const year = yearMatch ? yearMatch[1] : ''
    let institution = '', qualification = ''
    if (/\s+at\s+|\|/.test(line)) {
      const parts = line.split(/\s+at\s+|\|/).map(s => s.replace(/\b(?:19|20)\d{2}\b/g, '').trim())
      qualification = parts[0] || ''
      institution = parts[1] || ''
    } else {
      qualification = line.replace(/\b(?:19|20)\d{2}\b[-–]?(?:\d{4})?/g, '').trim()
      const next = lines[i + 1] || ''
      if (next && !DATE_RANGE_RE.test(next) && !DATE_TOKEN_RE.test(next.slice(0, 8))) {
        institution = next.replace(/\b(?:19|20)\d{2}\b/g, '').trim()
        i++
      }
    }
    if (qualification || institution) entries.push({ institution, qualification, year })
    i++
  }
  return entries.slice(0, 6)
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

export interface ConfidenceResult {
  score: number     // 0–100
  reasons: string[] // human-readable failure reasons (for failReason / debug)
}

/**
 * Name detection — much more permissive than v1.
 * Accepts: "John Smith", "JOHN SMITH", "John van der Berg", "TH O M A S" (after collapse)
 * Rejects: emails, URLs, phone numbers, single words, very long lines
 */
// Common professional name suffixes to strip before checking
const NAME_SUFFIXES = /,?\s*(MBA|PhD|Ph\.D|CPA|CFA|PMP|JD|MD|MSc|BSc|MA|MS|BA|BS|FCCA|ACA|ACCA|CIMA|CEng|FCA|MRICS|CIPD|CIPS|CMgr|CMC|DBA|MPA|LLB|LLM|MRes|MEng|BEng|HND|DipM|PgDip)\b/gi

export function hasNameLikeHeader(text: string): boolean {
  const firstLines = text
    .split('\n')
    .slice(0, 22)   // wider window — multi-column PDFs can put name after contact block
    .map(l => collapseSpacedChars(l.trim()))
    .filter(l => l.length > 1 && l.length < 65)

  return firstLines.some(line => {
    // Reject obvious non-names
    if (/@/.test(line)) return false
    if (/https?:|www\./i.test(line)) return false
    if (/linkedin\.|github\.|twitter\./i.test(line)) return false
    if (/\d{5,}/.test(line)) return false
    if (/^\+?\d[\d\s\-().]{6,}$/.test(line)) return false
    if (/^(page|curriculum\s+vitae|resume|cv\b|contact|details|address|phone|email|profile|summary|objective|languages?|skills|education|experience|highlights)$/i.test(line)) return false

    // Pre-process the line
    let candidate = line
      .replace(/\([\w\s.]+\)/g, '')  // strip parentheticals: "(JP)", "(Julian)"
      .replace(NAME_SUFFIXES, '')     // strip professional suffixes: ", MBA"
      // If line is long and has a separator (|, +, –, :), take only the first chunk
      // e.g. "KELILAH KING SENIOR PRODUCT + GRAPHIC DESIGNER" → "KELILAH KING SENIOR PRODUCT"
      .replace(/\s*[|+:–—]\s*.{5,}$/, '')
      .replace(/[,;]+$/, '')          // strip trailing punctuation
      .trim()

    if (candidate.length < 2) return false

    // ALL-CAPS smashed single word that looks like a name: "MANJEERAVUTUKURI"
    // Heuristic: all caps, 6-25 chars, no digits → likely a smashed name
    if (/^[A-Z]{6,25}$/.test(candidate)) return true

    // Split on spaces
    const words = candidate.split(/\s+/).filter(Boolean)
    if (words.length < 1 || words.length > 7) return false

    // Expand CamelCase: "KristinaKingsley" → ["Kristina", "Kingsley"]
    const expandedWords = words.flatMap(w => {
      const camel = w.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ')
      return camel.length > 1 ? camel : [w]
    })
    const checkWords = expandedWords.length >= 2 ? expandedWords : words

    // All words must be Unicode letters + hyphens/apostrophes/dots
    if (!checkWords.every(w => /^[\p{L}\-'.]+$/u.test(w))) return false

    // At least one word starts with a capital
    if (!checkWords.some(w => /^\p{Lu}/u.test(w))) return false

    // Reject common words that aren't names
    const lower = checkWords.map(w => w.toLowerCase())
    if (lower.some(w => ['contact', 'resume', 'profile', 'skills', 'experience', 'education', 'summary', 'objective', 'overview', 'highlights', 'languages', 'technical', 'professional', 'personal'].includes(w))) return false

    return true
  })
}

/**
 * Count how many distinct CV section types are detected in the text.
 * This is a strong signal that the document is a CV, and is more robust
 * than date/role extraction against multi-column or unusual layouts.
 */
function stripTrailingNoise(line: string): string {
  // Strip trailing repeated punctuation/decoration: "EXPERIENCE___________" → "EXPERIENCE"
  return line.replace(/[\s_\-\.=]{3,}$/, '').trim()
}

export function countDetectedSections(text: string): number {
  // Pre-process lines — strip trailing noise so "EXPERIENCE______" matches as "EXPERIENCE"
  const lines = text.split('\n').map(l => stripTrailingNoise(l.trim())).filter(Boolean)
  const sectionTypes = Object.values(SECTION_PATTERNS)
  let count = 0

  for (const pattern of sectionTypes) {
    const matched = lines.some(line => line.length > 0 && line.length <= 80 && pattern.test(line))
    if (matched) { count++; continue }

    // Fallback: compressed match for garbled/spaced font encodings
    // e.g. "WOR K   E X P E R I E NC E" → "WORKEXPERIENCE"
    const compressedMatch = lines.some(line => {
      if (line.length > 60) return false
      const compressed = line.replace(/\s+/g, '').toUpperCase()
      return compressed.length >= 4 && COMPRESSED_SECTION_KEYWORDS.some(k => compressed === k || compressed.startsWith(k))
    })
    if (compressedMatch) count++
  }

  return count
}

export function calculateConfidence(text: string, structured: StructuredCV): ConfidenceResult {
  const reasons: string[] = []
  let score = 0

  // ── Criterion 1: Text volume — can we actually read this? (20pts) ──────────
  const charCount = text.replace(/\s/g, '').length
  if (charCount >= 800) {
    score += 20
  } else if (charCount >= 300) {
    score += 10
    reasons.push('CV text is quite short — some content may not have extracted')
  } else {
    reasons.push('Extracted text is too short — PDF is likely image-based')
  }

  // ── Criterion 2: Recognisable name (15pts) ────────────────────────────────
  if (hasNameLikeHeader(text)) {
    score += 15
  } else {
    reasons.push('No recognisable name found at the top of the document')
  }

  // ── Criterion 3: CV sections detected (25pts) ─────────────────────────────
  // Detecting named sections (Experience, Education, Skills etc.) is the most
  // reliable signal that this is a CV — more robust than date extraction.
  const sectionCount = countDetectedSections(text)
  if (sectionCount >= 3) {
    score += 25
  } else if (sectionCount === 2) {
    score += 20
  } else if (sectionCount === 1) {
    score += 10
    reasons.push('Only 1 CV section heading detected')
  } else {
    reasons.push('No standard CV section headings found')
  }

  // ── Criterion 4: Work history evidence (20pts) ────────────────────────────
  // Combines date ranges, year tokens, and experience-section content.
  // Multi-column CVs often lose date columns in extraction — fall back to
  // experience section presence + bullets as a proxy.
  const dateRanges = [
    ...(text.match(new RegExp(DATE_RANGE_RE.source, 'gi')) || []),
    ...(text.match(new RegExp(DATE_RANGE_SHORT_RE.source, 'gi')) || []),
  ]
  const yearTokens = text.match(YEAR_RE) || []
  const uniqueYears = new Set(yearTokens).size
  const hasExpSection = /^(experience|work\s+experience|employment\s+history|professional\s+experience|employment|exp[eé]riences?)/im.test(text)
  const bulletCount = text.split('\n').filter(l => isBulletLine(l)).length

  if (dateRanges.length >= 2 || uniqueYears >= 4) {
    score += 20
  } else if (
    dateRanges.length >= 1 ||
    uniqueYears >= 2 ||
    (hasExpSection && bulletCount >= 3)
  ) {
    score += 15
    if (dateRanges.length === 0 && uniqueYears < 2) {
      reasons.push('Limited date evidence — may be multi-column layout')
    }
  } else if (hasExpSection || structured.experience.length >= 1) {
    score += 8
    reasons.push('Experience section found but no date evidence extracted')
  } else {
    reasons.push('No work history evidence found')
  }

  // ── Criterion 5: Structured content / bullets (20pts) ─────────────────────
  const substantialLines = text.split('\n').filter(l => {
    const t = l.trim()
    return t.length >= 25 && t.length <= 250 && /^[\p{L}]/u.test(t)
  })

  if (bulletCount >= 3 || substantialLines.length >= 6) {
    score += 20
  } else if (bulletCount >= 1 || substantialLines.length >= 3) {
    score += 10
    reasons.push('Limited structured content detected')
  } else {
    reasons.push('No bullet points or structured content found')
  }

  return { score, reasons }
}

// ─── Main parse output ────────────────────────────────────────────────────────

export interface ParseResult {
  rawText: string
  structured: StructuredCV
  confidence: number   // 0–100
  failReason?: string
}

export const CONFIDENCE_THRESHOLD = 40  // Generous — err on the side of allowing

function emptyStructured(): StructuredCV {
  return { summary: '', experience: [], skills: [], education: [], certifications: [] }
}

// ─── parseCV — from PDF buffer ────────────────────────────────────────────────

export async function parseCV(buffer: Buffer): Promise<ParseResult> {
  let rawText = ''

  try {
    const data = await pdfParse(buffer)
    rawText = cleanText(data.text)
  } catch {
    return {
      rawText: '',
      structured: emptyStructured(),
      confidence: 0,
      failReason: 'Could not read this PDF. Please paste your CV text instead.',
    }
  }

  if (rawText.replace(/\s/g, '').length < 150) {
    return {
      rawText,
      structured: emptyStructured(),
      confidence: 0,
      failReason: 'This PDF appears to be image-based and could not be read. Please paste your CV text instead.',
    }
  }

  return parseText(rawText)
}

// ─── parseText — from plain text (paste fallback) ─────────────────────────────

export function parseText(text: string): ParseResult {
  const rawText = cleanText(text)
  const sections = detectSections(rawText)

  const structured: StructuredCV = {
    summary: sections.summary || '',
    // Fall back to full text if no experience section detected (catches multi-column CVs)
    experience: extractExperience(sections.experience || rawText),
    skills: extractSkills(sections.skills || ''),
    education: extractEducation(sections.education || ''),
    certifications: extractSkills(sections.certifications || ''),
  }

  const { score: confidence, reasons } = calculateConfidence(rawText, structured)

  const failReason =
    confidence < CONFIDENCE_THRESHOLD
      ? reasons[0] || 'Could not parse this CV reliably. Please paste your CV text instead.'
      : undefined

  return { rawText, structured, confidence, failReason }
}
