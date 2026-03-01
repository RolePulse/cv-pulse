// CV Pulse — Scorer test harness
// Epic 4 | Tests the scoring engine against real CVs from the parser test suite
// Run: node scripts/test-scorer.mjs

import { createRequire } from 'module'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ── Load modules via require (they use CommonJS-compatible TS compiled output)
// Since we can't import TS directly, we'll test the logic inline by reproducing
// the key functions — or use tsx if available

// Check for tsx
import { execSync } from 'child_process'

try {
  execSync('which tsx', { stdio: 'ignore' })
} catch {
  console.log('tsx not found — installing...')
  execSync('npm install -D tsx', { stdio: 'inherit', cwd: join(__dirname, '..') })
}

// Run the actual test via tsx
const testCode = `
import { parseCV, parseText } from './src/lib/parser.ts'
import { scoreCV } from './src/lib/scorer.ts'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const CV_ROLES = ['SDR', 'AE', 'CSM', 'Marketing', 'Leadership'] as const
type TargetRole = typeof CV_ROLES[number]

// Sample structured CVs for unit tests
const MOCK_STRONG_CSM = {
  summary: 'Customer Success Manager with 5 years experience in SaaS. Specialist in retention, QBR delivery, and expansion revenue. Gainsight certified.',
  experience: [
    {
      company: 'Acme SaaS',
      title: 'Customer Success Manager',
      start: 'Jan 2021',
      end: 'Present',
      bullets: [
        'Maintained 96% gross retention rate across 45-account portfolio worth $3.2M ARR',
        'Led QBR process for top 10 accounts, resulting in 28% expansion revenue in Q2 2023',
        'Reduced churn by 18% through proactive health score monitoring via Gainsight',
        'Onboarded 12 enterprise accounts in 6 months, achieving 94% 90-day activation rate',
      ],
    },
    {
      company: 'StartupCo',
      title: 'Junior Customer Success Manager',
      start: 'Mar 2019',
      end: 'Dec 2020',
      bullets: [
        'Managed 60+ SMB accounts with average NPS of 52',
        'Reduced time-to-value by 30% through improved onboarding playbook',
        'Contributed to 15% upsell revenue by identifying expansion opportunities',
      ],
    },
  ],
  skills: ['Gainsight', 'Salesforce', 'Customer Success', 'Retention', 'QBR', 'NPS', 'CSAT', 'Onboarding', 'Renewal'],
  education: [{ institution: 'University of Bath', qualification: 'BSc Business', year: '2018' }],
  certifications: ['Gainsight Certified Customer Success Manager'],
}

const MOCK_RAW_CSM = \`
Jane Smith
jane.smith@email.com
linkedin.com/in/janesmith

Customer Success Manager at Acme SaaS (Jan 2021 – Present)
Maintained 96% gross retention rate across 45-account portfolio worth $3.2M ARR
Led QBR process for top 10 accounts, resulting in 28% expansion revenue in Q2 2023
Reduced churn by 18% through proactive health score monitoring via Gainsight

Junior CSM at StartupCo (Mar 2019 – Dec 2020)
Managed 60+ SMB accounts with average NPS of 52
Reduced time-to-value by 30% through improved onboarding playbook

Skills: Gainsight, Salesforce, Customer Success, QBR, NPS, CSAT, Onboarding, Renewal, Retention
Education: BSc Business, University of Bath, 2018
\`

const MOCK_WEAK_SDR = {
  summary: '',
  experience: [
    {
      company: '',
      title: 'Sales Representative',
      start: '',
      end: '',
      bullets: [
        'Made calls to potential customers',
        'Helped with pipeline activities',
        'Used CRM system daily',
      ],
    },
  ],
  skills: ['Sales', 'Communication'],
  education: [],
  certifications: [],
}

const MOCK_RAW_WEAK = \`
John Doe
Sales Representative
Made calls to potential customers
Helped with pipeline activities
Used CRM system daily
Skills: Sales, Communication
\`

async function runTests() {
  console.log('\\n=== CV Pulse Scorer — Unit Tests ===\\n')

  // Test 1: Strong CSM CV
  {
    const result = scoreCV(MOCK_STRONG_CSM, MOCK_RAW_CSM, 'CSM')
    const pass = result.overallScore >= 70 && result.passFail
    console.log(\`Test 1: Strong CSM CV\`)
    console.log(\`  Score: \${result.overallScore}/100 | Pass/Fail: \${result.passFail ? 'PASS ✅' : 'FAIL ❌'}\`)
    console.log(\`  Buckets: Impact \${result.buckets.proofOfImpact.score}/35 | ATS \${result.buckets.atsKeywords.score}/25 | Format \${result.buckets.formatting.score}/20 | Clarity \${result.buckets.clarity.score}/20\`)
    console.log(\`  Critical concerns: \${result.criticalConcerns.length === 0 ? 'None ✅' : result.criticalConcerns.join(', ')}\`)
    console.log(\`  Keywords matched: \${result.keywordData.matched.length}/\${result.keywordData.total}\`)
    console.log(\`  Checklist items: \${result.checklist.length} (\${result.checklist.filter(c => c.done).length} done)\`)
    console.log(\`  Expected: score ≥70, pass=true → \${pass ? '✅ PASS' : '❌ FAIL'}\`)
    console.log()
  }

  // Test 2: Weak SDR CV (should fail)
  {
    const result = scoreCV(MOCK_WEAK_SDR, MOCK_RAW_WEAK, 'SDR')
    const pass = !result.passFail && result.overallScore < 50
    console.log(\`Test 2: Weak SDR CV\`)
    console.log(\`  Score: \${result.overallScore}/100 | Pass/Fail: \${result.passFail ? 'PASS' : 'FAIL (expected) ✅'}\`)
    console.log(\`  Critical concerns: \${result.criticalConcerns.join(' | ')}\`)
    console.log(\`  Buckets: Impact \${result.buckets.proofOfImpact.score}/35 | ATS \${result.buckets.atsKeywords.score}/25 | Format \${result.buckets.formatting.score}/20 | Clarity \${result.buckets.clarity.score}/20\`)
    console.log(\`  Expected: score <50, pass=false → \${pass ? '✅ PASS' : '❌ FAIL'}\`)
    console.log()
  }

  // Test 3: Determinism — same input = same output
  {
    const r1 = scoreCV(MOCK_STRONG_CSM, MOCK_RAW_CSM, 'CSM')
    const r2 = scoreCV(MOCK_STRONG_CSM, MOCK_RAW_CSM, 'CSM')
    const deterministic = r1.overallScore === r2.overallScore && r1.passFail === r2.passFail
    console.log(\`Test 3: Determinism\`)
    console.log(\`  Run 1: \${r1.overallScore} | Run 2: \${r2.overallScore} → \${deterministic ? '✅ Deterministic' : '❌ Non-deterministic!'}\`)
    console.log()
  }

  // Test 4: Real PDFs from Downloads (if available)
  const downloadsDir = process.env.HOME + '/Downloads'
  const CV_KEYWORDS = ['cv', 'resume', 'curriculum']
  const SKIP_KEYWORDS = ['invoice', 'receipt', 'order', 'assessment', 'test', 'quiz', 'worksheet', 'jd', 'job description', 'brief', 'scope']

  let files: string[] = []
  try {
    files = readdirSync(downloadsDir)
      .filter(f => f.endsWith('.pdf'))
      .filter(f => {
        const lower = f.toLowerCase()
        return CV_KEYWORDS.some(k => lower.includes(k)) &&
          !SKIP_KEYWORDS.some(k => lower.includes(k))
      })
      .slice(0, 10)
  } catch { /* no downloads dir */ }

  if (files.length > 0) {
    console.log(\`Test 4: Real CVs from Downloads (\${files.length} files)\`)
    let passed = 0
    let failed = 0

    for (const file of files) {
      const { readFileSync } = await import('fs')
      const buffer = readFileSync(downloadsDir + '/' + file)
      const parsed = await parseCV(buffer)

      if (parsed.confidence < 40) {
        console.log(\`  [\${file}] Skipped — parse confidence \${parsed.confidence}\`)
        continue
      }

      const result = scoreCV(parsed.structured, parsed.rawText, 'CSM')
      const verdict = result.overallScore >= 30 ? '✅' : '⚠️'
      console.log(\`  \${verdict} [\${file.slice(0, 35)}] → \${result.overallScore}/100 (\${result.passFail ? 'PASS' : 'FAIL'}) | Impact:\${result.buckets.proofOfImpact.score} ATS:\${result.buckets.atsKeywords.score} Format:\${result.buckets.formatting.score} Clarity:\${result.buckets.clarity.score}\`)
      if (result.overallScore >= 30) passed++
      else failed++
    }

    console.log(\`  Summary: \${passed} scored ≥30, \${failed} scored <30\`)
  }

  console.log('\\n=== Done ===')
}

runTests().catch(console.error)
`

import { writeFileSync } from 'fs'
import { join as pathJoin } from 'path'

const tmpFile = pathJoin(__dirname, '..', '.test-scorer-tmp.ts')
writeFileSync(tmpFile, testCode)

try {
  execSync(`cd "${join(__dirname, '..')}" && npx tsx .test-scorer-tmp.ts`, {
    stdio: 'inherit',
    env: { ...process.env }
  })
} finally {
  import('fs').then(({ unlinkSync }) => {
    try { unlinkSync(tmpFile) } catch { /* ignore */ }
  })
}
