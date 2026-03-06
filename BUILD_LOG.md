
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

---

## 2026-03-04 18:28 GMT — Fix #6: Add summary when missing (commit ef0e24d)

### What was built
- Summary section in EditorPanel always renders, even when `cv.summary` is empty or undefined
- Amber nudge card shown when summary is missing: "No summary detected — add one below to unlock up to +5 pts"
- Scorer guarded against undefined summary (two `?? ''` guards added)

### Files changed
- `src/app/score/page.tsx` — removed `cv.summary !== undefined` guard; nudge card added with condition `!cv.summary?.trim()`; textarea value uses `cv.summary ?? ''`
- `src/lib/scorer.ts` — `structured.summary.toLowerCase()` → `(structured.summary ?? '').toLowerCase()`; `structured.summary.trim().length` → `(structured.summary ?? '').trim().length`

### Decisions
- Amber/yellow nudge colour chosen (matching placeholder reminder style) — subtle but clear
- Summary card always present so users know the field exists even if parser missed it
- Nudge dismisses naturally when user types and re-scores (no manual dismiss needed)

### Test results
- 807/807 tests passing
- Browser tested ✅: loaded test CV with summary blanked in DB, confirmed amber nudge visible + section renders; score correctly dropped from 55→50 with missing summary, confirming scorer guard works
- Restored test CV summary after verification

### Next step
Fix #8 — back navigation on export / JD match / settings pages

---

## 2026-03-04 18:34 GMT — Fix #8: Back navigation on export/JD match/settings (commit b0fe7c0)

### What was built
- JD Match page: "← Back to score" link at top. Links to `/score?cvId=X` when cvId is available; falls back to `/upload`
- Settings page: "← Back" button using `router.back()`
- Export page: already has ProgressIndicator with completed steps as clickable links (confirmed working)

### Files changed
- `src/app/jd-match/page.tsx` — added `Link` import; added back link above h1
- `src/app/settings/page.tsx` — added back button above h1 using router.back()

### Decisions
- JD Match uses a direct link (not router.back()) so the URL is predictable and correct even if user navigated there from a different entry point
- Settings uses router.back() since there's no cvId context — appropriate for a utility page

### Test results
- 807/807 tests passing
- Browser tested ✅: JD Match and Settings back links verified visually; Export ProgressIndicator confirmed working

### Next step
Fix #9 — landing page social proof

---

## 2026-03-04 18:37 GMT — Fix #9: Landing page social proof (commit 74d42e5)

### What was built
- Hero pill: "From the team behind RolePulse" (was "Built for GTM professionals")
- Role pills row: SDR/BDR · Account Executive · CSM · GTM Marketing · RevOps — below the subheadline
- Trust strip (3 cards): 1,600+ subscribers / GTM-specific / Deterministic scoring

### Files changed
- `src/app/page.tsx` — hero pill updated, role pills added, trust strip section added

### Decisions
- Used real number (1,600+ subscribers) not inflated — honest social proof
- "Deterministic scoring — same CV, same score, every time. No AI guesswork" is the key differentiator vs ChatGPT
- Trust strip placed between hero and feature cards so it's visible before the user scrolls
- RolePulse link is orange (brand accent) in the pill to reinforce the connection

### Test results
- 807/807 tests passing
- Browser tested ✅: full page screenshot confirmed all 3 sections render correctly

### Next step
Fix #10 — upgrade path

---

## 2026-03-04 18:43 GMT — Fix #10: Upgrade path (commit 66fb7f8)

### What was built
- `/upgrade` page: Free vs Pro pricing cards, RolePulse member note, "Get early access" CTA (with Stripe URL env var hook), back link, questions email
- `PaywallModal.tsx`: removed `alert('Stripe coming soon')` — now routes to `/upgrade` via `router.push`
- `settings/page.tsx`: "Upgrade →" orange pill link next to "Plan: Free" for free users

### Files changed
- `src/app/upgrade/page.tsx` — new file
- `src/components/PaywallModal.tsx` — replace alert with router.push('/upgrade')
- `src/app/settings/page.tsx` — upgrade pill for free users

### Decisions
- CTA button text is "Get early access →" when NEXT_PUBLIC_STRIPE_CHECKOUT_URL is not set; switches to "Upgrade now →" when it is — no code change needed when James sets up Stripe
- Fallback CTA opens mailto:hello@cvpulse.io with pre-filled subject
- "Pro launching soon — we'll be in touch" shown below CTA when no Stripe URL set — honest messaging
- RolePulse paid member path explained on the page

### How to activate Stripe
1. Create a Stripe Payment Link in dashboard
2. Add `NEXT_PUBLIC_STRIPE_CHECKOUT_URL=https://buy.stripe.com/...` to Vercel env vars
3. Redeploy — button text and link update automatically

### Test results
- 807/807 tests passing
- Browser tested ✅: /upgrade full page verified, Settings upgrade pill verified

### ALL PRE-LAUNCH UX ITEMS COMPLETE ✅ (fixes #1–#10)

---

## 2026-03-04 18:53 GMT — Fix #11: Parser — multiple roles under one company header (commit 770cba6)

### Root cause
"Title | Date" branch only checked `prev1`/`prev2` (2 lines back) for the company name. CVs with multiple roles under one company header had the company 5-6 lines back, separated by bullets and a date-range line. Result: continuation roles had `company = ""`.

### Fix
Extended lookback from 2 to 12 lines in the `endsWithPipe && title` branch. Skips: blank lines, bullets, location lines, date-range lines (continue, don't stop). Stops at all-caps section headers (EXPERIENCE, EDUCATION etc).

### Files changed
- `src/lib/parser.ts` — extended lookback loop (was `[prev1, prev2].find()`, now loop to 12)
- `src/lib/__tests__/parser-fixes-march2026.test.ts` — 2 new regression tests

### DB fix
Re-parsed 5 affected CVs via `parseText(raw_text)` and updated `structured_json`:
- e7624aba, 2a6e0553, fd8e8906, 480e48c4, 7bc9405f

### Test results
- 809/809 tests passing (+2 new tests)

### ALL 11 PRE-LAUNCH ITEMS COMPLETE ✅

---

## Bug Fix — Critical concerns not affecting score (2026-03-06 13:19 GMT)

**Commit:** 41bb005

### Problem
The editor was functionally broken for a large class of fixes. Adding LinkedIn to AJ Gilosa's CV (score: 66) and re-scoring returned the same score of 66 — which James correctly identified as impossible.

**Root cause:** Critical concerns (missing LinkedIn, missing email, missing dates, employment gap) had `potentialPoints: 0` and only affected the `passFail` flag, never `overallScore`. `overallScore` was purely the sum of 4 bucket scores. Editing LinkedIn in the editor genuinely could not move the number.

### Fix
Applied score penalties for each critical concern. Each concern now deducts from `overallScore`:
- `missing-linkedin`: **-5 pts**
- `missing-email`: **-8 pts**
- `missing-dates`: **-3 pts per role with missing dates, capped at -9**
- `employment-gap`: **-3 pts**

Formula: `overallScore = Math.max(0, rawBucketScore - criticalPenalty)`

`potentialPoints` on each checklist item updated to match the penalty, so the UI correctly shows "+5 pts" next to the LinkedIn item.

### File changed
- `src/lib/scorer.ts` — penalty constants added; `checkCriticalConcerns` `potentialPoints` updated; `scoreCV` applies penalty sum to raw bucket total

### Test results
- 851/851 tests passing
- Dedicated test confirms: without LinkedIn = N, with LinkedIn = N+5 (exact delta verified)

### Notes
- Existing CVs in DB will show a lower score on next re-score if they have critical concerns — this is correct behaviour, not a regression
- Score improvements from fixing LinkedIn/email are now real and visible

---

## Product Change — ATS/keywords bucket removed (2026-03-06 13:41 GMT)

**Commits:** f69e57f (main change), ba6e365 (build fix)

### What changed
Product direction change — generic keyword lists were giving actively bad advice
(e.g. telling an enterprise new-logo AE to add "upsell" keywords).

**ATS/keywords bucket (25 pts) removed from general score entirely.**
Redistributed proportionally to remaining 3 buckets (Option A — proportional):
- Proof of Impact: 35 → **47** (×47/35)
- Formatting:      20 → **27** (×27/20)
- Clarity:         20 → **26** (×26/20)

Keywords now ONLY appear in JD Match, where advice is role-specific and actually useful.

### Files changed
- `src/lib/scorer.ts` — ATS bucket removed, scaling helpers added, potentialPoints scaled
- `src/app/score/page.tsx` — 3 bucket bars, keywords section removed, JD Match CTA promoted
- `src/lib/demoData.ts` — DEMO_SCORE updated to 3 buckets (score: 64)
- `src/app/page.tsx` — homepage demo updated, "four key" → "three key"
- `src/app/share/[token]/page.tsx` — BUCKET_CONFIG updated to 3 buckets
- `src/types/database.ts` — BucketScores comments updated
- `src/app/api/cv/[id]/score/route.ts` — ats_keywords written as 0 (DB compat)
- `scripts/*.ts` — all ATS/keyword references removed (caused Vercel build failure)

### Test results
- 851/851 tests passing
- Zero TypeScript errors (including scripts/)
- Browser tested ✅ — 3 buckets confirmed, keywords section gone, JD Match CTA present
