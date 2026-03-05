// CV Pulse — PDF Template Generator
// Epic 11 | Server-side only. Never import in client components.
//
// Two templates: 'classic' and 'modern'
// Both: single column, ATS-safe, Helvetica, no tables, no images.
//
// Usage:
//   const pdfBytes = await generatePDF(structuredCV, rawText, 'classic')
//   // returns Uint8Array — pipe as application/pdf response

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { StructuredCV, ExperienceRole, EducationEntry } from '@/types/database'

export type PDFTemplate = 'classic' | 'modern'

// ─── Contact extraction from raw text ────────────────────────────────────────

interface ContactInfo {
  name: string
  email: string
  phone: string
  linkedin: string
  location: string
}

function extractContactInfo(rawText: string): ContactInfo {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)

  // Name: first line that looks like a name (no @, no http, no leading digit, reasonable length)
  const name =
    lines.find(
      (l) =>
        l.length >= 3 &&
        l.length <= 60 &&
        !l.includes('@') &&
        !l.includes('http') &&
        !/^\d/.test(l) &&
        !/[|•●▪▸]/.test(l) &&
        l.split(/\s+/).length <= 5
    ) ?? ''

  // Email
  const emailMatch = rawText.match(
    /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/
  )
  const email = emailMatch?.[0] ?? ''

  // LinkedIn — match linkedin.com/in/handle or /in/handle
  const linkedinMatch =
    rawText.match(/linkedin\.com\/in\/[\w\-]+/i) ??
    rawText.match(/\/in\/([\w\-]{3,})/)
  const linkedin = linkedinMatch
    ? linkedinMatch[0].replace(/^\/in\//, 'linkedin.com/in/')
    : ''

  // Phone — 10–16 digit pattern, optional +
  const phoneMatch = rawText.match(/[\+]?[\d][\d\s\-().]{8,14}[\d]/)
  const phone = phoneMatch?.[0]?.trim() ?? ''

  // Location — "City, State/Country" pattern in first 15 lines
  const headerBlock = lines.slice(0, 15).join(' ')
  const locationMatch = headerBlock.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:[A-Z]{2,3}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))\b/
  )
  const location = locationMatch?.[1] ?? ''

  return { name, email, phone, linkedin, location }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function buildContactParts(contact: ContactInfo): string[] {
  const parts: string[] = []
  if (contact.email) parts.push(contact.email)
  if (contact.phone) parts.push(contact.phone)
  if (contact.location) parts.push(contact.location)
  if (contact.linkedin) parts.push(contact.linkedin)
  return parts
}

function formatDate(d: string | null | undefined): string {
  if (!d) return ''
  const s = d.trim()
  if (s === '' || s.toLowerCase() === 'null') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDateRange(role: ExperienceRole): string {
  const start = formatDate(role.start)
  const end = role.end ? formatDate(role.end) : 'Present'
  if (!start) return end
  return `${start} – ${end}`
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 1 — CLEAN CLASSIC
// Professional, ATS-safe, black/grey palette, Helvetica.
// ─────────────────────────────────────────────────────────────────────────────

const classicStyles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#222222',
    paddingTop: 44,
    paddingBottom: 44,
    paddingLeft: 48,
    paddingRight: 48,
    lineHeight: 1.4,
  },
  // Header
  header: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#CCCCCC',
    paddingBottom: 8,
  },
  name: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#111111',
    marginBottom: 3,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  contactPart: {
    fontSize: 8.5,
    color: '#555555',
    marginRight: 10,
  },
  // Sections
  section: {
    marginBottom: 9,
  },
  sectionHeading: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#222222',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    borderBottomWidth: 0.75,
    borderBottomColor: '#BBBBBB',
    paddingBottom: 2,
    marginBottom: 6,
  },
  // Experience
  roleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  roleTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: '#111111',
    flex: 1,
  },
  roleDates: {
    fontSize: 8.5,
    color: '#666666',
    textAlign: 'right',
  },
  roleCompany: {
    fontSize: 8.5,
    color: '#555555',
    marginBottom: 3,
    fontFamily: 'Helvetica-Oblique',
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 10,
    fontSize: 9,
    color: '#444444',
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    color: '#333333',
  },
  roleBlock: {
    marginBottom: 8,
  },
  // Skills
  skillsText: {
    fontSize: 9,
    color: '#333333',
    lineHeight: 1.5,
  },
  // Education / certs
  eduBlock: {
    marginBottom: 4,
  },
  eduRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eduInstitution: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  eduYear: {
    fontSize: 8.5,
    color: '#666666',
  },
  eduQual: {
    fontSize: 8.5,
    color: '#555555',
    fontFamily: 'Helvetica-Oblique',
  },
  certItem: {
    fontSize: 9,
    color: '#333333',
    marginBottom: 2,
  },
  summary: {
    fontSize: 9,
    color: '#333333',
    lineHeight: 1.5,
  },
})

function ClassicTemplate({
  structured,
  contact,
}: {
  structured: StructuredCV
  contact: ContactInfo
}) {
  const contactParts = buildContactParts(contact)

  return (
    <Document>
      <Page size="A4" style={classicStyles.page}>
        {/* Header */}
        <View style={classicStyles.header}>
          <Text style={classicStyles.name}>{contact.name || 'Your Name'}</Text>
          <View style={classicStyles.contactRow}>
            {contactParts.map((part, i) => (
              <Text key={i} style={classicStyles.contactPart}>
                {part}{i < contactParts.length - 1 ? '  ·  ' : ''}
              </Text>
            ))}
          </View>
        </View>

        {/* Summary */}
        {structured.summary?.trim() && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionHeading} minPresenceAhead={80}>Summary</Text>
            <Text style={classicStyles.summary}>{structured.summary.trim()}</Text>
          </View>
        )}

        {/* Experience */}
        {structured.experience?.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionHeading} minPresenceAhead={80}>Experience</Text>
            {structured.experience.map((role, i) => (
              <View key={i} style={classicStyles.roleBlock} wrap={false}>
                <View style={classicStyles.roleHeader}>
                  <Text style={classicStyles.roleTitle}>{role.title}</Text>
                  <Text style={classicStyles.roleDates}>{formatDateRange(role)}</Text>
                </View>
                {role.company && (
                  <Text style={classicStyles.roleCompany}>{role.company}</Text>
                )}
                {role.bullets?.map((bullet, j) => (
                  <View key={j} style={classicStyles.bullet}>
                    <Text style={classicStyles.bulletDot}>•</Text>
                    <Text style={classicStyles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {structured.skills?.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionHeading} minPresenceAhead={80}>Skills</Text>
            <Text style={classicStyles.skillsText}>
              {structured.skills.join('  ·  ')}
            </Text>
          </View>
        )}

        {/* Education */}
        {structured.education?.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionHeading} minPresenceAhead={80}>Education</Text>
            {structured.education.map((edu, i) => (
              <View key={i} style={classicStyles.eduBlock}>
                <View style={classicStyles.eduRow}>
                  <Text style={classicStyles.eduInstitution}>{edu.institution}</Text>
                  {edu.year && <Text style={classicStyles.eduYear}>{edu.year}</Text>}
                </View>
                {edu.qualification && (
                  <Text style={classicStyles.eduQual}>{edu.qualification}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Certifications */}
        {structured.certifications?.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionHeading} minPresenceAhead={80}>Certifications</Text>
            {structured.certifications.map((cert, i) => (
              <Text key={i} style={classicStyles.certItem}>• {cert}</Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 2 — MODERN MINIMAL
// Contemporary, CV Pulse brand accent (#FF6B00), clean whitespace.
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_ORANGE = '#FF6B00'
const DARK = '#1A1A1A'
const MUTED = '#666666'

const modernStyles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 50,
    paddingRight: 50,
    lineHeight: 1.45,
  },
  // Header
  header: {
    marginBottom: 12,
  },
  name: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_ORANGE,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  contactPart: {
    fontSize: 8.5,
    color: MUTED,
    marginRight: 12,
  },
  divider: {
    borderBottomWidth: 1.5,
    borderBottomColor: BRAND_ORANGE,
    marginBottom: 12,
    marginTop: 0,
  },
  // Sections
  section: {
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_ORANGE,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    borderBottomWidth: 1,
    borderBottomColor: BRAND_ORANGE,
    paddingBottom: 2,
    marginBottom: 7,
  },
  // Experience
  roleBlock: {
    marginBottom: 9,
  },
  roleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  roleTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    color: DARK,
    flex: 1,
  },
  roleDates: {
    fontSize: 8.5,
    color: MUTED,
    textAlign: 'right',
  },
  roleCompany: {
    fontSize: 8.5,
    color: MUTED,
    marginBottom: 4,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 2.5,
    paddingLeft: 2,
  },
  bulletDash: {
    width: 10,
    fontSize: 9,
    color: BRAND_ORANGE,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    color: '#333333',
  },
  // Skills
  skillsText: {
    fontSize: 9,
    color: '#333333',
    lineHeight: 1.6,
  },
  // Education
  eduBlock: {
    marginBottom: 5,
  },
  eduRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eduInstitution: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: DARK,
  },
  eduYear: {
    fontSize: 8.5,
    color: MUTED,
  },
  eduQual: {
    fontSize: 8.5,
    color: MUTED,
  },
  certItem: {
    fontSize: 9,
    color: '#333333',
    marginBottom: 2.5,
  },
  summary: {
    fontSize: 9,
    color: '#333333',
    lineHeight: 1.55,
  },
})

function ModernTemplate({
  structured,
  contact,
}: {
  structured: StructuredCV
  contact: ContactInfo
}) {
  const contactParts = buildContactParts(contact)

  return (
    <Document>
      <Page size="A4" style={modernStyles.page}>
        {/* Header */}
        <View style={modernStyles.header}>
          <Text style={modernStyles.name}>{contact.name || 'Your Name'}</Text>
          <View style={modernStyles.contactRow}>
            {contactParts.map((part, i) => (
              <Text key={i} style={modernStyles.contactPart}>
                {part}{i < contactParts.length - 1 ? ' · ' : ''}
              </Text>
            ))}
          </View>
        </View>

        {/* Orange divider line */}
        <View style={modernStyles.divider} />

        {/* Summary */}
        {structured.summary?.trim() && (
          <View style={modernStyles.section}>
            <Text style={modernStyles.sectionHeading} minPresenceAhead={80}>Summary</Text>
            <Text style={modernStyles.summary}>{structured.summary.trim()}</Text>
          </View>
        )}

        {/* Experience */}
        {structured.experience?.length > 0 && (
          <View style={modernStyles.section}>
            <Text style={modernStyles.sectionHeading} minPresenceAhead={80}>Experience</Text>
            {structured.experience.map((role, i) => (
              <View key={i} style={modernStyles.roleBlock} wrap={false}>
                <View style={modernStyles.roleHeader}>
                  <Text style={modernStyles.roleTitle}>{role.title}</Text>
                  <Text style={modernStyles.roleDates}>{formatDateRange(role)}</Text>
                </View>
                {role.company && (
                  <Text style={modernStyles.roleCompany}>{role.company}</Text>
                )}
                {role.bullets?.map((bullet, j) => (
                  <View key={j} style={modernStyles.bullet}>
                    <Text style={modernStyles.bulletDash}>–</Text>
                    <Text style={modernStyles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {structured.skills?.length > 0 && (
          <View style={modernStyles.section}>
            <Text style={modernStyles.sectionHeading} minPresenceAhead={80}>Skills</Text>
            <Text style={modernStyles.skillsText}>
              {structured.skills.join('  ·  ')}
            </Text>
          </View>
        )}

        {/* Education */}
        {structured.education?.length > 0 && (
          <View style={modernStyles.section}>
            <Text style={modernStyles.sectionHeading} minPresenceAhead={80}>Education</Text>
            {structured.education.map((edu, i) => (
              <View key={i} style={modernStyles.eduBlock}>
                <View style={modernStyles.eduRow}>
                  <Text style={modernStyles.eduInstitution}>{edu.institution}</Text>
                  {edu.year && <Text style={modernStyles.eduYear}>{edu.year}</Text>}
                </View>
                {edu.qualification && (
                  <Text style={modernStyles.eduQual}>{edu.qualification}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Certifications */}
        {structured.certifications?.length > 0 && (
          <View style={modernStyles.section}>
            <Text style={modernStyles.sectionHeading} minPresenceAhead={80}>Certifications</Text>
            {structured.certifications.map((cert, i) => (
              <Text key={i} style={modernStyles.certItem}>– {cert}</Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a PDF from a structured CV.
 * Returns a Buffer containing the PDF bytes.
 * Server-side only — @react-pdf/renderer is excluded from client bundles.
 */
export async function generatePDF(
  structured: StructuredCV,
  rawText: string,
  template: PDFTemplate,
): Promise<Buffer> {
  const contact = extractContactInfo(rawText)

  // Call template functions directly — they are pure (no hooks) so this is safe.
  // The cast is needed because TS cannot infer that FunctionComponentElement
  // wraps a <Document> element, which is what renderToBuffer requires.
  const element =
    template === 'classic'
      ? ClassicTemplate({ structured, contact })
      : ModernTemplate({ structured, contact })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any)
}
