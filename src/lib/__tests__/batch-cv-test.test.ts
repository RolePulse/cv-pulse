/**
 * CV Pulse — Full batch CV parsing test
 * Tests ALL real CVs in Downloads through the complete parse pipeline.
 * Run: npx vitest run src/lib/__tests__/batch-cv-test.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { parseCV } from '../parser'

const DOWNLOADS = '/Users/jamesfowles/Downloads'

// Skip clearly non-CV files
const SKIP_PATTERNS = [
  /offer.?letter/i, /comp.?plan/i, /job.?desc/i, /\bassessment\b/i,
  /skill.?assess/i, /\btask\b/i, /pitch.?deck/i, /pipeline/i, /INV\d/,
  /receipt/i, /statement/i, /\bp60\b/i, /ccsb/i, /property/i,
  /fittings/i, /holiday/i, /checklist/i, /handover/i, /scenario/i,
  /working.?genius/i, /user.?guide/i, /services/i, /confirmation/i,
  /\bFOWELS.ORDER\b/i, /\bFOWLES.*CONFIRM/i, /\bsop\b/i, /stock.?plan/i,
  /\bexhibit\b/i, /role.?kick/i, /hiring.?value/i, /sales.?comp/i,
  /\bguesty\b/i, /video.?editor/i, /design.?system/i, /kpi.?design/i,
  /case.?escal/i, /OandJ/i, /O&J.Pres/i, /Role.Pulse\.pdf/i,
  /OMG.*sheet/i, /ResInv/i, /\bsbc\b/i, /Anna.Comp.Plan/i,
  /Copy.of.*Plan/i, /Final.*Plan/i, /Guesty.Pipe/i, /Guesty.Pitch/i,
  /Prescient.AI.*Task/i, /RepeatMD.*Task/i, /RepeatMD.*Skill/i,
  /RepeatMD.*Hiring/i, /RepeatMD.*2022/i, /EA.Assignment/i,
  /Customer.Success.Manager.Assessment/i, /HRBP.Job.Description/i,
  /Regional.HR.Lead/i, /Engineering.Manager.*JD/i, /Chief.Financial/i,
  /Community.Liaison/i, /JD_.*Video/i, /SC.Skill/i,
  /^Profile\.pdf$/, /^Profile \(\d+\)\.pdf$/, // LinkedIn profile exports
  /Tiffanys.*User.Guide/i, /Scenario.*KPI/i, /Scenario.*Case/i,
  /Exhibit.A/i, /Holiday.Handover/i, /DiPaolo.*Offer/i, /Grace.*Offer/i,
  /Grewell.*Offer/i, /Mikusko.*Offer/i, /Sileo.*Offer/i, /Sadiq.*Offer/i,
  /Falk.*Offer/i, /Cofino.*Offer/i, /McClain.*Offer/i, /Pham.*Offer/i,
  /Jaundoo.*Offer/i, /Lim.*Offer/i, /Stepanian.*Offer/i, /Tejera.*Offer/i,
  /Yared.*Offer/i, /Shea.*Offer/i, /Stefanie.Hart.*Offer/i, /Emily.Shea.*Offer/i,
  /Anderson.*Offer/i, /Calderon.*Offer/i, /Caniedo.*Offer/i, /Espineda.*Offer/i,
  /Padayao.*Offer/i, /Padilla.*Offer/i, /Vargas.*Offer/i,
  /ccsbblueshield/i, /OS581774302/i, /5217139315/, /INV3196/,
  /P60_/, /ResInv2025/,
  /763F271A/i, /B80FE762/i, /BDB4978B/i, /F049E176/i, // UUIDs — offer docs
  /Guesty.Assignment/i, /Mia.McClain.*SC/i, /SC.Skill.Assess/i,
]

function isLikelyCv(filename: string): boolean {
  return !SKIP_PATTERNS.some(p => p.test(filename))
}

if (!existsSync(DOWNLOADS)) {
  describe('batch-cv-test', () => {
    it('skips — no Downloads folder found', () => { expect(true).toBe(true) })
  })
} else {
  const allPdfs = readdirSync(DOWNLOADS).filter(f => f.endsWith('.pdf'))
  const cvFiles = allPdfs.filter(isLikelyCv)

  // Stats we accumulate across tests
  const results: Array<{
    file: string
    confidence: number
    roles: number
    skills: number
    education: number
    failReason?: string
    category: 'pass' | 'low' | 'image' | 'error'
  }> = []

  describe(`Batch CV parse — ${cvFiles.length} files`, () => {

    // Test each CV
    cvFiles.forEach(file => {
      it(file, async () => {
        const buf = readFileSync(join(DOWNLOADS, file))
        const result = await parseCV(buf)

        const entry = {
          file,
          confidence: result.confidence,
          roles: result.structured?.experience?.length ?? 0,
          skills: result.structured?.skills?.length ?? 0,
          education: result.structured?.education?.length ?? 0,
          failReason: result.failReason,
          category: 'pass' as 'pass' | 'low' | 'image' | 'error',
        }

        if (result.confidence === 0) {
          entry.category = result.failReason?.includes('image-based') ? 'image' : 'error'
        } else if (result.confidence < 40) {
          entry.category = 'low'
        }

        results.push(entry)

        // Log results for the report
        const flag = entry.category === 'pass' ? '✅'
          : entry.category === 'low' ? '⚠️ '
          : entry.category === 'image' ? '🖼 '
          : '💥'

        console.log(
          `${flag} [conf=${result.confidence}] [roles=${entry.roles}] [skills=${entry.skills}] ${file}`
        )
        if (result.failReason) console.log(`   ↳ ${result.failReason}`)

        // We don't fail the test — we want to collect all results
        expect(result).toBeDefined()
      })
    })

    // Final summary
    it('📊 SUMMARY REPORT', () => {
      const pass = results.filter(r => r.category === 'pass')
      const low = results.filter(r => r.category === 'low')
      const image = results.filter(r => r.category === 'image')
      const error = results.filter(r => r.category === 'error')
      const avgConf = pass.length ? Math.round(pass.reduce((a, b) => a + b.confidence, 0) / pass.length) : 0
      const avgRoles = pass.length ? (pass.reduce((a, b) => a + b.roles, 0) / pass.length).toFixed(1) : 0
      const zeroRoles = pass.filter(r => r.roles === 0)

      console.log('\n' + '═'.repeat(80))
      console.log('📊  BATCH CV PARSE — FULL REPORT')
      console.log('═'.repeat(80))
      console.log(`  Total CVs tested:    ${results.length}`)
      console.log(`  ✅ Pass (conf≥40):  ${pass.length}`)
      console.log(`  ⚠️  Low confidence:  ${low.length}`)
      console.log(`  🖼  Image-based:     ${image.length}`)
      console.log(`  💥 Errors:          ${error.length}`)
      console.log(`  Avg conf (passing): ${avgConf}`)
      console.log(`  Avg roles (passing):${avgRoles}`)
      console.log(`  Zero roles detected:${zeroRoles.length}`)

      if (low.length) {
        console.log('\n⚠️  LOW CONFIDENCE:')
        low.forEach(r => console.log(`  [${r.confidence}] ${r.file}\n       ${r.failReason}`))
      }
      if (image.length) {
        console.log('\n🖼  IMAGE-BASED (no text extracted):')
        image.forEach(r => console.log(`  - ${r.file}`))
      }
      if (error.length) {
        console.log('\n💥 ERRORS:')
        error.forEach(r => console.log(`  - ${r.file}: ${r.failReason}`))
      }
      if (zeroRoles.length) {
        console.log('\n⚠️  PASSED BUT 0 ROLES DETECTED:')
        zeroRoles.forEach(r => console.log(`  [conf=${r.confidence}] ${r.file}`))
      }
      console.log('═'.repeat(80))

      expect(results.length).toBeGreaterThan(0)
    })
  })
}
