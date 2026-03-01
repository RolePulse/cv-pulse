import { parseText } from '../src/lib/parser'
import type { StructuredCV } from '../src/types/database'

function structuredToRawText(s: StructuredCV): string {
  const lines: string[] = []

  if (s.summary?.trim()) {
    lines.push('SUMMARY')
    lines.push(s.summary.trim())
    lines.push('')
  }

  if (s.experience?.length) {
    lines.push('EXPERIENCE')
    for (const role of s.experience) {
      // Title on its own line — parser reads the line ABOVE the date-bearing line as title
      if (role.title?.trim()) lines.push(role.title.trim())
      // Company | Date range on one line — parser anchors on the date here
      const datePart = [role.start, role.end ?? 'Present'].filter(Boolean).join(' – ')
      lines.push([role.company, datePart].filter(Boolean).join(' | '))
      for (const b of role.bullets) lines.push(`• ${b}`)
      lines.push('')
    }
  }

  if (s.skills?.length) { lines.push('SKILLS'); lines.push(s.skills.join(', ')); lines.push('') }
  return lines.join('\n').trim()
}

const cv: StructuredCV = {
  summary: 'Senior Customer Success Manager with 6 years in SaaS. Focus on retention.',
  experience: [
    { company: 'Acme SaaS', title: 'Senior Customer Success Manager', start: 'Jan 2021', end: 'Present',
      bullets: ['Maintained 96% retention across $3.2M ARR', 'Reduced churn by 18% via Gainsight'] },
    { company: 'StartupCo', title: 'Customer Success Manager', start: 'Mar 2019', end: 'Dec 2020',
      bullets: ['Managed 60 SMB accounts with NPS of 52', 'Reduced time-to-value by 30%'] },
  ],
  skills: ['Gainsight', 'Salesforce', 'NPS', 'Retention'],
  education: [{ institution: 'University of Bath', qualification: 'BSc Business', year: '2017' }],
  certifications: []
}

const raw = `Jane Smith jane.smith@email.com linkedin.com/in/janesmith London UK\n${structuredToRawText(cv)}`
console.log('=== RAW TEXT ===')
console.log(raw)
console.log('\n=== PARSED ===')
const p = parseText(raw)
console.log('confidence:', p.confidence)
console.log('summary length:', p.structured.summary.length, '| value:', JSON.stringify(p.structured.summary.slice(0, 60)))
console.log('experience count:', p.structured.experience.length)
p.structured.experience.forEach((r, i) => {
  console.log(`  role[${i}]: title="${r.title}" company="${r.company}" start="${r.start}" bullets=${r.bullets.length}`)
})
console.log('skills:', p.structured.skills)
