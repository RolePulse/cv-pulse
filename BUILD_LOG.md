
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
