// CV Pulse — Reconstruct plain text from structured CV JSON
// Used after in-app edits so re-scoring always runs on the edited content.
// Must match the format expected by parseText() in parser.ts.

import type { StructuredCV } from '@/types/database'

export function structuredToRawText(s: StructuredCV): string {
  const lines: string[] = []

  // SUMMARY heading required — parser ignores text before the first detected section heading
  if (s.summary?.trim()) {
    lines.push('SUMMARY')
    lines.push(s.summary.trim())
    lines.push('')
  }

  if (s.experience?.length) {
    lines.push('EXPERIENCE')
    for (const role of s.experience) {
      // Title on its own line — parser reads the line ABOVE the date-bearing line as the job title
      if (role.title?.trim()) lines.push(role.title.trim())
      // Company | Date range on the next line — parser anchors role extraction on the date here
      const datePart = [role.start, role.end ?? 'Present'].filter(Boolean).join(' – ')
      lines.push([role.company, datePart].filter(Boolean).join(' | '))
      for (const bullet of role.bullets) {
        if (bullet.trim()) lines.push(`• ${bullet.trim()}`)
      }
      lines.push('')
    }
  }

  if (s.skills?.length) {
    lines.push('SKILLS')
    lines.push(s.skills.filter(Boolean).join(', '))
    lines.push('')
  }

  if (s.education?.length) {
    lines.push('EDUCATION')
    for (const edu of s.education) {
      lines.push([edu.qualification, edu.institution, edu.year].filter(Boolean).join(' | '))
    }
    lines.push('')
  }

  if (s.certifications?.length) {
    lines.push('CERTIFICATIONS')
    for (const cert of s.certifications) {
      if (cert.trim()) lines.push(cert.trim())
    }
  }

  return lines.join('\n').trim()
}
