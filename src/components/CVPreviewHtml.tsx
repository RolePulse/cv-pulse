'use client'

import { useEffect, useRef, useState } from 'react'
import type { StructuredCV, ExperienceRole } from '@/types/database'

// ── Contact extraction (mirrors pdfTemplates/index.tsx) ──────────────────────

interface ContactInfo {
  name: string
  email: string
  phone: string
  linkedin: string
  location: string
}

function extractContactInfo(rawText: string): ContactInfo {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)

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

  const emailMatch = rawText.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/)
  const email = emailMatch?.[0] ?? ''

  const linkedinMatch =
    rawText.match(/linkedin\.com\/in\/[\w\-]+/i) ??
    rawText.match(/\/in\/([\w\-]{3,})/)
  const linkedin = linkedinMatch
    ? linkedinMatch[0].replace(/^\/in\//, 'linkedin.com/in/')
    : ''

  const phoneMatch = rawText.match(/[\+]?[\d][\d\s\-().]{8,14}[\d]/)
  const phone = phoneMatch?.[0]?.trim() ?? ''

  const headerBlock = lines.slice(0, 15).join(' ')
  const locationMatch = headerBlock.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:[A-Z]{2,3}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))\b/
  )
  const location = locationMatch?.[1] ?? ''

  return { name, email, phone, linkedin, location }
}

function buildContactLine(contact: ContactInfo): string {
  return [contact.email, contact.phone, contact.location, contact.linkedin]
    .filter(Boolean)
    .join('  ·  ')
}

function formatDateRange(role: ExperienceRole): string {
  const fmt = (d: string | null | undefined) => {
    if (!d) return ''
    const s = d.trim()
    if (!s || s.toLowerCase() === 'null') return ''
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  const start = fmt(role.start)
  const end = role.end ? fmt(role.end) : 'Present'
  if (!start) return end
  return `${start} – ${end}`
}

// ── Templates ─────────────────────────────────────────────────────────────────

function ClassicPreview({ structured, contact }: { structured: StructuredCV; contact: ContactInfo }) {
  const contactLine = buildContactLine(contact)

  return (
    <div style={{
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: '9px',
      color: '#222222',
      lineHeight: 1.4,
      paddingTop: '44px',
      paddingBottom: '44px',
      paddingLeft: '48px',
      paddingRight: '48px',
      background: '#fff',
      minHeight: '1123px',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '10px', borderBottom: '1px solid #CCCCCC', paddingBottom: '8px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#111111', marginBottom: '3px' }}>
          {contact.name || 'Your Name'}
        </div>
        {contactLine && (
          <div style={{ fontSize: '8.5px', color: '#555555' }}>{contactLine}</div>
        )}
      </div>

      {/* Summary */}
      {structured.summary?.trim() && (
        <Section heading="Summary" classic>
          <p style={{ fontSize: '9px', color: '#333333', margin: 0, lineHeight: 1.5 }}>
            {structured.summary.trim()}
          </p>
        </Section>
      )}

      {/* Experience */}
      {structured.experience?.length > 0 && (
        <Section heading="Experience" classic>
          {structured.experience.map((role, i) => (
            <div key={i} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1px' }}>
                <span style={{ fontWeight: 700, fontSize: '9px', color: '#111111', flex: 1, paddingRight: '8px' }}>{role.title}</span>
                <span style={{ fontSize: '8.5px', color: '#666666', whiteSpace: 'nowrap' }}>{formatDateRange(role)}</span>
              </div>
              {role.company && (
                <div style={{ fontSize: '8.5px', color: '#555555', fontStyle: 'italic', marginBottom: '3px' }}>{role.company}</div>
              )}
              {role.bullets?.map((bullet, j) => (
                <div key={j} style={{ display: 'flex', marginBottom: '2px', paddingLeft: '4px' }}>
                  <span style={{ width: '10px', fontSize: '9px', color: '#444444', flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: '9px', color: '#333333', flex: 1 }}>{bullet}</span>
                </div>
              ))}
            </div>
          ))}
        </Section>
      )}

      {/* Skills */}
      {structured.skills?.length > 0 && (
        <Section heading="Skills" classic>
          <p style={{ fontSize: '9px', color: '#333333', margin: 0, lineHeight: 1.5 }}>
            {structured.skills.join('  ·  ')}
          </p>
        </Section>
      )}

      {/* Education */}
      {structured.education?.length > 0 && (
        <Section heading="Education" classic>
          {structured.education.map((edu, i) => (
            <div key={i} style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: '9px' }}>{edu.institution}</span>
                {edu.year && <span style={{ fontSize: '8.5px', color: '#666666' }}>{edu.year}</span>}
              </div>
              {edu.qualification && (
                <div style={{ fontSize: '8.5px', color: '#555555', fontStyle: 'italic' }}>{edu.qualification}</div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Certifications */}
      {structured.certifications?.length > 0 && (
        <Section heading="Certifications" classic>
          {structured.certifications.map((cert, i) => (
            <div key={i} style={{ fontSize: '9px', color: '#333333', marginBottom: '2px' }}>• {cert}</div>
          ))}
        </Section>
      )}
    </div>
  )
}

function ModernPreview({ structured, contact }: { structured: StructuredCV; contact: ContactInfo }) {
  const contactLine = buildContactLine(contact)
  const ORANGE = '#FF6B00'
  const DARK = '#1A1A1A'
  const MUTED = '#666666'

  return (
    <div style={{
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: '9px',
      color: DARK,
      lineHeight: 1.45,
      paddingTop: '48px',
      paddingBottom: '48px',
      paddingLeft: '50px',
      paddingRight: '50px',
      background: '#fff',
      minHeight: '1123px',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '22px', fontWeight: 700, color: ORANGE, marginBottom: '4px', letterSpacing: '-0.3px' }}>
          {contact.name || 'Your Name'}
        </div>
        {contactLine && (
          <div style={{ fontSize: '8.5px', color: MUTED }}>{contactLine}</div>
        )}
      </div>

      {/* Orange divider */}
      <div style={{ borderBottom: `1.5px solid ${ORANGE}`, marginBottom: '12px' }} />

      {/* Summary */}
      {structured.summary?.trim() && (
        <Section heading="Summary" orange>
          <p style={{ fontSize: '9px', color: '#333333', margin: 0, lineHeight: 1.55 }}>
            {structured.summary.trim()}
          </p>
        </Section>
      )}

      {/* Experience */}
      {structured.experience?.length > 0 && (
        <Section heading="Experience" orange>
          {structured.experience.map((role, i) => (
            <div key={i} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1px' }}>
                <span style={{ fontWeight: 700, fontSize: '9.5px', color: DARK, flex: 1, paddingRight: '8px' }}>{role.title}</span>
                <span style={{ fontSize: '8.5px', color: MUTED, whiteSpace: 'nowrap' }}>{formatDateRange(role)}</span>
              </div>
              {role.company && (
                <div style={{ fontSize: '8.5px', color: MUTED, marginBottom: '4px' }}>{role.company}</div>
              )}
              {role.bullets?.map((bullet, j) => (
                <div key={j} style={{ display: 'flex', marginBottom: '2.5px', paddingLeft: '2px' }}>
                  <span style={{ width: '10px', fontSize: '9px', color: ORANGE, flexShrink: 0 }}>–</span>
                  <span style={{ fontSize: '9px', color: '#333333', flex: 1 }}>{bullet}</span>
                </div>
              ))}
            </div>
          ))}
        </Section>
      )}

      {/* Skills */}
      {structured.skills?.length > 0 && (
        <Section heading="Skills" orange>
          <p style={{ fontSize: '9px', color: '#333333', margin: 0, lineHeight: 1.6 }}>
            {structured.skills.join('  ·  ')}
          </p>
        </Section>
      )}

      {/* Education */}
      {structured.education?.length > 0 && (
        <Section heading="Education" orange>
          {structured.education.map((edu, i) => (
            <div key={i} style={{ marginBottom: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: '9px', color: DARK }}>{edu.institution}</span>
                {edu.year && <span style={{ fontSize: '8.5px', color: MUTED }}>{edu.year}</span>}
              </div>
              {edu.qualification && (
                <div style={{ fontSize: '8.5px', color: MUTED }}>{edu.qualification}</div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Certifications */}
      {structured.certifications?.length > 0 && (
        <Section heading="Certifications" orange>
          {structured.certifications.map((cert, i) => (
            <div key={i} style={{ fontSize: '9px', color: '#333333', marginBottom: '2.5px' }}>– {cert}</div>
          ))}
        </Section>
      )}
    </div>
  )
}

// ── Shared section wrapper ────────────────────────────────────────────────────

function Section({
  heading,
  children,
  classic,
  orange,
}: {
  heading: string
  children: React.ReactNode
  classic?: boolean
  orange?: boolean
}) {
  const headingStyle: React.CSSProperties = classic
    ? {
        fontSize: '8px',
        fontWeight: 700,
        color: '#222222',
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        borderBottom: '0.75px solid #BBBBBB',
        paddingBottom: '2px',
        marginBottom: '6px',
        marginTop: 0,
      }
    : {
        fontSize: '7.5px',
        fontWeight: 700,
        color: '#FF6B00',
        textTransform: 'uppercase',
        letterSpacing: '1.2px',
        borderBottom: '1px solid #FF6B00',
        paddingBottom: '2px',
        marginBottom: '7px',
        marginTop: 0,
      }

  return (
    <div style={{ marginBottom: classic ? '9px' : '10px' }}>
      <div style={headingStyle}>{heading}</div>
      {children}
    </div>
  )
}

// ── Scaled preview wrapper ────────────────────────────────────────────────────

interface CVPreviewHtmlProps {
  structured: StructuredCV
  rawText: string
  template: 'classic' | 'modern'
  /** Height of the visible preview window in px. Default: 280 */
  previewHeight?: number
}

export default function CVPreviewHtml({
  structured,
  rawText,
  template,
  previewHeight = 280,
}: CVPreviewHtmlProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const update = () => {
      if (containerRef.current) {
        setScale(containerRef.current.offsetWidth / 794)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const contact = extractContactInfo(rawText)

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: `${previewHeight}px`,
        overflow: 'hidden',
        background: '#fff',
        borderRadius: '2px',
      }}
    >
      {scale === null ? (
        // Skeleton while measuring
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
          <div style={{ height: '14px', background: '#E5E5E5', borderRadius: '3px', width: '45%' }} />
          <div style={{ height: '8px', background: '#F0F0F0', borderRadius: '3px', width: '65%' }} />
          <div style={{ height: '1px', background: '#DDDDDD', margin: '4px 0' }} />
          <div style={{ height: '8px', background: '#E5E5E5', borderRadius: '3px', width: '20%' }} />
          <div style={{ height: '8px', background: '#F0F0F0', borderRadius: '3px', width: '55%' }} />
          <div style={{ height: '8px', background: '#F0F0F0', borderRadius: '3px', width: '40%' }} />
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '794px',
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {template === 'classic'
            ? <ClassicPreview structured={structured} contact={contact} />
            : <ModernPreview structured={structured} contact={contact} />
          }
        </div>
      )}
    </div>
  )
}
