# CV Pulse — UX Review #2
**Date:** Thursday 5 March 2026  
**Reviewed by:** Sheila  
**Method:** Full browser walkthrough — homepage, upload, score (demo), JD Match, export, settings, upgrade, terms. Screenshots taken at each step.  
**Test account used:** test@cvpulse.io (signed in as "T")

---

## Executive Summary

CV Pulse is in genuinely good shape for launch. The visual identity is clean and distinctive, the core scoring flow works end-to-end, and the checklist with point values is the kind of concrete, actionable output that job seekers actually need. The five bugs fixed this morning removed the most significant technical issues. What remains are presentation and messaging gaps rather than structural problems: the score page shows a mobile layout at typical laptop widths (breakpoint too high), the upgrade page has a currency mismatch, a RevOps role advertised on the landing page is missing from the upload form, and the homepage doesn't adapt for returning signed-in users. None of these are blockers — but several will undermine first impressions with real users.

---

## What's Working ✅

1. **Visual brand** — warm cream background, orange accent, clean typography. Distinctive and professional. Doesn't look like a side project.

2. **Score ring + pass/fail badge** — immediately communicates the verdict. Colour-coded (green/amber/red) bucket bars below it are the right follow-up. No explanation needed.

3. **Checklist with point values (+8, +5)** — this is the core value prop. Showing what each fix is worth makes users want to act. Correctly prioritised by category.

4. **Quick fixes** — one-click improvements that apply and prompt a re-score. Feels like a real product feature, not an afterthought.

5. **Demo score page** — accessible without sign-up, properly gated behind a clear orange banner. Good friction-reducer for sceptical first-time visitors.

6. **Role selection before upload** — the right UX call. Users think in roles first, not CV contents.

7. **Trust strip on landing** — 1,600+ subscribers, GTM-specific, deterministic scoring. Addresses the three questions a job seeker asks: "is this for me?", "is this legit?", "will it give me the same score twice?"

8. **Back navigation** — ← Back to score on JD Match, ← Back on Settings, clickable steps in ProgressIndicator. All working correctly after recent fixes.

9. **Settings page** — clean. Correct danger-button styling for delete actions. "We never store your original PDF" in the right place.

10. **Share link privacy framing** — "score, pass/fail, and checklist titles only. No CV text, no contact info." Excellent copy. Removes the anxiety of sharing.

11. **Upgrade page structure** — honest free vs pro comparison, clear RolePulse cross-promotion at the bottom, "Cancel anytime" in the right place.

12. **Terms/Privacy** — plain English, short, builds trust. Good.

---

## What's Not Working ❌

### 🔴 Critical

**1. Score page shows mobile layout at typical laptop widths**  
The `lg` breakpoint (1024px) is too high. A MacBook Air with Chrome open and a sidebar running sits around 840–900px viewport width. At that width, the app shows the mobile tab bar ("Score & Checklist / Edit CV") — not the intended side-by-side two-panel desktop layout. Most real users will get the mobile experience on a laptop and never see the editor without discovering the second tab. The editor is the product's second core feature.

**2. Currency mismatch on the upgrade page**  
The Free plan shows **£0 / month** (GBP). The Pro plan shows **$9 / month** (USD). On the same pricing card. This looks like a mistake. For a UK-focused GTM audience launched via RolePulse UK, both should be £. Or pick USD and commit. As is, it looks unfinished.

**3. RevOps role advertised on landing page, missing from upload form**  
The landing page role pills show: SDR/BDR · Account Executive · CSM · GTM Marketing · **RevOps**  
The upload form shows: SDR/BDR · Account Executive · Customer Success · Marketing · Leadership/VP  
RevOps is missing. Any RevOps professional clicking through from the landing page will notice immediately. Also creates an uneven 5-card grid (2 rows, last row has an empty cell) that looks unfinished.

---

### 🟡 Important

**4. Homepage CTA is wrong for signed-in returning users**  
A returning user hits `/` and sees "Score my CV →" linking to `/upload`. But they already have a CV and a score. They should see "View my score →" linking to `/score?cvId=X`. The homepage is already a server component that resolves auth — the conditional CTA is a small addition.

**5. "JD Match" in the header nav is always visible**  
JD Match only makes sense once you have a scored CV. But it appears in the top nav for all signed-in users at all times — including users mid-upload. It adds noise before the user has completed the core flow. Should either be contextual (appear post-scoring) or moved to secondary nav.

**6. Export page: silent failure when no CV is loaded**  
Navigating to `/export` without a CV produces two template cards showing grey skeleton animations and disabled "Download PDF" buttons indefinitely, with no explanation. No message says "Upload a CV first." A stressed user who navigates there directly (e.g., from a bookmark) would have no idea what's happening.

**7. "Both free in v1" copy on export page**  
"Two clean, ATS-safe templates. Both free in v1." — the "in v1" qualifier implies they'll cost money later. This creates unnecessary anxiety. Users will wonder what v2 looks like. Change to "Both included in all plans" or simply "Both free."

**8. "Most Popular" badge on Pro tier, but Pro isn't live**  
The Pro plan has a "MOST POPULAR" badge. Pro isn't available yet ("Pro launching soon — we'll be in touch"). The badge is factually inaccurate and looks like template copy that wasn't cleaned up.

**9. "Get early access →" CTA fires `mailto:` with no form**  
Clicking "Get early access" (when no Stripe URL is set) opens the user's email client. This is jarring and converts poorly. A job seeker at 11pm applying for roles wants to click a button, not compose an email. Even a basic embedded Tally/Typeform waitlist would be 10× better UX.

---

### 🟢 Polish

**10. "Clarity & structure" bucket score not visible in initial score view (mobile)**  
The 4th bucket bar is below the fold on first load, covered by the sticky bottom CTA bar. Users may not notice there's a 4th scoring bucket.

**11. No context on what score threshold means**  
62/100 shows "Needs work" but users don't know why. A single supporting line near the badge — e.g., "Recruiters expect 70+ to progress to interview" — adds crucial context for what they're working towards. The pass banner after 70 partially covers this, but only if they reach it.

**12. Demo page: "Edit CV" tab not prominently discoverable**  
The editor is a core feature. On the demo page, "Edit CV" is a secondary tab that most users won't click. Consider labelling it more prominently ("Fix your CV →") or having the demo briefly show the editor view.

**13. Demo banner + critical concern banner stacks deeply on mobile**  
On mobile: orange demo banner + red critical concern banner + then the score ring. That's ~180px of banners before the actual score. Lots of scroll on a small screen before you see the number.

**14. Score ring "Scored for Account Executive" line wraps awkwardly**  
On mobile, "Scored for **Account Executive**" wraps to two lines which looks slightly off. Minor but noticeable.

---

## Recommended Changes Ranked by Impact

| # | Change | Impact | Size |
|---|--------|--------|------|
| 1 | Lower score page breakpoint from `lg` (1024px) to `md` (768px) | High | XS — one CSS class change |
| 2 | Add RevOps to ALL_ROLES and upload grid | High | S — adds role constant + scoring keywords |
| 3 | Fix currency mismatch on /upgrade (£0 vs $9) | High | XS — one character change |
| 4 | Homepage: show "View my score →" for signed-in users with existing CV | Medium | S — server component already has auth |
| 5 | Export page: add explicit empty state when no CV loaded | Medium | S — conditional branch, simple card |
| 6 | Remove "in v1" from export page copy | Medium | XS |
| 7 | Remove "Most Popular" badge from Pro card until Pro is live | Medium | XS |
| 8 | Replace mailto "Get early access" with a Tally/Typeform waitlist embed | Medium | S |
| 9 | Add "Recruiters expect 70+ to progress" near score badge | Low | XS |
| 10 | Move "JD Match" from primary nav to contextual (post-score only) | Low | S |

---

## Competitive Context

Against the main alternatives (Resume Worded, Jobscan, Enhancv):

**Stronger than competition:**
- GTM-specific scoring. No competitor scores for SDR vs CSM vs AE separately. This is the product's biggest differentiator and it's not sufficiently prominent.
- Deterministic scoring as a trust signal. "Same CV, same score, every time" is a genuine advantage over AI-based tools that give different answers on refresh. Should be more prominent on the landing page.
- Design quality. Resume Worded and Jobscan look like 2018 SaaS. CV Pulse looks current.

**Weaker than competition:**
- No mobile app. Job seekers increasingly apply from phones.
- No CV comparison mode (score against multiple roles).
- No JD auto-import (Chrome extension to grab JD text directly from job boards).
- No "before/after" example on the landing page. Competitors lead with this.

**The biggest missed opportunity on the landing page:** there's no before/after score story. Showing "Sarah's AE CV went from 54 → 82 after 20 minutes" would convert significantly better than three feature cards. Real result, real role, real name. This doesn't require building anything — just copy.

---

## Pages Tested

| Page | Status | Notes |
|------|--------|-------|
| `/` (landing) | ✅ Loads | CTA wrong for signed-in users |
| `/upload` | ✅ Loads | RevOps role missing, uneven grid |
| `/score?demo=true` | ✅ Loads | Mobile layout at 840px viewport |
| `/jd-match` | ✅ Loads | Header auth now correct (fixed today) |
| `/export` | ✅ Loads | Empty state misleading when no CV |
| `/settings` | ✅ Loads | Clean |
| `/upgrade` | ✅ Loads | Currency mismatch, misleading badges |
| `/terms` | ✅ Loads | Clean, plain English |

_Live browser testing confirmed on all pages. Screenshots captured._
