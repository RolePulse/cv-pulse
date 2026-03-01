// CV Pulse — Rule-based CV parser
// Epic 2 | No LLMs. Same input = same output. Always.
//
// Parse pipeline:
//   Buffer/text → cleanText → detectSections → extract* → confidence gate

// pdf-parse is lazy-loaded to avoid its test file read at module init
// (a known issue with pdf-parse and Next.js bundlers)
type PdfParseResult = { text: string; numpages: number }
async function pdfParse(buffer: Buffer): Promise<PdfParseResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const parse = require('pdf-parse') as (buffer: Buffer) => Promise<PdfParseResult>
  return parse(buffer)
}
import type { StructuredCV, ExperienceRole, EducationEntry } from '@/types/database'

// ─── Text cleaning ────────────────────────────────────────────────────────────

export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ') // zero-width + non-breaking spaces
    .replace(/\n{3,}/g, '\n\n')                    // max 2 blank lines
    .replace(/ {2,}/g, ' ')                        // collapse multiple spaces
    .trim()
}

// ─── Section detection ────────────────────────────────────────────────────────

const SECTION_PATTERNS: Record<string, RegExp> = {
  summary: /^(summary|profile|professional\s+summary|career\s+summary|about\s+me|executive\s+summary|personal\s+statement|career\s+objective|objective|about)[\s:]*$/im,
  experience: /^(experience|work\s+experience|employment\s+history|professional\s+experience|work\s+history|career\s+history|relevant\s+experience|employment)[\s:]*$/im,
  education: /^(education|academic\s+background|qualifications|academic\s+history|educational\s+background|academic\s+qualifications)[\s:]*$/im,
  skills: /^(skills|technical\s+skills|core\s+skills|key\s+skills|competencies|areas\s+of\s+expertise|expertise|core\s+competencies|tools?\s+&\s+technologies|technologies)[\s:]*$/im,
  certifications: /^(certifications?|certificates?|credentials?|licen[sc]es?|professional\s+development|courses?|training)[\s:]*$/im,
}

export function detectSections(text: string): Record<string, string> {
  const lines = text.split('\n')
  const sectionStarts: Array<{ section: string; lineIndex: number }> = []

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    // Section headings are short (< 60 chars), non-empty
    if (!trimmed || trimmed.length > 60) return
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

  // No explicit summary section — grab first paragraph after contact block
  if (!sections.summary && sectionStarts.length > 0) {
    const firstSectionLine = sectionStarts[0].lineIndex
    const preambleLines = lines
      .slice(0, firstSectionLine)
      .map(l => l.trim())
      .filter(Boolean)
    // Skip first 4 lines (name + contact info) and look for a paragraph
    const bodyLines = preambleLines.slice(4)
    if (bodyLines.length > 0) {
      sections.summary = bodyLines.join(' ').trim()
    }
  }

  return sections
}

// ─── Date utilities ───────────────────────────────────────────────────────────

const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?'

// Matches a single date: "Jan 2020", "2020", "01/2020"
export const DATE_TOKEN_RE = new RegExp(
  `(?:(?:${MONTHS})\\.?\\s+)?(?:20|19)\\d{2}|(?:0[1-9]|1[0-2])\\/(?:20|19)?\\d{2}`,
  'i'
)

// Matches a full date range: "Jan 2020 – Dec 2021" or "2019 – Present"
export const DATE_RANGE_RE = new RegExp(
  `(?:(?:${MONTHS})\\.?\\s+)?(?:20|19)\\d{2}\\s*[-–—]\\s*(?:(?:(?:${MONTHS})\\.?\\s+)?(?:20|19)\\d{2}|present|current|now)`,
  'i'
)

function looksLikeDateRange(line: string): boolean {
  return DATE_RANGE_RE.test(line)
}

function parseEndDate(raw: string): string | null {
  return /present|current|now/i.test(raw) ? null : raw.trim()
}

// ─── Bullet extraction ────────────────────────────────────────────────────────

const BULLET_START = /^[\s]*[•\-\*▪▸◦→·✓➤➢●○▶]\s+.{10,}/
const NUMBERED_BULLET = /^\s*\d+[.)]\s+.{10,}/

export function extractBullets(text: string): string[] {
  return text
    .split('\n')
    .filter(l => BULLET_START.test(l) || NUMBERED_BULLET.test(l))
    .map(l => l.replace(/^[\s•\-\*▪▸◦→·✓➤➢●○▶\d.)]+\s*/, '').trim())
    .filter(Boolean)
}

// ─── Experience extraction ────────────────────────────────────────────────────
//
// Strategy: anchor on date ranges (most reliable signal in any CV).
// For each date anchor, look backwards for title/company lines,
// and forwards for bullet points.

export function extractExperience(text: string): ExperienceRole[] {
  if (!text.trim()) return []

  const lines = text.split('\n').map(l => l.trim())
  const roles: ExperienceRole[] = []

  // Find all lines containing date ranges
  const dateLineIndices: number[] = []
  lines.forEach((line, i) => {
    if (DATE_RANGE_RE.test(line)) dateLineIndices.push(i)
  })

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

    // Case A: date range is inline — "Company Name   Jan 2020 – Dec 2021"
    const dateStart = dateLine.indexOf(rangeMatch[0])
    const textBefore = dateLine.slice(0, dateStart).trim().replace(/[|·—,]+$/, '').trim()
    if (textBefore.length > 2) {
      // Text before the date on same line is probably company or title
      company = textBefore
    }

    const prev1 = dateIdx > 0 ? lines[dateIdx - 1] : ''
    const prev2 = dateIdx > 1 ? lines[dateIdx - 2] : ''

    if (!company) {
      // Case B: "Title | Company" or "Title · Company" on one line above
      if (prev1 && (prev1.includes('|') || prev1.includes('·'))) {
        const sep = prev1.includes('|') ? '|' : '·'
        const parts = prev1.split(sep).map(s => s.trim())
        title = parts[0] || ''
        company = parts[1] || ''
      }
      // Case C: two separate lines (title above, company above that)
      else if (prev1 && prev2 && !looksLikeDateRange(prev2) && !looksLikeDateRange(prev1)) {
        title = prev2
        company = prev1
      }
      // Case D: one line above
      else if (prev1 && !looksLikeDateRange(prev1)) {
        title = prev1
      }
    } else {
      // Company came from inline — title is likely the line above
      if (prev1 && !looksLikeDateRange(prev1)) title = prev1
    }

    // ── Extract bullets (lines after date up to next date) ─────────────────
    const nextDateIdx = dateLineIndices[position + 1] ?? lines.length
    const bulletCandidates = lines.slice(dateIdx + 1, nextDateIdx)
    const bullets = bulletCandidates
      .filter(l => BULLET_START.test(l) || NUMBERED_BULLET.test(l))
      .map(l => l.replace(/^[•\-\*▪▸◦→·✓➤➢●○▶\d.)]+\s*/, '').trim())
      .filter(Boolean)

    if (title || company) {
      roles.push({ company, title, start, end, bullets })
    }
  })

  // Deduplicate adjacent identical roles (can happen with duplicated lines)
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
    .map(s => s.replace(/^[-\*\s▪▸◦→]+/, '').trim())
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

    let institution = ''
    let qualification = ''

    // "Degree at University" or "Degree | University"
    if (/\s+at\s+|\|/.test(line)) {
      const parts = line.split(/\s+at\s+|\|/).map(s => s.replace(/\b(?:19|20)\d{2}\b[-–]?(?:\d{4})?/, '').trim())
      qualification = parts[0] || ''
      institution = parts[1] || ''
    } else {
      qualification = line.replace(/\b(?:19|20)\d{2}\b[-–]?(?:\d{4})?/g, '').trim()
      const nextLine = lines[i + 1] || ''
      // If next line doesn't look like a date-range line, treat as institution
      if (nextLine && !DATE_RANGE_RE.test(nextLine) && !DATE_TOKEN_RE.test(nextLine.slice(0, 8))) {
        institution = nextLine.replace(/\b(?:19|20)\d{2}\b/g, '').trim()
        i++ // consume
      }
    }

    if (qualification || institution) {
      entries.push({ institution, qualification, year })
    }
    i++
  }

  return entries.slice(0, 6)
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

export interface ConfidenceResult {
  score: number   // 0–100
  reasons: string[]
}

export function hasNameLikeHeader(text: string): boolean {
  const firstLines = text.split('\n').slice(0, 6).map(l => l.trim()).filter(Boolean)
  if (firstLines.length === 0) return false
  const first = firstLines[0]
  // Looks like a name: 2–4 words, title/upper case, no digits, < 45 chars
  return (
    first.length > 3 &&
    first.length < 45 &&
    !/\d/.test(first) &&
    /^[A-Z]/.test(first) &&
    first.split(/\s+/).length >= 2 &&
    first.split(/\s+/).length <= 5
  )
}

export function calculateConfidence(text: string, structured: StructuredCV): ConfidenceResult {
  const reasons: string[] = []
  let score = 0

  // 1. Name-like header (20 pts)
  if (hasNameLikeHeader(text)) {
    score += 20
  } else {
    reasons.push('No recognisable name found at the top of the document')
  }

  // 2. 2+ experience roles detected (20 pts)
  if (structured.experience.length >= 2) {
    score += 20
  } else if (structured.experience.length === 1) {
    score += 10
    reasons.push('Only 1 work experience role was detected')
  } else {
    reasons.push('No work experience roles were detected')
  }

  // 3. 3+ date ranges detected (20 pts)
  const dateRanges = text.match(new RegExp(DATE_RANGE_RE.source, 'gi')) || []
  if (dateRanges.length >= 3) {
    score += 20
  } else if (dateRanges.length >= 1) {
    score += 10
    reasons.push(`Only ${dateRanges.length} date range(s) found — document may be image-based`)
  } else {
    reasons.push('No date ranges found — document is likely image-based or heavily formatted')
  }

  // 4. Bullet points present (20 pts)
  const bulletLines = text.split('\n').filter(l => BULLET_START.test(l) || NUMBERED_BULLET.test(l))
  if (bulletLines.length >= 3) {
    score += 20
  } else if (bulletLines.length >= 1) {
    score += 10
    reasons.push('Very few bullet points detected')
  } else {
    reasons.push('No bullet points found — CV may use paragraph format instead')
  }

  // 5. Minimum character count (20 pts)
  const charCount = text.replace(/\s/g, '').length
  if (charCount >= 800) {
    score += 20
  } else if (charCount >= 300) {
    score += 10
    reasons.push('CV text is very short — some content may not have extracted')
  } else {
    reasons.push('Extracted text is too short — PDF is likely image-based')
  }

  return { score, reasons }
}

// ─── Main parse output type ───────────────────────────────────────────────────

export interface ParseResult {
  rawText: string
  structured: StructuredCV
  confidence: number   // 0–100
  failReason?: string  // set when confidence < CONFIDENCE_THRESHOLD
}

export const CONFIDENCE_THRESHOLD = 40  // Generous. Err on the side of allowing.

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
    experience: extractExperience(sections.experience || rawText), // fallback to full text if no section found
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
