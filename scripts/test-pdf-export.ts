// PDF export test script — generates both templates from demo data
// Run: npx tsx scripts/test-pdf-export.ts
import { generatePDF } from '../src/lib/pdfTemplates/index'
import { DEMO_CV, DEMO_RAW_TEXT } from '../src/lib/demoData'
import { writeFileSync } from 'fs'

// Create a long CV to stress-test overflow/cutoff
const LONG_CV = {
  ...DEMO_CV,
  summary: 'Results-driven Account Executive with 8+ years of enterprise B2B SaaS sales experience. Consistent track record of exceeding quota by 120%+ across complex, multi-stakeholder deal cycles in mid-market and enterprise segments. Expert in MEDDIC, Challenger, and value-based selling. Proven ability to manage large territories, drive net new ARR, and build lasting executive relationships.',
  experience: [
    ...DEMO_CV.experience,
    {
      title: 'Account Executive — EMEA',
      company: 'ScaleUp Technologies',
      start: 'Jan 2018',
      end: 'Dec 2019',
      bullets: [
        'Closed £2.4M new ARR in FY2019, 148% of quota — ranked #1 of 12 AEs in EMEA region',
        'Built greenfield territory from 0 to £1.8M pipeline in first 6 months through strategic outbound and partner co-sell',
        'Led multi-threaded deal cycles with average 6-month sales cycle and 8+ stakeholders across procurement, legal, IT, and C-suite',
        'Won 3 competitive displacements against Salesforce and HubSpot through superior discovery and ROI business case development',
        'Mentored 2 junior AEs through onboarding and early ramp; both exceeded 100% quota in first full quarter',
      ],
    },
    {
      title: 'Senior Sales Executive',
      company: 'GrowthForce Ltd',
      start: 'Mar 2015',
      end: 'Dec 2017',
      bullets: [
        'Consistently delivered 110–135% of annual quota across 3 consecutive years',
        'Managed book of 40+ mid-market accounts with combined ACV of £3.2M',
        'Reduced average sales cycle from 4.5 months to 2.8 months through improved qualification and champion development',
        'Delivered 28 product demos per quarter with 42% conversion to opportunity',
      ],
    },
  ],
  skills: [
    'Salesforce', 'HubSpot', 'Gong', 'Clari', 'Outreach', 'SalesLoft', 'ZoomInfo',
    'Apollo', 'DocuSign', 'PandaDoc', 'LinkedIn Sales Navigator', 'Chorus',
    'MEDDIC', 'Challenger Sale', 'Value Selling', 'Spin Selling', 'Forecasting',
    'Territory Planning', 'Pipeline Management', 'Executive Presentations', 'Negotiation',
    'Contract Management', 'CRM Administration', 'Business Case Development', 'ROI Modelling',
  ],
  certifications: [
    'Salesforce Certified Sales Cloud Consultant (2022)',
    'MEDDIC Sales Methodology Certified (2021)',
    'LinkedIn Sales Navigator Advanced Certification (2020)',
  ],
}

async function main() {
  console.log('\n── Demo CV (standard) ──────────────────────────────────')
  console.log(`  Roles: ${DEMO_CV.experience.length}`)
  console.log(`  Total bullets: ${DEMO_CV.experience.reduce((s, r) => s + r.bullets.length, 0)}`)
  console.log(`  Skills: ${DEMO_CV.skills.length}`)

  const classicDemo = await generatePDF(DEMO_CV, DEMO_RAW_TEXT, 'classic')
  writeFileSync('/tmp/cv-demo-classic.pdf', classicDemo)
  console.log(`  Classic PDF: ${classicDemo.byteLength} bytes → /tmp/cv-demo-classic.pdf`)

  const modernDemo = await generatePDF(DEMO_CV, DEMO_RAW_TEXT, 'modern')
  writeFileSync('/tmp/cv-demo-modern.pdf', modernDemo)
  console.log(`  Modern PDF: ${modernDemo.byteLength} bytes → /tmp/cv-demo-modern.pdf`)

  console.log('\n── Long CV (stress test) ───────────────────────────────')
  console.log(`  Roles: ${LONG_CV.experience.length}`)
  console.log(`  Total bullets: ${LONG_CV.experience.reduce((s, r) => s + r.bullets.length, 0)}`)
  console.log(`  Skills: ${LONG_CV.skills.length}`)
  console.log(`  Summary length: ${LONG_CV.summary.length} chars`)

  const classicLong = await generatePDF(LONG_CV, DEMO_RAW_TEXT, 'classic')
  writeFileSync('/tmp/cv-long-classic.pdf', classicLong)
  console.log(`  Classic PDF: ${classicLong.byteLength} bytes → /tmp/cv-long-classic.pdf`)

  const modernLong = await generatePDF(LONG_CV, DEMO_RAW_TEXT, 'modern')
  writeFileSync('/tmp/cv-long-modern.pdf', modernLong)
  console.log(`  Modern PDF: ${modernLong.byteLength} bytes → /tmp/cv-long-modern.pdf`)

  console.log('\n✓ All PDFs generated. Open in Preview to inspect.\n')
}

main().catch((err) => { console.error('PDF generation failed:', err); process.exit(1) })
