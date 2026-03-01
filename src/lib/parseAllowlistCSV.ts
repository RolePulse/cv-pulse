// CV Pulse — Allowlist CSV Parser
// Epic 10 | Parses a CSV file of email addresses for the RolePulse allowlist.
//
// Accepts formats:
//   - Bare email list (one per line): john@example.com\njane@example.com
//   - CSV with header row: email\njohn@example.com\njane@example.com
//   - CSV with multiple columns (email in first column): john@example.com,John Smith,paid
//
// Always returns lowercase, trimmed, deduplicated emails.

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

// Header row patterns to skip
const HEADER_PATTERNS = /^(email|e-mail|emails|address|email address)$/i

/**
 * Parse a CSV string and extract valid email addresses.
 * Returns deduped, lowercase, trimmed email array.
 */
export function parseAllowlistCSV(csvText: string): string[] {
  const seen = new Set<string>()
  const emails: string[] = []

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    // Take first column only (handles multi-column CSVs)
    const rawCol = line.split(',')[0]
      .replace(/^["']|["']$/g, '') // strip surrounding quotes
      .trim()
      .toLowerCase()

    // Skip header rows
    if (HEADER_PATTERNS.test(rawCol)) continue

    // Validate and deduplicate
    if (EMAIL_RE.test(rawCol) && !seen.has(rawCol)) {
      seen.add(rawCol)
      emails.push(rawCol)
    }
  }

  return emails
}
