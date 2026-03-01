// Epic 9 — JD Match tests
// Covers: score computation, determinism, edge cases, keyword extraction,
// Marketing subtype inference, empty JD handling, cross-role coverage.
//
// Level: medium (8 checks)

import { describe, it, expect } from 'vitest'
import { matchJD } from '@/lib/jdMatcher'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// A solid SDR CV with key terms
const SDR_CV = `
Jane Smith | jane@example.com | linkedin.com/in/janesmith | London, UK

Senior SDR — Acme SaaS (Jan 2022 – Present)
- Generated $1.2M pipeline through outbound prospecting using Outreach and Salesforce
- Booked 15 qualified demos per month, exceeding quota by 25%
- Cold calling 50+ prospects daily; managed cadences in Salesloft

SDR — Beta Corp (Mar 2020 – Dec 2021)
- Used ZoomInfo and Apollo to build targeted prospect lists
- Achieved 120% of monthly meetings booked target for 8 consecutive months

Skills: outbound, cold email, prospecting, pipeline generation, Salesforce, HubSpot, Outreach, SQL, MQL
`

// A Marketing CV focused on demand gen
const MARKETING_CV = `
Alex Jones | alex@example.com | linkedin.com/in/alexjones | New York, NY

Head of Demand Generation — CloudCo (Feb 2021 – Present)
- Scaled demand gen campaigns driving $4M ARR in pipeline through HubSpot and Marketo
- Led ABM strategy targeting enterprise accounts; improved MQL to SQL conversion by 30%
- Managed $200k annual paid social and LinkedIn Ads budget

Marketing Manager — SaaSify (Jan 2019 – Jan 2021)
- Ran SEO and SEM programme increasing organic traffic by 120%
- Built email marketing automation workflows in Marketo
- A/B testing landing pages improved conversion rate by 18%

Skills: demand generation, ABM, HubSpot, Marketo, Google Analytics, LinkedIn Ads, MQL, attribution
`

// A minimal AE JD
const AE_JD = `
Account Executive — Enterprise SaaS

We are looking for a closing-focused Account Executive to join our growing sales team.

Requirements:
- 3+ years enterprise sales experience with strong quota attainment
- Experience with MEDDIC sales methodology
- Comfortable managing a full sales cycle from discovery through negotiation and contract close
- Track record of new logo acquisition and ARR growth
- Salesforce CRM proficiency required; Gong and Clari experience a plus
- Strong ability to forecast pipeline and manage territory

You will work on mid-market and enterprise deals, managing upsell and expansion opportunities.
Revenue-driven mindset with strong commercial acumen. B2B SaaS experience preferred.
`

// A demand-gen Marketing JD
const DEMAND_GEN_JD = `
Senior Demand Generation Manager

We're hiring a data-driven demand gen leader to own our pipeline generation engine.

You will run multi-channel campaigns across paid social, LinkedIn Ads, and email marketing.
Experience with ABM (account based marketing) strategy required.
Proficient with HubSpot, Marketo, and Google Analytics.
Strong understanding of MQL/SQL conversion, attribution, and campaign ROI.
A/B testing mindset and ability to optimise conversion rate across funnels.
Budget ownership experience preferred ($250k+ annually).
Manage monthly webinars and coordinate content marketing efforts.
`

// A bare-minimum JD with no recognisable keywords
const GENERIC_JD = `
We are looking for a talented professional to join our dynamic team.
You will work hard and be passionate about results.
Must have good communication skills and a positive attitude.
Team player required. Salary competitive.
`

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Epic 9 — JD Match engine', () => {

  it('1. Returns a score between 0 and 100 for a real CV + real JD', () => {
    const result = matchJD(SDR_CV, AE_JD, 'AE')
    expect(result.matchScore).toBeGreaterThanOrEqual(0)
    expect(result.matchScore).toBeLessThanOrEqual(100)
  })

  it('2. Deterministic — same inputs always produce the same score', () => {
    const r1 = matchJD(SDR_CV, AE_JD, 'AE')
    const r2 = matchJD(SDR_CV, AE_JD, 'AE')
    expect(r1.matchScore).toBe(r2.matchScore)
    expect(r1.matchedKeywords).toEqual(r2.matchedKeywords)
    expect(r1.missingKeywords).toEqual(r2.missingKeywords)
  })

  it('3. A CV with all JD keywords scores higher than a CV with none', () => {
    // Create a CV that contains every AE keyword in the JD
    const strongAECV = `
      Account executive with deep enterprise sales experience. Closing new logos.
      Quota attainment 120%+. ARR $2M. ACv £500k. MEDDIC certified.
      Discovery, negotiation, contract close. Win rate 40%. Revenue forecast.
      Salesforce, HubSpot, Gong, Clari, Chorus, DocuSign.
      Pipeline management, mid-market and enterprise. Upsell, expansion. B2B SaaS.
      Deal cycle 60–90 days. New business, proposals, territory management.
    `
    const blankCV = 'Software engineer with Python and JavaScript experience.'
    const strongResult = matchJD(strongAECV, AE_JD, 'AE')
    const weakResult = matchJD(blankCV, AE_JD, 'AE')
    expect(strongResult.matchScore).toBeGreaterThan(weakResult.matchScore)
  })

  it('4. matchedKeywords + missingKeywords = jdKeywords (no keyword lost)', () => {
    const result = matchJD(SDR_CV, AE_JD, 'AE')
    const combined = [...result.matchedKeywords, ...result.missingKeywords].sort()
    const jdKws = [...result.jdKeywords].sort()
    expect(combined).toEqual(jdKws)
  })

  it('5. Breakdown totals match top-level matched/missing counts', () => {
    const result = matchJD(MARKETING_CV, DEMAND_GEN_JD, 'Marketing')
    const { roleKeywords, toolKeywords, generalKeywords } = result.breakdown

    const totalMatched =
      roleKeywords.matched.length +
      toolKeywords.matched.length +
      generalKeywords.matched.length

    const totalMissing =
      roleKeywords.missing.length +
      toolKeywords.missing.length +
      generalKeywords.missing.length

    expect(totalMatched).toBe(result.matchedKeywords.length)
    expect(totalMissing).toBe(result.missingKeywords.length)
  })

  it('6. Infers Marketing subtype from a demand-gen JD', () => {
    const result = matchJD(MARKETING_CV, DEMAND_GEN_JD, 'Marketing')
    expect(result.marketingSubtype).toBe('demand-gen')
  })

  it('7. No marketingSubtype returned for non-Marketing roles', () => {
    const result = matchJD(SDR_CV, AE_JD, 'AE')
    expect(result.marketingSubtype).toBeUndefined()
  })

  it('8. Generic JD with no recognisable keywords returns empty result gracefully', () => {
    const result = matchJD(SDR_CV, GENERIC_JD, 'SDR')
    expect(result.matchScore).toBe(0)
    expect(result.jdKeywords).toHaveLength(0)
    expect(result.matchedKeywords).toHaveLength(0)
    expect(result.missingKeywords).toHaveLength(0)
  })

})
