
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
