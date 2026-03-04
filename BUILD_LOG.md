
---

## Bug Fix Session — 2026-03-02 ~13:00 GMT
**What was fixed:** 3 critical production bugs discovered during first user testing

### Bug 1 — Upload race condition (upload/page.tsx)
**Problem:** If the PDF parse + Supabase insert took >2100ms (any Vercel cold start), the UI animation finished before the fetch returned. The result-handling callback checked a stale React state variable (`step`) captured at function creation time, which was always 'idle' — so the check `step === 'ready'` was always false, and `handleResult` was never called. The user saw the loading bars frozen forever.

**Fix:** Restructured `handleSubmit` to use `Promise.all([doUpload(), animateSteps()])`. Both run in parallel, but we always wait for BOTH before handling the result. The animation is now purely decorative (always ~2.1s UX delay); the fetch result is always handled correctly regardless of timing.

### Bug 2 — Results page burning re-score credits on every load (score/route.ts)
**Problem:** The results page called `POST /api/cv/[id]/score` on every page load. The first POST was free (first score). The second POST incremented `free_rescores_used` to 1. The third POST returned a 402 paywall error — the user saw a paywall on their own results page after just 2 page loads.

**Fix:** Added idempotent view mode to the score API. POST without `X-Force-Rescore: true` header re-runs scoring in memory (deterministic, same result) and returns it WITHOUT creating a new DB row or touching usage. Only `X-Force-Rescore: true` (from the editor's re-score button) creates a new score row and increments usage.

### Bug 3 — Editor re-score not triggering paywall correctly (editor/page.tsx)
**Problem:** The editor's re-score fetch had no way to distinguish itself from the results page's initial load. After Bug 2 fix, needed the editor to explicitly opt into the "real re-score" path.

**Fix:** Editor re-score fetch now sends `X-Force-Rescore: true` header.

### Bonus: seed script TypeScript error (scripts/seed-test-cv.ts)
**Problem:** `scoreCV()` was called with 2 args but signature now requires 3 (`structured`, `rawText`, `targetRole`). Also used old lowercase TargetRole values.

**Fix:** Updated to pass `parsed.rawText` as 2nd arg, imported `TargetRole` type from `roleDetect.ts`, used uppercase role values ('AE' not 'ae').

**Files modified:** upload/page.tsx, api/cv/[id]/score/route.ts, editor/page.tsx, scripts/seed-test-cv.ts
**Tests:** 277 pass (no change — bugs were in UI/API layer, not lib)
**Build:** Clean
**Commit:** d47b9b6
**Deployed:** via git push to main (Vercel auto-deploy)
**Next step:** User testing with James — verify upload → results flow works end-to-end

---

## 2026-03-02 — Non-CV false-pass rejection

**Commit:** 48a395b
**Time:** ~17:13 GMT

### Problem
~8–15 non-CV documents (bank statements, invoices, payslips) were passing the confidence gate and going through scoring. Bank statements scored ~70+ because they have: text volume (20pts), a name (15pts), dates (20pts), and structured lines (20pts).

### Fix
Added two layers of negative signals to `calculateConfidence()` in `src/lib/parser.ts`, evaluated *before* any positive scoring:

**Hard-reject patterns (score → 0):** Match any of:
- bank statement, account statement, sort code, IBAN
- invoice no/number, amount due, total amount due
- remittance advice, BACS payment
- earnings statement, pay slip, payslip
- P60, P45, P11D
- account number: [6+ digits]

**Soft-signal density (score → 10):** 4+ co-occurring financial signals (balance, debit, credit, transactions, statement period, opening/closing balance, payment reference, overdrawn)

### Finance CVs still pass
CVs with financial roles ("balance sheet reconciliations", "credit risk models", "debit card products") tested explicitly — confirmed passing. Threshold avoidance: finance CVs rarely hit 4+ soft signals together and never contain hard-reject phrases.

### Tests
- New file: `src/lib/__tests__/non-cv-rejection.test.ts`
- 16 new tests (11 hard-reject, 2 soft-signal, 3 real-CV pass-through)
- Full suite: 793 tests, all passing

### Next step
James to do real-world user testing of CV Pulse v1.

---

## 2026-03-02 — Sign out fix

**Commit:** 1484199
**Time:** ~18:38 GMT

### Problem
Sign out link in `Header.tsx` used `href="/api/auth/signout"` — a NextAuth-style URL that doesn't exist. Clicking Sign out anywhere in the app 404'd, leaving users permanently signed in with no way to sign out.

### Fix
- Created `src/components/SignOutButton.tsx` — a `'use client'` component that calls `supabase.auth.signOut()` then redirects to `/` via `router.push` and `router.refresh()`
- Replaced the dead `<Link href="/api/auth/signout">` in `Header.tsx` with `<SignOutButton />`
- Tested live: Settings → Sign out → redirected to homepage → nav shows "Sign in" ✅

### Tests
793 tests, all passing (no new tests needed — sign out is auth infrastructure).

---

## 2026-03-03 — Merge results + editor into unified /score page (UX Review #1)

**Time:** ~18:00 GMT

### What changed

Biggest structural UX improvement: merged the separate `/results` and `/editor` pages into a single `/score` page.

**New files:**
- `src/app/score/page.tsx` — the unified "Score + Fix" page

**Updated files:**
- `src/components/ProgressIndicator.tsx` — simplified to 3 steps: Upload → Score & Fix → Export
- `src/app/select-role/page.tsx` — routes to `/score` instead of `/results`
- `src/app/api/auth/callback/route.ts` — fallback changed from `/results` to `/upload`

**Replaced with redirects (backwards compat):**
- `src/app/results/page.tsx` — redirects to `/score?cvId=...`
- `src/app/editor/page.tsx` — redirects to `/score?cvId=...`

### Layout

**Desktop (lg+):** Two-panel side by side
- Left (sticky, scrollable, w-80/96): Score ring, pass/fail badge, role label, context hint, bucket bars, Re-score button, full checklist accordion, keyword check (collapsed), share link
- Right (flex-1): Progress + save badge, quick fixes, placeholder reminder, CV editor (summary/experience/skills/education/certs), Export PDF button

**Mobile:** Stacked — score panel above, editor below

### Tests
793 tests, all passing. Zero TypeScript errors. Build clean.

---

## 2026-03-03 — Parser Fixes: Split Bullets, 4-Line Header, Ticker Stripping

**Date:** Tuesday 3 March 2026, ~19:11 GMT
**Commit:** 3ed7664

### What was fixed (5 issues)

**1. looksLikeLocation trailing whitespace**
- Added `\s*$` to regex — paranoia fix for any Unicode space not caught by `.trim()`

**2. Split bullets — lone • on its own line**
- PDFs like AvePoint and GovInvest emit each bullet in two lines: `•` alone, then content on the next line
- Added a preprocessing pass in `extractExperience()` that merges lone bullet char + next content line before the main parsing loop
- Guard: no merge if next line is a date, another lone bullet, or lone `o`

**3. `o` sub-bullets — Microsoft Word style**
- Same preprocessing pass handles `o` (lowercase) as a sub-bullet marker
- When merging a lone `o`, the result is prefixed with `•` so `isBulletLine()` fires correctly

**4. 4-line header — Company → Location → Title → Date (MongoDB pattern)**
- Added `rawEffective2` / `skip2` variables to detect when the "title" candidate is actually a location
- When `skip2=true`: `title = effective1`, `company = effective2` (stepped past the location)
- Previously this pattern would set title="New York, NY" and company="Senior Engineer" — completely swapped

**5. AvePoint — ticker/city noise in company line**
- New `cleanCompanyLine()` helper strips: ticker annotations `(Ticker: AVPT)` / `(NYSE: X)` and trailing `City, ST` location suffix (with or without leading comma)
- Applied when company is extracted from the prev-line search in "Title | Date" inline format

### Files changed
- `src/lib/parser.ts` — 5 targeted edits
- `src/lib/__tests__/parser-fixes-march2026.test.ts` — 12 new regression tests (new file)

### Tests
805 tests, all passing (was 793 — +12 new). Zero TypeScript errors. Build clean.

### Next
James to re-upload AvePoint, GovInvest, MongoDB CVs to verify live parsing.

---

## 2026-03-03 — Parser Fixes: Title-Inline Format + Bullet Continuation (commit 99c2bf5)

**Date:** Tuesday 3 March 2026, ~19:50 GMT
**Verified against:** AJ Gilosa Resume.pdf (real CV — not synthetic fixtures)

### What was wrong

All 5 non-MongoDB roles (AvePoint, GovInvest, Ya y P a y, Brocair Partners, Ridgetop Research) had:
- Title and company **completely swapped** — "Enterprise Account Executive" was set as company, the actual company name as title
- Bullet **continuations dropped** — wrapped lines ("the USA", "High Ranking IT Leaders...", "develop Go-to-market strategy") were silently discarded
- MongoDB ticker "(Ticker: MDB)" not stripped from company name

### Root causes + fixes

**1. Title-inline format (no pipe separator)**
- Format: "Enterprise Account Executive Dec 2020 - Aug 2024" with company on line above
- Parser assumed inline text = company. Added `TITLE_KEYWORD_RE` to detect job titles inline.
- New `else if (title && !company)` branch finds company from prev lines, handles both standalone company lines and "Company City, State" combined lines

**2. Bullet continuation merging**
- Long bullets wrap across 2 lines in PDF: "...involving multiple\nHigh Ranking IT Leaders..."
- Old code: filter-only pass, dropped all non-bullet lines
- New code: loop that appends continuation lines when: starts lowercase/special char OR prev ends mid-word; blocked when line has mid-string "(" (company ticker indicator)

**3. cleanCompanyLine regex fix**
- Regex `(?:\s+[A-Z][a-zA-Z]+)*` was unlimited — stripped "Partners" from "Brocair Partners"
- Changed to `?` (max one optional extra city word): "Brocair Partners New York, NY" → "Brocair Partners"

**4. cleanCompanyLine in 4-line header path**
- MongoDB role: company was set to "MongoDB (Ticker: MDB)" without cleaning
- Now applies cleanCompanyLine to effective2 in the skip2 branch

### Tool built
`scripts/inspect-parse.ts` — runs a real PDF through the parser and shows raw text, parsed roles, and a bullet coverage check. Use this for all future parser verification.

### Tests
806 tests, all passing. Zero TypeScript errors.
