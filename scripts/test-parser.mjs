// CV Pulse — Parser test script
// Run: node scripts/test-parser.mjs
// Tests the parser against real CVs in ~/Downloads

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdf = require('pdf-parse')

// ─── Inline parser (mirrors src/lib/parser.ts — no TS compilation needed) ────

function cleanText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim()
}

const SECTION_PATTERNS = {
  summary: /^(summary|profile|professional\s+summary|career\s+summary|about\s+me|executive\s+summary|personal\s+statement|career\s+objective|objective|about)[\s:]*$/im,
  experience: /^(experience|work\s+experience|employment\s+history|professional\s+experience|work\s+history|career\s+history|relevant\s+experience|employment)[\s:]*$/im,
  education: /^(education|academic\s+background|qualifications|academic\s+history|educational\s+background|academic\s+qualifications)[\s:]*$/im,
  skills: /^(skills|technical\s+skills|core\s+skills|key\s+skills|competencies|areas\s+of\s+expertise|expertise|core\s+competencies|tools?\s+&\s+technologies|technologies)[\s:]*$/im,
  certifications: /^(certifications?|certificates?|credentials?|licen[sc]es?|professional\s+development|courses?|training)[\s:]*$/im,
}

function detectSections(text) {
  const lines = text.split('\n')
  const sectionStarts = []
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > 60) return
    for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
      if (pattern.test(trimmed)) { sectionStarts.push({ section, lineIndex: i }); break }
    }
  })
  const sections = {}
  sectionStarts.forEach(({ section, lineIndex }, idx) => {
    const next = sectionStarts[idx + 1]?.lineIndex ?? lines.length
    sections[section] = lines.slice(lineIndex + 1, next).join('\n').trim()
  })
  return sections
}

const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?'
const DATE_RANGE_RE = new RegExp(
  `(?:(?:${MONTHS})\\.?\\s+)?(?:20|19)\\d{2}\\s*[-–—]\\s*(?:(?:(?:${MONTHS})\\.?\\s+)?(?:20|19)\\d{2}|present|current|now)`,
  'i'
)
const BULLET_START = /^[\s]*[•\-\*▪▸◦→·✓➤➢●○▶]\s+.{10,}/

function extractExperience(text) {
  if (!text?.trim()) return []
  const lines = text.split('\n').map(l => l.trim())
  const dateIndices = lines.reduce((acc, l, i) => { if (DATE_RANGE_RE.test(l)) acc.push(i); return acc }, [])
  if (dateIndices.length === 0) return []

  return dateIndices.map((dateIdx, pos) => {
    const dateLine = lines[dateIdx]
    const match = dateLine.match(DATE_RANGE_RE)
    const parts = match ? match[0].split(/[-–—]/).map(s => s.trim()) : ['', '']
    const start = parts[0] || ''
    const endRaw = parts[1] || ''
    const end = /present|current|now/i.test(endRaw) ? null : endRaw

    let title = '', company = ''
    const dateStart = dateLine.indexOf(match?.[0] || '')
    const textBefore = dateLine.slice(0, dateStart).trim().replace(/[|·—,]+$/, '').trim()
    if (textBefore.length > 2) company = textBefore

    const prev1 = dateIdx > 0 ? lines[dateIdx - 1] : ''
    const prev2 = dateIdx > 1 ? lines[dateIdx - 2] : ''

    if (!company) {
      if (prev1?.includes('|') || prev1?.includes('·')) {
        const sep = prev1.includes('|') ? '|' : '·'
        const p = prev1.split(sep).map(s => s.trim())
        title = p[0]; company = p[1] || ''
      } else if (prev1 && prev2 && !DATE_RANGE_RE.test(prev2) && !DATE_RANGE_RE.test(prev1)) {
        title = prev2; company = prev1
      } else if (prev1 && !DATE_RANGE_RE.test(prev1)) {
        title = prev1
      }
    } else if (prev1 && !DATE_RANGE_RE.test(prev1)) {
      title = prev1
    }

    const nextIdx = dateIndices[pos + 1] ?? lines.length
    const bullets = lines.slice(dateIdx + 1, nextIdx)
      .filter(l => BULLET_START.test(l))
      .map(l => l.replace(/^[•\-\*▪▸◦→·✓➤➢●○▶]+\s*/, '').trim())
      .filter(Boolean)

    return { company, title, start, end, bullets }
  }).filter(r => r.title || r.company)
}

function hasNameLikeHeader(text) {
  const first = text.split('\n').slice(0, 6).map(l => l.trim()).filter(Boolean)[0] || ''
  return first.length > 3 && first.length < 45 && !/\d/.test(first) && /^[A-Z]/.test(first) && first.split(/\s+/).length >= 2 && first.split(/\s+/).length <= 5
}

function calculateConfidence(text, structured) {
  let score = 0
  const notes = []

  if (hasNameLikeHeader(text)) { score += 20 } else { notes.push('No name header') }
  if (structured.experience.length >= 2) { score += 20 } else if (structured.experience.length === 1) { score += 10; notes.push('1 role only') } else { notes.push('No roles') }

  const dateRanges = text.match(new RegExp(DATE_RANGE_RE.source, 'gi')) || []
  if (dateRanges.length >= 3) { score += 20 } else if (dateRanges.length >= 1) { score += 10; notes.push(`${dateRanges.length} date(s)`) } else { notes.push('No dates') }

  const bullets = text.split('\n').filter(l => BULLET_START.test(l))
  if (bullets.length >= 3) { score += 20 } else if (bullets.length >= 1) { score += 10; notes.push('Few bullets') } else { notes.push('No bullets') }

  const chars = text.replace(/\s/g, '').length
  if (chars >= 800) { score += 20 } else if (chars >= 300) { score += 10; notes.push('Short text') } else { notes.push('Very short') }

  return { score, notes }
}

// ─── Run tests ────────────────────────────────────────────────────────────────

const DOWNLOADS = join(homedir(), 'Downloads')
const THRESHOLD = 40

const files = readdirSync(DOWNLOADS)
  .filter(f => f.endsWith('.pdf') && !f.startsWith('.'))
  .slice(0, 15) // test first 15

let passed = 0, failed = 0, errored = 0

console.log(`\nCV Pulse Parser Test — ${files.length} CVs\n${'─'.repeat(70)}`)

for (const filename of files) {
  const path = join(DOWNLOADS, filename)
  try {
    const buffer = readFileSync(path)
    const data = await pdf(buffer)
    const rawText = cleanText(data.text)

    const sections = detectSections(rawText)
    const experience = extractExperience(sections.experience || rawText)
    const structured = { experience }

    const { score, notes } = calculateConfidence(rawText, structured)
    const pass = score >= THRESHOLD
    if (pass) passed++; else failed++

    const flag = pass ? '✅' : '❌'
    const shortName = filename.slice(0, 45).padEnd(45)
    const chars = rawText.replace(/\s/g, '').length
    console.log(`${flag} ${shortName} | conf:${String(score).padStart(3)} | roles:${experience.length} | chars:${String(chars).padStart(5)}${notes.length ? ' | ' + notes.join(', ') : ''}`)
  } catch (err) {
    errored++
    console.log(`💥 ${filename.slice(0, 45).padEnd(45)} | ERROR: ${err.message.slice(0, 50)}`)
  }
}

console.log(`\n${'─'.repeat(70)}`)
console.log(`Results: ${passed} passed | ${failed} confidence gate | ${errored} parse errors`)
console.log(`Threshold: ${THRESHOLD}/100\n`)
