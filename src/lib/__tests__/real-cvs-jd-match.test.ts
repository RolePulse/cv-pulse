// CV Pulse — Real CV × JD Match integration tests
// Epic 9 | Runs every CV in Downloads through the JD match engine.
//
// Per CV:
//   PDF parse → detect role → matchJD against representative JD for that role
//   → report match score, keyword coverage, top missing keywords
//
// Summary:
//   Avg match score, avg coverage, most commonly missing keywords
//   (tells us which terms real GTM CVs need most)

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>
import { parseText } from '@/lib/parser'
import { detectRole } from '@/lib/roleDetect'
import { matchJD } from '@/lib/jdMatcher'
import type { TargetRole } from '@/lib/roleDetect'

// ─── Representative JDs — one per role ───────────────────────────────────────
// Rich in keywords so we get a realistic match gap assessment.

const JDS: Record<TargetRole, string> = {
  SDR: `
Senior Sales Development Representative

We are looking for a tenacious SDR/BDR to join our growing outbound sales team.

Responsibilities:
- Own pipeline generation through cold calling, cold email, and multi-touch outreach sequences
- Build and run cadences in Salesloft or Outreach to hit a weekly meetings booked target
- Use ZoomInfo and Apollo to build targeted prospect lists
- Qualify inbound and outbound leads, converting MQLs to SQLs
- Collaborate closely with Account Executives on discovery calls and pipeline handoff
- Log all activity in Salesforce and HubSpot CRM
- Hit and exceed monthly quota for demos booked and connect rate targets
- Use Gong for call recording and coaching feedback loops

Requirements:
- 1–3 years SDR or BDR experience in a SaaS environment
- Proven track record of prospecting and pipeline generation
- Proficient with sales development tools: outreach, salesloft, hubspot, salesforce, gong, zoominfo, apollo
- Comfortable with cadence building, lead qualification, and pipeline reporting
- Strong cold calling ability; not afraid to pick up the phone
- Data-driven approach to monitoring pipeline generation metrics
  `,
  SE: `
Solutions Engineer — Enterprise SaaS

We are looking for a Solutions Engineer to partner with our Enterprise AE team on technical discovery, product demonstrations, and proof of concept evaluations.

Responsibilities:
- Own technical discovery calls to understand prospect architecture, integration requirements, and security needs
- Design and deliver compelling product demonstrations tailored to specific use cases
- Lead proof of concept (POC) scoping, execution, and technical sign-off to accelerate deal cycles
- Respond to RFP and RFI submissions with accurate technical documentation
- Build business cases and ROI models to support value selling with economic buyers
- Act as the technical champion internally and externally during evaluations
- Partner with Product and Engineering to relay feature requests and competitive intelligence
- Track pipeline influenced, win rates, and POC-to-close rates in Salesforce

Requirements:
- 3–5 years as a Solutions Engineer, Sales Engineer, or Presales Consultant in enterprise SaaS
- Proven ability to run technical discovery and product demonstrations at C-suite level
- Strong understanding of APIs, integrations, and cloud architecture (AWS, Azure)
- Experience with proof of concept execution and technical evaluation processes
- Familiar with MEDDIC and value selling methodologies
- Proficient with: salesforce, gong, jira, confluence, postman, aws, azure, zoom, loom, consensus
- Excellent communicator — translates technical complexity for non-technical buyers
  `,
  AE: `
Account Executive — Mid-Market & Enterprise

We are hiring a closing-focused Account Executive with a strong new business track record.

Responsibilities:
- Own the full sales cycle from discovery and qualification through negotiation and contract close
- Build and manage a pipeline of mid-market and enterprise opportunities
- Drive net new ARR with consistent quota attainment of 100%+
- Apply MEDDIC methodology to qualify and progress deals through the funnel
- Manage upsell and expansion opportunities within existing accounts
- Forecast accurately in Salesforce and update deal status weekly using Clari
- Partner with SDR team on outbound pipeline generation
- Use Gong and Chorus for call review; DocuSign and PandaDoc for contracts

Requirements:
- 3–5 years enterprise or mid-market B2B SaaS AE experience
- Track record of closing, quota attainment, and ACV/ARR growth
- Proficient with: salesforce, hubspot, gong, clari, chorus, docusign
- Experience with discovery, negotiation, and deal cycle management
- Familiar with new business, new logo, champion building, and win rate analysis
- Strong pipeline management and territory planning
  `,
  CSM: `
Senior Customer Success Manager

We are seeking an experienced CSM to drive retention, adoption, and expansion across our mid-market book of business.

Responsibilities:
- Own a portfolio of accounts and drive high retention and renewal rates
- Monitor customer health scores and proactively address at-risk accounts
- Run quarterly business reviews (QBRs) and executive business reviews (EBRs)
- Lead onboarding programmes and drive product adoption for new customers
- Identify and close upsell and expansion opportunities
- Track NPS and CSAT scores; act on negative signals before churn occurs
- Manage escalation handling and stakeholder communication
- Maintain account plans, success plans, and lifecycle playbooks in Gainsight or Totango
- Partner with product and engineering to manage customer feedback loops

Requirements:
- 3+ years CSM experience in a SaaS environment
- Proficiency with: gainsight, totango, hubspot, salesforce, zendesk, intercom, churnzero
- Proven track record in retention, renewal, and expansion revenue growth
- Experience with value realization, ROI conversations, and at-risk account management
- Strong stakeholder management and executive-level communication
  `,
  Marketing: `
Senior Demand Generation Manager

We are looking for a data-driven demand generation leader to own our pipeline growth engine.

Responsibilities:
- Design and execute multi-channel campaigns across paid social, LinkedIn Ads, Google Ads, email marketing, and webinars
- Own ABM (account based marketing) strategy targeting enterprise accounts
- Manage HubSpot and Marketo marketing automation and attribution
- Drive MQL and SQL volume through inbound and outbound-influenced demand gen programmes
- Run A/B testing and conversion rate optimisation across landing pages and email flows
- Report on pipeline contribution, CAC, CPL, CTR and attribution to board and C-suite
- Manage annual demand gen budget and allocate across channels for best ROI
- Collaborate with content marketing, SDR, and sales teams on GTM campaigns
- Use SEMrush and Google Analytics (GA4) for SEO and SEM performance tracking

Requirements:
- 4+ years demand gen, growth marketing, or performance marketing experience
- Proficient with: hubspot, marketo, google analytics, semrush, salesforce, linkedin ads, google ads, pardot, ga4
- Deep knowledge of MQL/SQL pipelines, campaign attribution, and budget management
- Experience with ABM platforms and account-based demand gen strategies
- Strong A/B testing and data-driven decision making
  `,
  Leadership: `
VP of Sales / Revenue Leader

We are hiring a senior Revenue Leader to own our GTM strategy and build a high-performance commercial team.

Responsibilities:
- Own revenue P&L and full accountability for ARR quota across the sales organisation
- Build, hire, coach and develop SDR, AE, and CSM teams from Series B to Series C scale
- Define GTM strategy, territory planning, and OKRs for the revenue org
- Forecast accurately to the board; manage pipeline and conversion metrics
- Partner with Marketing on demand gen and pipeline generation strategy
- Drive cross-functional alignment with product, engineering, and finance
- Establish performance management processes and headcount planning
- Report to CEO; present quarterly to the board and C-suite
- Manage stakeholder relationships with key enterprise customers and partners
- Define and drive market expansion into new verticals and geographies

Requirements:
- 7+ years in sales leadership: director, VP, head of sales, or equivalent
- Experience scaling GTM teams from 10 to 50+ headcount
- Proficient with: salesforce, hubspot, gong, clari, tableau, looker, greenhouse
- Deep knowledge of B2B SaaS revenue models, ARR, forecasting, and executive strategy
- Board-level communication; comfortable with OKRs, hiring, and scaling
  `,
  RevOps: `
Revenue Operations Manager

We are hiring a Revenue Operations Manager to optimise our GTM processes, CRM, and forecasting across Sales, Marketing, and CS.

Responsibilities:
- Own Salesforce CRM administration, data quality, and pipeline hygiene
- Build and maintain dashboards and reporting in Tableau and Looker for exec visibility
- Run weekly forecasting process; support territory planning and quota setting
- Partner with Sales, Marketing Ops, and CS Ops to align the full revenue operations tech stack
- Lead workflow automation projects using HubSpot, Outreach, and Salesloft integrations
- Drive attribution modelling and pipeline management processes
- Own deal desk operations and compensation planning support
- Use Clari for forecasting accuracy and pipeline management
- Identify process optimisation opportunities across the GTM motion
- Support revenue ops strategy and renewal ops with CRO

Requirements:
- 3–5 years in revenue operations, sales operations, or GTM ops in a SaaS environment
- Deep Salesforce admin experience; HubSpot, Clari, Gong, and Outreach familiarity
- Strong reporting and dashboards skills (Tableau, Looker, or equivalent)
- Experience with territory planning, quota setting, and compensation planning
- Comfortable with forecasting, data quality, and pipeline hygiene best practices
- Proficient with: salesforce, hubspot, clari, gong, tableau, looker, outreach, salesloft
  `,
}

// ─── CV files (same list as real-cvs.test.ts) ────────────────────────────────

const CV_DIR = path.join(process.env.HOME ?? '/Users/jamesfowles', 'Downloads')

const CV_FILES = [
  'Claire F Resume 2025.pdf',
  'Emily Shea - CV - 2025.pdf.pdf',
  'Mariah_Cooper_CV_2025.pdf',
  'Ashley Taggart Resume.pdf',
  'George Samayoa CV.pdf',
  '0Resumes Thomas D Dievart resume.pdf',
  'Bryson_Ward_Resume.pdf',
  'Katie Resume 2025.pdf',
  'Joe Guay Resume 2025.pdf',
  'Kati Smith Resume.pdf',
  'Nicholas M Goerg Resume  (3) (1).pdf',
  'Sophia Nguyen Resume 2025.pdf',
  'Resume-EveForaker.pdf',
  'Kit Lewis - Resume.pdf',
  'Erin Woods Resume (1).pdf',
  'Anthony Bryan Allen Resume 3.5.pdf',
  'MaxDalzielResume - 040925.pdf',
  'LauraManoleResume.pdf',
  'Florence Aouad Resume (1).pdf',
  'PiyushP_ResumeWPassword.pdf',
]

// ─── Helper ───────────────────────────────────────────────────────────────────

async function extractText(filePath: string): Promise<string | null> {
  try {
    const buffer = readFileSync(filePath)
    const result = await pdfParse(buffer)
    return result.text
  } catch {
    return null
  }
}

// ─── Results collector ────────────────────────────────────────────────────────

interface MatchResult {
  name: string
  skipped: boolean
  skipReason?: string
  detectedRole: TargetRole | null
  usedRole: TargetRole
  matchScore: number
  jdKeywordCount: number
  matchedCount: number
  missingCount: number
  topMissing: string[]        // top 5 missing by category priority
  roleKwMatched: number
  roleKwTotal: number
  toolKwMatched: number
  toolKwTotal: number
  errors: string[]
}

const results: MatchResult[] = []

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Real CV × JD Match — all CVs in Downloads', () => {

  for (const filename of CV_FILES) {
    it(`${filename}`, async () => {
      const filePath = path.join(CV_DIR, filename)
      const result: MatchResult = {
        name: filename,
        skipped: false,
        detectedRole: null,
        usedRole: 'SDR',
        matchScore: 0,
        jdKeywordCount: 0,
        matchedCount: 0,
        missingCount: 0,
        topMissing: [],
        roleKwMatched: 0,
        roleKwTotal: 0,
        toolKwMatched: 0,
        toolKwTotal: 0,
        errors: [],
      }

      // ── Skip if missing ─────────────────────────────────────────────────────
      if (!existsSync(filePath)) {
        result.skipped = true
        result.skipReason = 'File not found'
        results.push(result)
        console.log(`  ⏭ ${filename} — not found`)
        return
      }

      // ── Extract text ────────────────────────────────────────────────────────
      const rawText = await extractText(filePath)
      if (!rawText || rawText.trim().length < 100) {
        result.skipped = true
        result.skipReason = rawText === null ? 'Password-protected or corrupt' : 'Too short to parse'
        results.push(result)
        console.log(`  ⏭ ${filename} — ${result.skipReason}`)
        return
      }

      // ── Parse ───────────────────────────────────────────────────────────────
      let parsed: ReturnType<typeof parseText>
      try {
        parsed = parseText(rawText)
      } catch (e) {
        result.errors.push(`parseText crashed: ${String(e)}`)
        results.push(result)
        throw e
      }

      // ── Detect role (fall back to SDR for undetectable CVs) ─────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detected = detectRole(parsed.structured as any)
      result.detectedRole = detected
      result.usedRole = detected ?? 'SDR'

      // ── Run JD match ────────────────────────────────────────────────────────
      let matchResult: ReturnType<typeof matchJD>
      try {
        matchResult = matchJD(rawText, JDS[result.usedRole], result.usedRole)
      } catch (e) {
        result.errors.push(`matchJD crashed: ${String(e)}`)
        results.push(result)
        throw e
      }

      result.matchScore = matchResult.matchScore
      result.jdKeywordCount = matchResult.jdKeywords.length
      result.matchedCount = matchResult.matchedKeywords.length
      result.missingCount = matchResult.missingKeywords.length

      // Top missing: role keywords first, then tools, then general
      const { roleKeywords, toolKeywords, generalKeywords } = matchResult.breakdown
      result.topMissing = [
        ...roleKeywords.missing,
        ...toolKeywords.missing,
        ...generalKeywords.missing,
      ].slice(0, 6)

      result.roleKwMatched = roleKeywords.matched.length
      result.roleKwTotal = roleKeywords.matched.length + roleKeywords.missing.length
      result.toolKwMatched = toolKeywords.matched.length
      result.toolKwTotal = toolKeywords.matched.length + toolKeywords.missing.length

      results.push(result)

      // ── Per-CV console output ───────────────────────────────────────────────
      const scoreBadge = matchResult.matchScore >= 75 ? '🟢' : matchResult.matchScore >= 50 ? '🟡' : '🔴'
      const coveragePct = result.jdKeywordCount > 0
        ? Math.round((result.matchedCount / result.jdKeywordCount) * 100)
        : 0

      console.log(
        `  ${scoreBadge} ${filename.replace('.pdf', '')}\n` +
        `     role=${result.usedRole}${result.detectedRole === null ? ' (fallback)' : ''} | score=${result.matchScore}/100 | coverage=${coveragePct}%\n` +
        `     keywords: ${result.matchedCount}/${result.jdKeywordCount} matched | role kws: ${result.roleKwMatched}/${result.roleKwTotal} | tools: ${result.toolKwMatched}/${result.toolKwTotal}\n` +
        (result.topMissing.length > 0
          ? `     top missing: ${result.topMissing.join(', ')}`
          : `     top missing: (none — full match)`)
      )

      // ── Assertions ──────────────────────────────────────────────────────────
      expect(result.matchScore).toBeGreaterThanOrEqual(0)
      expect(result.matchScore).toBeLessThanOrEqual(100)
      // Integrity: matched + missing must equal total JD keywords
      expect(result.matchedCount + result.missingCount).toBe(result.jdKeywordCount)
      expect(result.errors).toHaveLength(0)
    })
  }

  // ── Summary report ──────────────────────────────────────────────────────────

  it('prints JD match summary', () => {
    const processed = results.filter((r) => !r.skipped)
    const skipped = results.filter((r) => r.skipped)

    const avgScore = processed.length
      ? Math.round(processed.reduce((sum, r) => sum + r.matchScore, 0) / processed.length)
      : 0

    const avgCoverage = processed.length
      ? Math.round(
          processed.reduce((sum, r) =>
            sum + (r.jdKeywordCount > 0 ? r.matchedCount / r.jdKeywordCount : 0), 0
          ) / processed.length * 100
        )
      : 0

    // Score band counts
    const strong   = processed.filter((r) => r.matchScore >= 75).length
    const partial  = processed.filter((r) => r.matchScore >= 50 && r.matchScore < 75).length
    const weak     = processed.filter((r) => r.matchScore > 0 && r.matchScore < 50).length
    const noMatch  = processed.filter((r) => r.matchScore === 0).length

    // Role breakdown
    const byRole: Record<string, { count: number; totalScore: number }> = {}
    for (const r of processed) {
      if (!byRole[r.usedRole]) byRole[r.usedRole] = { count: 0, totalScore: 0 }
      byRole[r.usedRole].count++
      byRole[r.usedRole].totalScore += r.matchScore
    }

    // Most commonly missing keywords across all CVs
    const missingFreq: Record<string, number> = {}
    for (const r of processed) {
      for (const kw of r.topMissing) {
        missingFreq[kw] = (missingFreq[kw] ?? 0) + 1
      }
    }
    const topGlobalMissing = Object.entries(missingFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)

    console.log('\n──────────── JD MATCH SUMMARY ────────────')
    console.log(`CVs processed: ${processed.length} / ${CV_FILES.length} (${skipped.length} skipped)`)
    console.log(`Avg match score: ${avgScore}/100`)
    console.log(`Avg keyword coverage: ${avgCoverage}%`)
    console.log(`\nScore bands:`)
    console.log(`  🟢 Strong (75+):  ${strong}/${processed.length} CVs`)
    console.log(`  🟡 Partial (50–74): ${partial}/${processed.length} CVs`)
    console.log(`  🔴 Weak (<50):    ${weak}/${processed.length} CVs`)
    if (noMatch > 0) console.log(`  ⬛ No match:     ${noMatch}/${processed.length} CVs`)

    console.log(`\nBy role:`)
    for (const [role, data] of Object.entries(byRole).sort((a, b) => b[1].count - a[1].count)) {
      const avg = Math.round(data.totalScore / data.count)
      console.log(`  ${role}: ${data.count} CVs, avg score ${avg}/100`)
    }

    console.log(`\nMost commonly missing keywords (across all CVs):`)
    for (const [kw, count] of topGlobalMissing) {
      const pct = Math.round(count / processed.length * 100)
      console.log(`  "${kw}" — missing from ${count}/${processed.length} CVs (${pct}%)`)
    }

    console.log('──────────────────────────────────────────\n')

    expect(processed.length).toBeGreaterThan(0)
  })
})
