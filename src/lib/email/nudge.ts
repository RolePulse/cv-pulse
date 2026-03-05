/**
 * Weekly nudge email template for users whose CV score is below 70.
 * Plain HTML — no external templating library required.
 *
 * Usage:
 *   const { subject, html, text } = buildNudgeEmail({ ... })
 *   await resend.emails.send({ from, to, subject, html })
 */

import type { ChecklistItem } from '@/types/database'

const ROLE_LABELS: Record<string, string> = {
  sdr:        'SDR / BDR',
  ae:         'Account Executive',
  csm:        'Customer Success Manager',
  marketing:  'GTM Marketing',
  leadership: 'GTM Leadership',
  revops:     'Revenue Operations',
}

interface NudgeEmailParams {
  userName:   string | null
  targetRole: string
  score:      number
  topFixes:   ChecklistItem[]
  scoreUrl:   string       // full URL to /score?cvId=...
  settingsUrl: string      // full URL to /settings (unsubscribe)
}

export function buildNudgeEmail({
  userName,
  targetRole,
  score,
  topFixes,
  scoreUrl,
  settingsUrl,
}: NudgeEmailParams): { subject: string; html: string; text: string } {
  const greeting = userName ? `Hi ${userName.split(' ')[0]}` : 'Hi there'
  const roleLabel = ROLE_LABELS[targetRole] ?? targetRole
  const passGap  = 70 - score

  const subject = `Your ${roleLabel} CV is at ${score}/100 — ${passGap} points from the recruiter threshold`

  // ── Top fixes list ──────────────────────────────────────────────────────────
  const fixesHtml = topFixes.length
    ? topFixes.map((fix, i) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #F0EDE8; vertical-align: top;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="28" style="vertical-align: top; padding-top: 1px;">
                  <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center;
                    background: #FF6B00; color: #fff; border-radius: 50%; font-size: 11px; font-weight: 700;">
                    ${i + 1}
                  </span>
                </td>
                <td style="padding-left: 10px;">
                  <p style="margin: 0 0 3px 0; font-size: 14px; color: #222222; font-weight: 600;">
                    ${escapeHtml(fix.action)}
                  </p>
                  <p style="margin: 0; font-size: 12px; color: #888888;">
                    Up to +${fix.points} pts
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    ).join('')
    : `<tr><td style="padding: 10px 0; font-size: 14px; color: #888888;">
        Log back in to see your full checklist.
      </td></tr>`

  const fixesText = topFixes.length
    ? topFixes.map((fix, i) => `${i + 1}. ${fix.action} (up to +${fix.points} pts)`).join('\n')
    : 'Log back in to see your full checklist.'

  // ── HTML email ──────────────────────────────────────────────────────────────
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background: #FFF7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #FFF7F2; padding: 32px 0;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px;">

          <!-- Header -->
          <tr>
            <td style="padding: 0 0 24px 0;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <span style="display: inline-flex; align-items: center; gap: 8px;">
                      <span style="display: inline-block; width: 28px; height: 28px; background: #FF6B00;
                        border-radius: 7px; line-height: 28px; text-align: center; font-size: 15px;">⚡</span>
                      <span style="font-size: 15px; font-weight: 700; color: #222222;">CV Pulse</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background: #fff; border-radius: 10px; border: 1px solid #E8E0D8; padding: 32px;">

              <!-- Score badge -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 16px 0; font-size: 16px; color: #444444;">
                      ${greeting},
                    </p>
                    <p style="margin: 0 0 20px 0; font-size: 15px; color: #444444; line-height: 1.6;">
                      Your <strong>${escapeHtml(roleLabel)}</strong> CV is sitting at
                      <strong style="color: ${score >= 60 ? '#D97706' : '#DC2626'};">${score}/100</strong>.
                      The recruiter threshold is 70 — you're <strong>${passGap} points away</strong>.
                    </p>

                    <!-- Score bar -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
                      <tr>
                        <td style="background: #F0EDE8; border-radius: 6px; height: 8px; overflow: hidden;">
                          <div style="width: ${score}%; background: ${score >= 70 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626'};
                            height: 8px; border-radius: 6px;"></div>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                              <td style="font-size: 11px; color: #999999; padding-top: 4px;">0</td>
                              <td style="font-size: 11px; color: #16A34A; text-align: right; padding-top: 4px;">70 ✓ pass</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 600; color: #222222;">
                      ${topFixes.length > 0 ? `Here are the ${topFixes.length} quickest wins:` : 'Log back in to see your checklist:'}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Fixes list -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 28px;">
                ${fixesHtml}
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${scoreUrl}"
                       style="display: inline-block; background: #FF6B00; color: #fff; font-size: 15px;
                         font-weight: 600; text-decoration: none; padding: 13px 32px; border-radius: 7px;">
                      Fix my CV →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 0 0 0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #AAAAAA; line-height: 1.5;">
                You're receiving this because you uploaded a CV to
                <a href="https://cvpulse.io" style="color: #AAAAAA;">CV Pulse</a>.
                <a href="${settingsUrl}" style="color: #AAAAAA;">Manage preferences</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  // ── Plain text fallback ─────────────────────────────────────────────────────
  const text = `${greeting},

Your ${roleLabel} CV is at ${score}/100. The recruiter threshold is 70 — you're ${passGap} points away.

${topFixes.length > 0 ? `Here are the ${topFixes.length} quickest wins:\n\n${fixesText}` : fixesText}

Fix your CV → ${scoreUrl}

---
You're receiving this because you uploaded a CV to CV Pulse.
Manage preferences: ${settingsUrl}`

  return { subject, html, text }
}

// ── Utility ─────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
