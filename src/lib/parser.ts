// CV Pulse — Rule-based CV parser
// Epic 2 | No LLMs. Same input = same output. Always.
//
// Parse pipeline:
//   Buffer/text → cleanText → collapseSpacedChars → detectSections → extract* → confidence gate

// pdf-parse is loaded via its internal module path to avoid the known Next.js bundling issue:
// The package's default entry (index.js) calls fs.readFileSync on a test PDF at module init,
// which throws in bundled/serverless environments. The internal path skips that entirely.
// We also mark pdf-parse as a serverExternalPackages in next.config.ts so Next.js never
// bundles it — it stays as a real require() at Node runtime.
type PdfParseResult = { text: string; numpages: number }
async function pdfParse(buffer: Buffer): Promise<PdfParseResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const parse = require('pdf-parse/lib/pdf-parse.js') as (buffer: Buffer) => Promise<PdfParseResult>
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

// A full date range: "Jan 2020 – Dec 2021" / "2019 – Present" / "2019-2022" / "Jan 2020 to Dec 2021"
// DATE_SEP: dash/en-dash/em-dash OR " to " OR " through " OR " until " (common in US CVs)
const DATE_SEP = `(?:\\s*[-–—]\\s*|\\s+to\\s+|\\s+through\\s+|\\s+until\\s+)`

// DATE_PART matches any single date value — covers:
//   "Jan 2020"   — month name + 4-digit year
//   "2020"       — bare 4-digit year
//   "2024.09"    — YYYY.MM (dot-separated, common in Asian/European CVs e.g. Aram's format)
//   "8/21"       — M/YY (US short: "8/21", "06/23")
//   "06/2021"    — M/YYYY (US long: "06/2021", "5/2024")
const DATE_PART = `(?:(?:${MONTHS_PATTERN})\\.?\\s+)?(?:(?:20|19)\\d{2}(?:\\.\\d{2})?|\\d{1,2}\\/(?:(?:20|19)\\d{2}|\\d{2}))`

export const DATE_RANGE_RE = new RegExp(
  `${DATE_PART}${DATE_SEP}(?:${DATE_PART}|present|current|now)`,
  'i'
)

// Abbreviated 2-digit year range: "Oct 24 – Dec 24" / "Apr 21 – Jul 24" / "Oct 24 to Dec 24"
// Requires full month name on both sides to avoid false positives
export const DATE_RANGE_SHORT_RE = new RegExp(
  `(?:${MONTHS_PATTERN})\\.?\\s+\\d{2}${DATE_SEP}(?:(?:${MONTHS_PATTERN})\\.?\\s+\\d{2}|present|current|now)`,
  'i'
)

// Any standalone 4-digit year in 19xx or 20xx range
export const YEAR_RE = /\b(?:19|20)\d{2}\b/g

function looksLikeDateRange(line: string): boolean {
  return DATE_RANGE_RE.test(line)
}

// Returns true for bare location lines like "London, UK" / "San Francisco, CA" / "Hammersmith, London"
// These appear between the company/title line and the date line in many UK/US templates
function looksLikeLocation(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length > 50) return false
  // "City, Region" where region is a word or 2-letter state code — no digits, no bullet chars
  // \s*$ allows for any stray trailing whitespace not caught by trim() (Unicode spaces, etc.)
  if (!/^[A-Za-z][A-Za-z\s\-]+,\s*[A-Za-z]{2,}\s*$/.test(trimmed)) return false
  if (/\d/.test(trimmed)) return false
  // Guard: do NOT classify as location if the line contains a job-title keyword.
  // "Sales Manager, Large Enterprise" / "Account Executive, North America" look like
  // "City, Region" to the regex but are job titles with territory suffixes — not locations.
  if (TITLE_KEYWORD_RE.test(trimmed)) return false
  return true
}

// Returns true for street address lines — e.g. "585 N Rossmore Avenue Apt 402, Los Angeles, CA"
// These appear as page-header artifacts in multi-page CVs and should never be used as titles/companies
function looksLikeAddress(line: string): boolean {
  // Street addresses start with a house/building number followed by a capitalised street name
  return /^\d+\s+[A-Z]/.test(line.trim())
}

// Returns true for lines that are just a lone column-separator artifact (e.g. "|" or "·")
// PDF two-column layouts often render column dividers as isolated chars on their own line
function looksLikeSeparator(line: string): boolean {
  return /^[\s|·•\-—]+$/.test(line) && line.trim().length <= 3
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

// Job title keyword detector — used to distinguish inline-title from inline-company.
// When the text inline before/after a date contains one of these words, it's almost certainly a title,
// not a company name. Enables correct parsing of "Title Date" and "Date Title" formats.
// Keep this list broad — false positives (company names with these words) are rare, and the cost of
// missing a title keyword (leaving it in the company field) is worse than an occasional over-match.
const TITLE_KEYWORD_RE = /\b(?:executive|manager|director|analyst|associate|coordinator|specialist|engineer|developer|consultant|advisor|representative|officer|president|vice\s+president|lead|head\s+of|SDR|BDR|AE|CSM|CSE|SE|VP|CTO|CFO|CMO|COO|CEO|intern|fellow|generalist|designer|architect|strategist|recruiter|writer|editor|producer|researcher|scientist|technician|operator|planner|buyer|controller|trainer|programmer|administrator|assistant|account\s+executive|account\s+manager|sales\s+development|business\s+development|customer\s+success|customer\s+support|product\s+manager|project\s+manager|program\s+manager|marketing\s+manager|operations\s+manager|growth\s+manager|revenue\s+operations|demand\s+gen|content\s+(?:manager|strategist|creator)|graphic\s+designer|web\s+designer|brand\s+designer|ux\s+designer|ui\s+designer|motion\s+designer|creative\s+director|art\s+director|copywriter|data\s+(?:analyst|engineer|scientist))\b/i

// Strip ticker annotations and trailing location noise from company name lines.
// e.g. "AvePoint (Ticker: AV P T ) Jersey City, NJ" → "AvePoint"
//      "HiBob (acquired Mosaic) New York, NY"        → "HiBob (acquired Mosaic)"
export function cleanCompanyLine(raw: string): string {
  return raw
    // Strip ticker/exchange annotations: "(Ticker: AVPT)", "(NYSE: X)", "(NASDAQ: AVPT)"
    .replace(/\s*\((?:Ticker|NYSE|NASDAQ|LSE|ASX|Symbol)\s*:?[^)]*\)/gi, '')
    // Strip trailing location noise: " New York, NY" / ", Jersey City, NJ"
    // Also handles "- New York, NY" (dash-separated company+location on same line)
    // Max TWO city words prevents over-stripping: "Brocair Partners New York, NY"
    .replace(/(?:[,\s]|-\s*)\s*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?,\s*[A-Z]{2}\s*$/, '')
    .replace(/\s+/g, ' ')
    // Strip any trailing punctuation left behind (dashes, commas, colons)
    .replace(/[\s,\-–—:]+$/, '')
    .trim()
}

export function extractExperience(text: string): ExperienceRole[] {
  if (!text.trim()) return []

  // Normalise bracket-quoted date lines: "[August '23 - Current]" → "August 23 - Current"
  // Common in some US resume templates that wrap dates in square brackets with shorthand years.
  // Note: the apostrophe in "'23" is often a Unicode right-single-quote (U+2019), not ASCII (U+0027).
  const rawLines = text.split('\n').map(l =>
    l.trim().replace(/\[([^\]]*)\]/g, (_, inner) => inner.replace(/['\u2018\u2019\u02BC]/g, ''))
  )

  // ── Merge split bullets ──────────────────────────────────────────────────
  // Some PDFs (AvePoint, GovInvest) emit each bullet in two lines:
  //   Line N:   "•"   (lone bullet char — no content)
  //   Line N+1: "Increased pipeline by 40%..."
  // Microsoft Word "o" sub-bullets also split this way.
  // We merge them so isBulletLine() fires correctly on the joined line.
  const lines: string[] = []
  const LONE_BULLET_RE = /^[•*▪▸◦→·✓➤➢●○▶£►]\s*$/
  for (let mi = 0; mi < rawLines.length; mi++) {
    const line = rawLines[mi]
    const isLoneBullet = LONE_BULLET_RE.test(line)
    const isLoneO = line === 'o'
    if ((isLoneBullet || isLoneO) && mi + 1 < rawLines.length) {
      const next = rawLines[mi + 1]
      // Only merge if next line is substantive content (not a date / another lone bullet)
      if (
        next.length >= 5 &&
        !DATE_RANGE_RE.test(next) &&
        !DATE_RANGE_SHORT_RE.test(next) &&
        !LONE_BULLET_RE.test(next) &&
        next !== 'o'
      ) {
        // For "o" sub-bullets: prefix with • so isBulletLine() recognises the merged line
        const prefix = isLoneO ? '•' : line
        lines.push(`${prefix} ${next}`)
        mi++ // consumed next line
        continue
      }
    }
    lines.push(line)
  }

  const roles: ExperienceRole[] = []

  // Primary: find lines containing full date ranges (4-digit year) or short ranges (2-digit year: "Aug 23 – Nov 24")
  let dateLineIndices: number[] = []
  lines.forEach((line, i) => {
    if (DATE_RANGE_RE.test(line) || DATE_RANGE_SHORT_RE.test(line)) dateLineIndices.push(i)
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
    const rangeMatch = dateLine.match(DATE_RANGE_RE) ?? dateLine.match(DATE_RANGE_SHORT_RE)
    if (!rangeMatch) return

    const fullRange = rangeMatch[0]
    // Split on dash/en-dash/em-dash OR word separators "to"/"through"/"until"
    const rangeParts = fullRange.split(/[-–—]|\s+to\s+|\s+through\s+|\s+until\s+/).map(s => s.trim())
    const start = rangeParts[0] || ''
    const end = parseEndDate(rangeParts[1] || '')

    // ── Determine title + company ──────────────────────────────────────────
    let title = ''
    let company = ''

    // Case A: date range inline — "Company Name   Jan 2020 – Dec 2021"
    const dateStart = dateLine.indexOf(rangeMatch[0])
    // Detect "Title | Date" inline format: raw text before the date ended with a pipe
    // e.g. "Enterprise Account Executive | Aug 2024 – Present"
    //       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ textBefore ^^^^^^^^ date
    const textBeforeRaw = dateLine.slice(0, dateStart)
    const endsWithPipe = textBeforeRaw.trimEnd().endsWith('|')
    const textBefore = textBeforeRaw.trim().replace(/[|·—,\s]+$/, '').trim()

    // Case A: text inline before the date on the same line
    // Guard: must be > 5 chars and not a partial date fragment (e.g. "11/", "Jan", "06/")
    if (textBefore.length > 5 && !/^\d{1,4}[\/\-]?$/.test(textBefore)) {
      // Detect "Title | Date" vs "Company | Date" format:
      // If prev1 already has a usable non-date/non-bullet/non-location line (a title above the date),
      // then the inline text is the COMPANY ("Company | Date" — standard structuredToRawText output).
      // If prev1 is blank, a location, a bullet, or another date, the inline text IS the TITLE.
      const prevLine = dateIdx > 0 ? lines[dateIdx - 1] : ''
      const prevHasTitle = Boolean(
        prevLine &&
        !looksLikeDateRange(prevLine) &&
        !isBulletLine(prevLine) &&
        !looksLikeLocation(prevLine) &&
        !looksLikeSeparator(prevLine) &&
        // Lines with parentheses are almost always company names (e.g. "HiBob (acquired Mosaic)",
        // "AvePoint (Ticker: AV P T ) Jersey City, NJ"), not job titles — don't treat them as a
        // title above the date even if they look non-blank.
        !prevLine.includes('(') &&
        // Lines ending in "Company - Remote", "Company - Hybrid", "Company – City" are
        // company+location lines, not job titles.
        !/\s[-–]\s*(Remote|Hybrid|On-?site|Onsite|In-?person)\s*$/i.test(prevLine)
      )
      // Three-part pipe: "Company | Title | Date" (e.g. Clarisse T — "RepeatMD | Manager, Customer Support | Feb 2024")
      // Detect by: endsWithPipe, textBefore contains ' | ', first segment is not a title keyword, second is.
      const pipeParts = textBefore.split(' | ')
      const threePartPipe =
        endsWithPipe &&
        pipeParts.length >= 2 &&
        !TITLE_KEYWORD_RE.test(pipeParts[0]) &&
        TITLE_KEYWORD_RE.test(pipeParts.slice(1).join(' | '))
      if (threePartPipe) {
        company = pipeParts[0].trim()
        title = pipeParts.slice(1).join(' | ').trim()
      } else if (endsWithPipe && !prevHasTitle) {
        // "Title | Date" — nothing useful above: inline text IS the job title.
        title = textBefore
      } else if (endsWithPipe && TITLE_KEYWORD_RE.test(textBefore)) {
        // "Title | Date" — inline text has title keywords even though prevHasTitle is true.
        // Many CVs: Company on line above, "Title | Date" below.
        // e.g. "Societe Generale\nJunior Graphic Designer | Nov 2018 – Nov 2020"
        //       ^^^ above (prevHasTitle=true)   ^^^ inline title with keyword
        title = textBefore
        // company comes from the lookback in the endsWithPipe block below
      } else if (!endsWithPipe && TITLE_KEYWORD_RE.test(textBefore)) {
        // "Title Date" inline format (no pipe) — the inline text is the title, company is above.
        // e.g. "Enterprise Account Executive Dec 2020 - Aug 2024" with company on line above.
        title = textBefore
      } else {
        company = textBefore
      }
    }

    // Case B: date at line start — "5/2024–4/2025 GIMMECREDIT, Tarrytown NY"
    //                           or "1/25–Present Enterprise Account Executive"
    // Grab the text AFTER the date match. Use TITLE_KEYWORD_RE to distinguish title vs company.
    if (!company && !title) {
      const textAfter = dateLine.slice(dateStart + rangeMatch[0].length).trim().replace(/^[|·—,\s]+/, '').trim()
      if (textAfter.length > 3 && !/^\d/.test(textAfter)) {
        if (TITLE_KEYWORD_RE.test(textAfter)) {
          // "Date Title" inline — title keyword detected in text after date
          title = textAfter
        } else {
          company = textAfter
        }
      }
    }

    const prev1 = dateIdx > 0 ? lines[dateIdx - 1] : ''
    const prev2 = dateIdx > 1 ? lines[dateIdx - 2] : ''
    const prev3 = dateIdx > 2 ? lines[dateIdx - 3] : ''

    // Skip prev1 if it is blank, a bare location, separator, or bullet from the previous role's content
    // Blank lines between headers and dates are common in templates like Alan Lee / MATRIXX
    const skip1 = !prev1.trim() || looksLikeLocation(prev1) || looksLikeSeparator(prev1) || isBulletLine(prev1)
    const effective1 = skip1 ? prev2 : prev1

    // skip2: also skip location lines one level further back
    // 4-line header pattern: Company → Location → Title → Date (e.g. MongoDB)
    // When rawEffective2 is a location, effective2 steps over it to find the real company
    const rawEffective2 = skip1 ? prev3 : prev2
    // Also skip street address lines — page-header artifacts in multi-page CVs
    const skip2 = looksLikeLocation(rawEffective2) || looksLikeAddress(rawEffective2)
    const effective2 = skip2
      ? (skip1 ? (dateIdx >= 4 ? lines[dateIdx - 4] : '') : prev3)
      : rawEffective2

    if (endsWithPipe) {
      if (title && !company) {
        // "Title | Date" — title already set from inline text, company not yet known.
        // Get company from the nearest usable prev line (skip location/bullet/date/other-date-lines).
        // (When threePartPipe already set company above, skip this block.)
        // Extended lookback (up to 12 lines) handles "multiple roles under one company header":
        //   AvePoint                          ← company (6+ lines back)
        //   Enterprise AE | Dec 2020 – Aug 2024  ← date line — skip, don't stop
        //   • bullets                         ← skip
        //   Enterprise AE | Jan 2020 – Dec 2020  ← current line
        // Stop at section headers (all-caps words: EXPERIENCE, EDUCATION, etc.)
        let companyLine = ''
        for (let back = 1; back <= 12; back++) {
          const ln = (dateIdx - back) >= 0 ? lines[dateIdx - back] : ''
          if (!ln.trim()) continue
          if (/^[A-Z][A-Z\s&\/\-]{3,}$/.test(ln.trim())) break  // section header → stop
          if (looksLikeSeparator(ln) || isBulletLine(ln)) continue
          if (looksLikeLocation(ln)) continue
          if (looksLikeDateRange(ln)) continue  // skip date-range lines (same-company continuation)
          companyLine = ln
          break
        }
        if (companyLine) company = cleanCompanyLine(companyLine)
      } else if (company && !title) {
        // "Company | Date" — company set from inline text, title not yet known.
        // Get title from prev1 (the line above, e.g. "Senior SDR").
        // (When threePartPipe already set both company and title, skip this block.)
        if (prev1 && !looksLikeDateRange(prev1) && !looksLikeLocation(prev1) && !looksLikeSeparator(prev1) && !isBulletLine(prev1)) {
          title = prev1
        }
      }
    } else if (title && !company) {
      // "Title Date" inline format — title was set from inline text, company needs to come from above.
      // First: look for a clean non-location, non-bullet line (simple company name like "GovInvest").
      // Second: if not found, check if prev1 is a combined "Company City, State" line and clean it.
      const strictCompany = [prev1, prev2, prev3].find(
        l => l &&
          /^[A-Z]/.test(l) &&            // company names start uppercase; skip bullet continuations
          !looksLikeDateRange(l) &&
          !isBulletLine(l) &&
          !looksLikeLocation(l) &&
          !looksLikeSeparator(l) &&
          !TITLE_KEYWORD_RE.test(l)       // skip another role's title line
      )
      if (strictCompany) {
        company = cleanCompanyLine(strictCompany)
      } else if (prev1 && looksLikeLocation(prev1) && prev1.trim().length > 15) {
        // "Company City, State" on one line — extract the company portion
        const cleaned = cleanCompanyLine(prev1)
        if (cleaned && cleaned.length > 3 && !looksLikeLocation(cleaned)) company = cleaned
      }
    } else if (!company) {
      // No inline company — look for title + company

      // FORWARD-LOOK FIRST when the date sits on its own line (nothing inline before or after).
      // Date-first format: DATE\nCOMPANY - TITLE\n● bullets  (e.g. Aaron Sheppard style)
      // We prefer forward over backward here because the line above is often a bullet continuation
      // from the previous role's content, not a job title.
      if (textBefore.length === 0) {
        for (let offset = 1; offset <= 2; offset++) {
          const nextLine = lines[dateIdx + offset]?.trim() ?? ''
          if (!nextLine) continue
          if (isBulletLine(nextLine) || looksLikeDateRange(nextLine)) break
          // Guard: skip lines that look like job titles — they belong to the NEXT role's header,
          // not this role's company. e.g. Wolfson: date line, then next role title below.
          if (TITLE_KEYWORD_RE.test(nextLine) && !/ - /.test(nextLine)) break
          // "Company, Location - Title" pattern
          if (/ - /.test(nextLine) && !nextLine.startsWith('-')) {
            const dashIdx = nextLine.lastIndexOf(' - ')
            const companyPart = nextLine.slice(0, dashIdx).trim()
            const titlePart = nextLine.slice(dashIdx + 3).trim()
            // Strip location suffix: "Novisto, Remote" → "Novisto"
            company = companyPart.includes(',') ? companyPart.split(',')[0].trim() : companyPart
            title = titlePart
          } else {
            company = nextLine
          }
          break
        }
      }

      // BACKWARD LOOK — runs when forward found nothing, or date had inline text (textBefore non-empty)
      if (!company && !title) {
        if (effective1 && !isBulletLine(effective1) && (effective1.includes('|') || effective1.includes('·'))) {
          // "Title | Company" or "Title · Company" — reliable delimiters only
          // Comma is intentionally excluded: too many false positives with "City, State/Country" location strings
          const sep = effective1.includes('|') ? '|' : '·'
          const parts = effective1.split(sep).map(s => s.trim())
          title = parts[0] || ''
          company = parts[1] || ''
        } else if (
          effective1 && effective2 &&
          !isBulletLine(effective1) && !isBulletLine(effective2) &&
          !looksLikeDateRange(effective2) && !looksLikeDateRange(effective1)
        ) {
          if (skip2) {
            // 4-line header: Company → Location → Title → Date
            // effective1 = title (line directly above location), effective2 = company (above location)
            title = effective1
            company = cleanCompanyLine(effective2)
          } else {
            // Two-line header — could be UK format (Title above, Company below date)
            // or US format (Company above, Title below date).
            // Use TITLE_KEYWORD_RE to detect which line is the job title.
            // e.g. "Salesforce\nEnterprise Account Executive\nDate" → e1 has keywords → e1=title, e2=company
            //      "Account Executive\nSalesforce\nDate" → e2 has keywords → e2=title, e1=company
            const e1HasTitle = TITLE_KEYWORD_RE.test(effective1)
            const e2HasTitle = TITLE_KEYWORD_RE.test(effective2)
            if (e1HasTitle && !e2HasTitle) {
              // US format — Company (effective2) above, Title (effective1) below
              title = effective1
              company = cleanCompanyLine(effective2)
            } else if (e2HasTitle && !e1HasTitle) {
              // UK format — Title (effective2) above, Company (effective1) below
              title = effective2
              company = effective1
            } else {
              // Ambiguous (neither or both have title keywords).
              // Fall back to UK format (original behaviour) to minimise test regressions
              // while we gather more signal.
              title = effective2
              company = effective1
            }
          }
        } else if (effective1 && !isBulletLine(effective1) && !looksLikeDateRange(effective1)) {
          title = effective1
        }
      }
    } else if (!title) {
      // Company was set from inline text (non-pipe format) — get title from line above
      if (prev1 && !looksLikeDateRange(prev1) && !looksLikeLocation(prev1) && !looksLikeSeparator(prev1) && !isBulletLine(prev1)) {
        title = prev1
      }
    }

    // ── Company recovery: short-range + extended lookback ────────────────
    // Pass 1 (short): rawEffective2 was classified as a location but may be "Company- City, ST".
    // e.g. "Slack - New York, NY" → cleanCompanyLine → "Slack". Only fires when skip2=true and
    // rawEffective2 is non-empty (i.e., the immediate 2–3 line window had a location-like line).
    if (!company && skip2 && rawEffective2.trim()) {
      const recovered = cleanCompanyLine(rawEffective2)
      if (recovered && recovered.length > 1 && !looksLikeLocation(recovered) && !TITLE_KEYWORD_RE.test(recovered)) {
        company = recovered
      }
    }

    // Pass 2 (extended lookback): company is still empty — happens when:
    //   (a) A blank line sits between the company header and the role title (company is 3+ lines up)
    //   (b) Multiple roles share one company block: company header is many lines back, past
    //       the previous role's bullets + date line (same-company continuation pattern).
    // Walk back up to 15 lines from the date, skipping blank lines, bullets, date ranges,
    // known title-keyword lines, and separator lines. Stop at section headers (ALL CAPS).
    // Apply cleanCompanyLine to each candidate — handles "Company- City, ST" patterns too.
    if (!company && title) {
      for (let back = 1; back <= 15; back++) {
        const idx = dateIdx - back
        if (idx < 0) break
        const ln = lines[idx].trim()
        if (!ln) continue
        if (isBulletLine(ln)) continue
        if (looksLikeSeparator(ln)) continue
        if (looksLikeDateRange(ln)) continue  // previous role's date — keep looking past it
        if (!/^[A-Z]/.test(ln)) continue  // company names always start uppercase; skip bullet continuations
        if (TITLE_KEYWORD_RE.test(ln) && !/ - /.test(ln)) continue  // another role's title line
        if (/^[A-Z][A-Z\s&/\-]{3,}$/.test(ln)) break  // section header (e.g. EXPERIENCE) → stop
        const candidate = cleanCompanyLine(ln)
        if (candidate && candidate.length > 1 && !looksLikeLocation(candidate) && !TITLE_KEYWORD_RE.test(candidate)) {
          company = candidate
          break
        }
      }
    }

    // ── Extract bullets with continuation merging ─────────────────────────
    // PDFs often wrap long bullet lines across two lines. We merge continuation lines
    // (lines that belong to the previous bullet) rather than discarding them.
    const nextDateIdx = dateLineIndices[position + 1] ?? lines.length
    const bulletSection = lines.slice(dateIdx + 1, nextDateIdx)
    const bullets: string[] = []
    let currentBullet = ''
    for (const bLine of bulletSection) {
      const trimmedB = bLine.trim()
      if (!trimmedB) {
        // Blank line — end current bullet; don't merge across blank lines
        if (currentBullet) { bullets.push(currentBullet); currentBullet = '' }
        continue
      }
      if (looksLikeDateRange(bLine) || looksLikeLocation(bLine)) {
        if (currentBullet) { bullets.push(currentBullet); currentBullet = '' }
        continue
      }
      if (isBulletLine(bLine)) {
        if (currentBullet) bullets.push(currentBullet)
        currentBullet = bLine.replace(new RegExp(`^[${BULLET_CHARS}\\d.)]+\\s*`), '').trim()
      } else if (currentBullet) {
        // Potential continuation — merge if it looks like wrapped text from the previous bullet.
        // Safe signals: starts lowercase (e.g. "the USA", "develop strategy"), starts with (/$,
        // or previous bullet ended mid-word/mid-sentence (no terminal punctuation)
        const startsLikeContinuation = /^[a-z($\d]/.test(trimmedB)
        const prevEndsIncomplete = /[a-zA-Z\d]$/.test(currentBullet)
        // Hard block: lines with parentheses NOT at the start are almost always company name lines
        // e.g. "AvePoint (Ticker: AV P T ) Jersey City, NJ" — never treat as continuation
        const isCompanyLike = trimmedB.includes('(') && !trimmedB.startsWith('(')
        if (!isCompanyLike && (startsLikeContinuation || prevEndsIncomplete)) {
          currentBullet += ' ' + trimmedB
        } else {
          // Looks like a company name or section header — end bullet, discard this line as a bullet
          bullets.push(currentBullet)
          currentBullet = ''
        }
      }
    }
    if (currentBullet) bullets.push(currentBullet)

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

// ─── Non-CV hard-reject patterns ─────────────────────────────────────────────
// Phrases that only appear in financial/administrative documents, never in CVs.
// Any single match caps confidence at 15 (well below the 40 threshold).
const NON_CV_HARD_REJECT = [
  /\bbank\s+statement\b/i,
  /\baccount\s+statement\b/i,
  /\bsort\s+code\b/i,
  /\bvat\s+reg(?:istration)?\s*(?:no|number|#)?\b/i,
  /\binvoice\s*(?:no|number|#)\b/i,
  /\bamount\s+due\b/i,
  /\btotal\s+(?:amount\s+)?due\b/i,
  /\bremittance\s+advice\b/i,
  /\bbacs\s+payment\b/i,
  /\bearnings\s+statement\b/i,
  /\bpay\s*slip\b/i,
  /\b(?:p60|p45|p11d)\b/i,
  /\baccount\s+(?:no|number)\s*:?\s*\d{6,}/i,
  /\biban\s*:?\s*[A-Z]{2}\d{2}/i,
]

// Soft financial signals — if several co-occur the document is almost certainly
// a financial record, not a CV.
const NON_CV_SOFT_SIGNALS = [
  /\bbalance\b/i,
  /\bdebit\b/i,
  /\bcredit\b/i,
  /\btransaction(?:s)?\b/i,
  /\bstatement\s+(?:date|period)\b/i,
  /\bopening\s+balance\b/i,
  /\bclosing\s+balance\b/i,
  /\bpayment\s+reference\b/i,
  /\boverdrawn?\b/i,
]

export function calculateConfidence(text: string, structured: StructuredCV): ConfidenceResult {
  const reasons: string[] = []
  let score = 0

  // ── Pre-check: hard-reject non-CV documents ───────────────────────────────
  // Financial documents (bank statements, invoices, payslips) can accidentally
  // pass the confidence gate because they have text volume, a name, dates, and
  // structured lines.  Catch them before any positive scoring.
  for (const pattern of NON_CV_HARD_REJECT) {
    if (pattern.test(text)) {
      return {
        score: 0,
        reasons: [`Document rejected: contains non-CV phrase matching ${pattern.source}`],
      }
    }
  }

  // Soft-signal check: 4+ financial signals → almost certainly a financial doc
  const softHits = NON_CV_SOFT_SIGNALS.filter(p => p.test(text)).length
  if (softHits >= 4) {
    return {
      score: 10,
      reasons: [`Document rejected: ${softHits} financial signals detected (balance, debit, credit, transactions, etc.) — likely a bank statement or financial record`],
    }
  }

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
  } catch (err: unknown) {
    // pdfjs throws a PasswordException (name = 'PasswordException') for encrypted PDFs
    const isPasswordProtected =
      err instanceof Error && (err as Error & { name?: string }).name === 'PasswordException'
    return {
      rawText: '',
      structured: emptyStructured(),
      confidence: 0,
      failReason: isPasswordProtected
        ? 'This PDF is password-protected — remove the password and re-upload.'
        : 'This PDF could not be read — it may be corrupted or password-protected.',
    }
  }

  if (rawText.replace(/\s/g, '').length < 150) {
    return {
      rawText,
      structured: emptyStructured(),
      confidence: 0,
      failReason: 'This PDF appears to be image-based (scanned) — no text could be extracted.',
    }
  }

  return parseText(rawText)
}

// ─── parseText — from plain text (paste fallback) ─────────────────────────────

export function parseText(text: string): ParseResult {
  const rawText = cleanText(text)
  const sections = detectSections(rawText)

  // Use section content only if it's substantial (> 100 chars).
  // A tiny stub (e.g. just a LinkedIn URL or heading) means section detection misfired — fall back to full text.
  const expSection = (sections.experience?.length ?? 0) > 100 ? sections.experience! : rawText

  // 2-pass experience extraction: try the detected section first.
  // If it yields 0 roles (e.g. section label appears at the bottom of the content in column-layout PDFs,
  // so detectSections returns only a skills list after the label), fall back to the full raw text.
  // extractExperience only picks up lines containing date ranges, so false positives are rare.
  let experienceRoles = extractExperience(expSection)
  if (experienceRoles.length === 0 && expSection !== rawText) {
    experienceRoles = extractExperience(rawText)
  }

  const structured: StructuredCV = {
    summary: sections.summary || '',
    experience: experienceRoles,
    skills: extractSkills(sections.skills || ''),
    education: extractEducation(sections.education || ''),
    certifications: extractSkills(sections.certifications || ''),
  }

  const { score: confidence, reasons } = calculateConfidence(rawText, structured)

  const failReason =
    confidence < CONFIDENCE_THRESHOLD
      ? reasons[0] || 'Could not parse this document as a CV — check it is a standard CV format.'
      : undefined

  return { rawText, structured, confidence, failReason }
}
