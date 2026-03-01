// CV Pulse — Parser diagnostic test v2 (improved parser)
// Run: node scripts/test-parser-v2.mjs [count]

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdf = require('pdf-parse')

// ─── Improved parser (mirrors src/lib/parser.ts) ──────────────────────────────

function collapseSpacedChars(line) {
  const trimmed = line.trim()
  if (/^[A-Z0-9]([ ]{1,3}[A-Z0-9]){3,}/.test(trimmed)) {
    return trimmed
      .replace(/([A-Z0-9]) ([A-Z0-9])/g, '$1$2')
      .replace(/([A-Z0-9])  +([A-Z0-9])/g, '$1 $2')
      .replace(/ +/g, ' ')
      .trim()
  }
  return line
}

function cleanText(raw) {
  const lines = raw
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .split('\n').map(collapseSpacedChars)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim()
}

const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?'
const DATE_RANGE_RE = new RegExp(
  `(?:(?:${MONTHS})\\.?\\s+)?(?:20|19)\\d{2}\\s*[-–—]\\s*(?:(?:(?:${MONTHS})\\.?\\s+)?(?:20|19)\\d{2}|present|current|now)`,
  'i'
)
const DATE_RANGE_SHORT_RE = new RegExp(
  `(?:${MONTHS})\\.?\\s+\\d{2}\\s*[-–—]\\s*(?:(?:${MONTHS})\\.?\\s+\\d{2}|present|current|now)`,
  'i'
)
const YEAR_RE = /\b(?:19|20)\d{2}\b/g
const BULLET_CHARS = '•\\-\\*▪▸◦→·✓➤➢●○▶£►–—'
const BULLET_LINE_RE = new RegExp(`^[\\s]*[${BULLET_CHARS}]\\s*.{10,}`)

function isBullet(line) {
  return BULLET_LINE_RE.test(line) || /^\s*\d+[.)]\s+.{10,}/.test(line)
}

const SECTION_PATTERNS = {
  summary: /^(summary|profile|professional\s+summary|career\s+summary|about\s+me|executive\s+summary|personal\s+statement|career\s+objective|objective|about)[\s:]*$/im,
  experience: /^(experience|work\s+experience|employment\s+history|professional\s+experience|work\s+history|career\s+history|relevant\s+experience|employment|positions?\s+held)[\s:]*$/im,
  education: /^(education|academic\s+background|qualifications|academic\s+history|educational\s+background|academic\s+qualifications|education\s+&?\s*training)[\s:]*$/im,
  skills: /^(skills|technical\s+skills|core\s+skills|key\s+skills|competencies|areas\s+of\s+expertise|expertise|core\s+competencies|tools?\s+&\s+technologies|technologies|technical\s+proficiencies?)[\s:]*$/im,
}

function detectSections(text) {
  const lines = text.split('\n')
  const starts = []
  lines.forEach((line, i) => {
    const t = line.trim()
    if (!t || t.length > 70) return
    for (const [s, p] of Object.entries(SECTION_PATTERNS)) {
      if (p.test(t)) { starts.push({ section: s, lineIndex: i }); break }
    }
  })
  const sections = {}
  starts.forEach(({ section, lineIndex }, idx) => {
    const next = starts[idx + 1]?.lineIndex ?? lines.length
    sections[section] = lines.slice(lineIndex + 1, next).join('\n').trim()
  })
  return sections
}

function extractExperience(text) {
  if (!text?.trim()) return []
  const lines = text.split('\n').map(l => l.trim())
  let dateIndices = lines.reduce((acc, l, i) => { if (DATE_RANGE_RE.test(l)) acc.push(i); return acc }, [])
  // Fallback: year tokens
  if (!dateIndices.length) {
    dateIndices = lines.reduce((acc, l, i) => {
      if (/\b(?:19|20)\d{2}\b/.test(l) && l.length < 80) acc.push(i)
      return acc
    }, []).slice(0, 15)
  }
  if (!dateIndices.length) return []
  return dateIndices.map((dateIdx, pos) => {
    const prev1 = dateIdx > 0 ? lines[dateIdx - 1] : ''
    const prev2 = dateIdx > 1 ? lines[dateIdx - 2] : ''
    let title = '', company = ''
    if (prev1?.includes('|')) { const p = prev1.split('|'); title=p[0]?.trim(); company=p[1]?.trim()||'' }
    else if (prev1 && prev2 && !DATE_RANGE_RE.test(prev2)) { title=prev2; company=prev1 }
    else if (prev1 && !DATE_RANGE_RE.test(prev1)) { title=prev1 }
    const nextIdx = dateIndices[pos + 1] ?? lines.length
    const bullets = lines.slice(dateIdx+1, nextIdx).filter(isBullet)
    return { company, title, start: 'x', end: null, bullets }
  }).filter(r => r.title || r.company)
}

const NAME_SUFFIXES = /,?\s*(MBA|PhD|Ph\.D|CPA|CFA|PMP|JD|MD|MSc|BSc|MA|MS|BA|BS|FCCA|ACA|ACCA|CIMA|CEng|FCA|MRICS|CIPD|CIPS|CMgr|CMC|DBA|MPA|LLB|LLM|MRes|MEng|BEng|HND|DipM|PgDip)\b/gi
const COMMON_NON_NAMES = ['contact','resume','profile','skills','experience','education','summary','objective','overview','highlights','languages','technical','professional','personal']
const SECTION_TAIL_RE = /[\s:_\-\.=]*$/

// Also update section patterns to allow trailing underscores/dashes
const SECTION_PATTERNS_LIST_V2 = [
  /^(summary|profile|professional\s+summary|career\s+summary|about\s+me|executive\s+summary|personal\s+statement|career\s+objective|objective|about|career\s+profile|professional\s+profile|personal\s+profile|introduction|highlights?|profil\s+professionnel|profil)[\s:_\-\.=]*$/im,
  /^(experience|work\s+experience|employment\s+history|professional\s+experience|work\s+history|career\s+history|relevant\s+experience|employment|positions?\s+held|professional\s+background|career\s+background|relevant\s+work|work\s+&\s+experience|experience\s+&\s+skills|exp[eé]riences?\s+professionnelles?|exp[eé]riences?)[\s:_\-\.=]*$/im,
  /^(education|academic\s+background|qualifications|academic\s+history|educational\s+background|academic\s+qualifications|education\s+&?\s*training|education\s+&?\s*certifications?|academic\s+achievements?|formation)[\s:_\-\.=]*$/im,
  /^(skills|technical\s+skills|core\s+skills|key\s+skills|competencies|areas\s+of\s+expertise|expertise|core\s+competencies|tools?\s+&\s+technologies|technologies|technical\s+proficiencies?|core\s+strengths?|areas\s+of\s+strength|strengths?|languages?\s+&\s+tools?|tech\s+stack|comp[eé]tences?)[\s:_\-\.=]*$/im,
  /^(certifications?|certificates?|credentials?|licen[sc]es?|professional\s+development|courses?|training|achievements?|awards?\s+&\s+achievements?|honours?|accomplishments?)[\s:_\-\.=]*$/im,
  /^(projects?|personal\s+projects?|key\s+projects?|notable\s+projects?|portfolio|volunteer|volunteering|activities|interests?|additional\s+information|other|languages?|langues?|centres?\s+d.int[eé]r[eê]ts?)[\s:_\-\.=]*$/im,
]

function hasNameLikeHeader(text) {
  const firstLines = text.split('\n').slice(0, 22)
    .map(l => collapseSpacedChars(l.trim()))
    .filter(l => l.length > 1 && l.length < 65)
  return firstLines.some(line => {
    if (/@/.test(line)) return false
    if (/https?:|www\./i.test(line)) return false
    if (/linkedin\.|github\.|twitter\./i.test(line)) return false
    if (/\d{5,}/.test(line)) return false
    if (/^\+?\d[\d\s\-().]{6,}$/.test(line)) return false
    if (/^(page|curriculum\s+vitae|resume|cv\b|contact|details|address|phone|email|profile|summary|objective|languages?|skills|education|experience|highlights)$/i.test(line)) return false
    let candidate = line
      .replace(/\([\w\s.]+\)/g, '')
      .replace(NAME_SUFFIXES, '')
      .replace(/\s*[|+:–—]\s*.{5,}$/, '')  // strip title part: "John Smith | Marketing Director"
      .replace(/[,;]+$/, '')
      .trim()
    if (candidate.length < 2) return false
    if (/^[A-Z]{6,25}$/.test(candidate)) return true
    const words = candidate.split(/\s+/).filter(Boolean)
    if (words.length < 1 || words.length > 7) return false
    const expandedWords = words.flatMap(w => {
      const camel = w.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ')
      return camel.length > 1 ? camel : [w]
    })
    const checkWords = expandedWords.length >= 2 ? expandedWords : words
    if (!checkWords.every(w => /^[\p{L}\-'.]+$/u.test(w))) return false
    if (!checkWords.some(w => /^\p{Lu}/u.test(w))) return false
    if (checkWords.map(w=>w.toLowerCase()).some(w => COMMON_NON_NAMES.includes(w))) return false
    return true
  })
}



const COMPRESSED_KEYWORDS = ['EXPERIENCE','WORKEXPERIENCE','EMPLOYMENTHISTORY','PROFESSIONALEXPERIENCE','WORKHISTORY','CAREERHISTORY','EDUCATION','SKILLS','TECHNICALSKILLS','COMPETENCIES','SUMMARY','PROFILE','OBJECTIVE','CERTIFICATIONS','QUALIFICATIONS','ACHIEVEMENTS','PROJECTS','LANGUAGES','TRAINING']

function stripNoise(line) {
  // Strip trailing repeated punctuation: "EXPERIENCE___________" → "EXPERIENCE"
  return line.replace(/[\s_\-\.=]{3,}$/, '').trim()
}

function countDetectedSections(text) {
  // Pre-process: strip trailing noise from each line
  const lines = text.split('\n').map(l => stripNoise(l.trim())).filter(Boolean)
  let count = 0
  for (const p of SECTION_PATTERNS_LIST_V2) {
    // Longer limit now (after noise strip, real heading should be short)
    const matched = lines.some(l => l.length > 0 && l.length <= 80 && p.test(l))
    if (matched) { count++; continue }
    const compressed = lines.some(l => {
      if (l.length > 60) return false
      const c = l.replace(/\s+/g,'').toUpperCase()
      return c.length >= 4 && COMPRESSED_KEYWORDS.some(k => c === k || c.startsWith(k))
    })
    if (compressed) count++
  }
  return count
}

function calculateConfidence(text, structured) {
  let score = 0
  const fails = []
  const details = {}

  // 1. Text volume
  details.charCount = text.replace(/\s/g, '').length
  if (details.charCount >= 800) score += 20
  else if (details.charCount >= 300) { score += 10; fails.push('shorttext') }
  else fails.push('veryshort')

  // 2. Name (15pts)
  details.hasName = hasNameLikeHeader(text)
  if (details.hasName) score += 15; else fails.push('name')

  // 3. CV sections (25pts)
  details.sections = countDetectedSections(text)
  if (details.sections >= 3) score += 25
  else if (details.sections === 2) score += 20
  else if (details.sections === 1) { score += 10; fails.push('1section') }
  else fails.push('0sections')

  // 4. Work history evidence (20pts)
  const dateRanges = [
    ...(text.match(new RegExp(DATE_RANGE_RE.source, 'gi')) || []),
    ...(text.match(new RegExp(DATE_RANGE_SHORT_RE.source, 'gi')) || []),
  ]
  const yearTokens = text.match(YEAR_RE) || []
  const uniqueYears = new Set(yearTokens).size
  const bulletLines = text.split('\n').filter(isBullet)
  const hasExpSection = /^(experience|work\s+experience|employment\s+history|professional\s+experience|employment|exp[eé]riences?)/im.test(text)
  details.dateRanges = dateRanges.length
  details.uniqueYears = uniqueYears
  details.bulletCount = bulletLines.length
  if (dateRanges.length >= 2 || uniqueYears >= 4) score += 20
  else if (dateRanges.length >= 1 || uniqueYears >= 2 || (hasExpSection && bulletLines.length >= 3)) { score += 15; fails.push('partialwork') }
  else if (hasExpSection || structured.experience.length >= 1) { score += 8; fails.push('weakwork') }
  else fails.push('0work')

  // 5. Structured content (20pts)
  const substantialLines = text.split('\n').filter(l => { const t=l.trim(); return t.length>=25&&t.length<=250&&/^[A-Za-z]/.test(t) })
  details.expLines = substantialLines.length
  if (bulletLines.length >= 3 || substantialLines.length >= 6) score += 20
  else if (bulletLines.length >= 1 || substantialLines.length >= 3) { score += 10; fails.push('fewcontent') }
  else fails.push('0content')

  return { score, fails, details }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const DOWNLOADS = join(homedir(), 'Downloads')
const N = parseInt(process.argv[2] || '100')
const THRESHOLD = 40

// Filter to likely CV files (by filename keywords)
const CV_KEYWORDS = /resume|cv\b|curriculum|vitae|candidate|applicant/i
const NON_CV_KEYWORDS = /invoice|jd[_\s-]|job.desc|assessment|checklist|pitch.deck|comp.plan|term[s]?\.pdf|contract|offer.letter|p60|payslip|user.guide|task|handover|skill.assess|guideline|copilot|pitch|deck|terms|worksheet|template|form\.|form-|onboarding|training|playbook|rubric|budget|proposal|report|plan\s|agenda|brief|spec[s]?\.|scope/i

const allFiles = readdirSync(DOWNLOADS)
  .filter(f => {
    const lf = f.toLowerCase()
    if (!lf.endsWith('.pdf') || f.startsWith('.')) return false
    if (NON_CV_KEYWORDS.test(f)) return false
    return true  // include all non-excluded files (most will be CVs)
  })
  .sort(() => Math.random() - 0.5)
  .slice(0, N)

console.log(`(Excluded obvious non-CV filenames, testing ${allFiles.length} files)`)

console.log(`\nCV Pulse Parser Test v2 — ${allFiles.length} CVs (threshold ${THRESHOLD})\n${'─'.repeat(80)}`)

const results = []
for (const filename of allFiles) {
  try {
    const buf = readFileSync(join(DOWNLOADS, filename))
    const data = await pdf(buf)
    const rawText = cleanText(data.text)
    const sections = detectSections(rawText)
    const experience = extractExperience(sections.experience || rawText)
    const { score, fails, details } = calculateConfidence(rawText, { experience })
    results.push({ filename, score, fails, details, isImageBased: details.charCount < 100, sections: details.sections })
  } catch (e) {
    if (results.length < 3) console.error('Error:', e.message.slice(0,100))
    results.push({ filename, score: -1, fails: ['error'], details: { charCount: 0 }, isImageBased: false })
  }
}

const real = results.filter(r => !r.isImageBased && r.score >= 0)
const image = results.filter(r => r.isImageBased)
const errors = results.filter(r => r.score < 0)

console.log(`\n📊 BREAKDOWN  Total: ${results.length} | Real CVs: ${real.length} | Image-based: ${image.length} | Errors: ${errors.length}`)

// Score distribution
console.log(`\n📈 SCORE DISTRIBUTION (real CVs)`)
const bands = { '100': 0, '90-99': 0, '80-89': 0, '60-79': 0, '40-59': 0, '<40': 0 }
real.forEach(r => {
  if (r.score === 100) bands['100']++
  else if (r.score >= 90) bands['90-99']++
  else if (r.score >= 80) bands['80-89']++
  else if (r.score >= 60) bands['60-79']++
  else if (r.score >= 40) bands['40-59']++
  else bands['<40']++
})
Object.entries(bands).forEach(([b, c]) => {
  const pct = Math.round(c/real.length*100)
  console.log(`  ${b.padEnd(8)} ${String(c).padStart(3)} (${String(pct).padStart(3)}%)  ${'█'.repeat(Math.round(pct/2))}`)
})

const pass90 = real.filter(r => r.score >= 90).length
const pass40 = real.filter(r => r.score >= 40).length
console.log(`\n🎯 ≥90 conf:  ${pass90}/${real.length} = ${Math.round(pass90/real.length*100)}%  (target: 90%)`)
console.log(`🎯 Pass gate: ${pass40}/${real.length} = ${Math.round(pass40/real.length*100)}%`)

// Failure breakdown
console.log(`\n🔍 FAILURE REASONS`)
const failCounts = {}
real.forEach(r => r.fails.forEach(f => { failCounts[f] = (failCounts[f]||0)+1 }))
Object.entries(failCounts).sort((a,b) => b[1]-a[1]).forEach(([f, c]) => {
  console.log(`  ${f.padEnd(15)} ${c} CVs (${Math.round(c/real.length*100)}%)`)
})

// Worst performers with filenames
console.log(`\n📋 WORST 15 (lowest confidence)`)
console.log(`${'Score'.padEnd(6)} ${'Chars'.padEnd(7)} ${'Sects'.padEnd(6)} ${'Dates'.padEnd(7)} ${'Bullets'.padEnd(9)} ${'File'.padEnd(45)} Fails`)
real.sort((a,b)=>a.score-b.score).slice(0,15).forEach(r => {
  const fname = r.filename.slice(0, 44).padEnd(44)
  console.log(`${String(r.score).padStart(5)} ${String(r.details.charCount).padStart(6)} s${r.details.sections} r${r.details.dateRanges}y${r.details.uniqueYears}`.padEnd(20) +
    String(r.details.bulletCount).padStart(6) + `  ${fname} ${r.fails.join(', ')}`)
})
console.log()
