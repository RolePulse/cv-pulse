/**
 * Hard-coded demo CV and score for the unauthenticated demo flow.
 * Used when ?demo=true is in the URL — no DB or auth required.
 * Designed to show realistic diagnostic value: score 62/100, clear fixes.
 */

import type { StructuredCV } from '@/types/database'
import type { ScoreResult } from '@/lib/scorer'

export const DEMO_CV: StructuredCV = {
  summary: '',
  experience: [
    {
      title: 'Account Executive',
      company: 'TechCorp',
      start: 'Jan 2022',
      end: null,
      bullets: [
        'Managed a portfolio of 50+ mid-market accounts across the Northeast region',
        'Partnered with SDRs and marketing to build outbound pipeline and drive new business opportunities',
        'Exceeded quota in Q3 by closing a strategic deal with a Fortune 500 financial services company',
        'Led product demonstrations and discovery calls with C-suite and VP-level stakeholders',
      ],
    },
    {
      title: 'Senior Sales Development Representative',
      company: 'GrowthCo',
      start: 'Jun 2020',
      end: 'Dec 2021',
      bullets: [
        'Generated $2.1M in qualified pipeline over 18 months through targeted outbound prospecting',
        'Consistently ranked top 3 on a team of 12 for meetings booked and sequence response rate',
        'Partnered with Account Executives on account research and personalisation to improve conversion from demo to close',
      ],
    },
    {
      title: 'Business Development Representative',
      company: 'StartupABC',
      start: 'Sep 2018',
      end: 'May 2020',
      bullets: [
        'Prospected into ICP accounts via LinkedIn, cold email and direct phone outreach',
        'Booked 15+ qualified demos per month against a target of 10',
        'Built and maintained sequences in HubSpot to target key verticals',
      ],
    },
  ],
  education: [
    {
      institution: 'University of Leeds',
      qualification: 'BSc Business Management, 2:1',
      year: '2018',
    },
  ],
  skills: [],
  certifications: [],
}

export const DEMO_RAW_TEXT = `Alex Jordan
alex.jordan@email.com · 07700 900 123 · Leeds, UK

Account Executive — TechCorp · Jan 2022 – Present
• Managed a portfolio of 50+ mid-market accounts across the Northeast region
• Partnered with SDRs and marketing to build outbound pipeline and drive new business opportunities
• Exceeded quota in Q3 by closing a strategic deal with a Fortune 500 financial services company
• Led product demonstrations and discovery calls with C-suite and VP-level stakeholders

Senior Sales Development Representative — GrowthCo · Jun 2020 – Dec 2021
• Generated $2.1M in qualified pipeline over 18 months through targeted outbound prospecting
• Consistently ranked top 3 on a team of 12 for meetings booked and sequence response rate
• Partnered with Account Executives on account research and personalisation to improve conversion from demo to close

Business Development Representative — StartupABC · Sep 2018 – May 2020
• Prospected into ICP accounts via LinkedIn, cold email and direct phone outreach
• Booked 15+ qualified demos per month against a target of 10
• Built and maintained sequences in HubSpot to target key verticals

Education
University of Leeds — BSc Business Management, 2:1 · 2018`

export const DEMO_SCORE: ScoreResult = {
  overallScore: 62,
  passFail: false,
  criticalConcerns: ['Add your LinkedIn profile URL (linkedin.com/in/yourname)'],
  buckets: {
    proofOfImpact: {
      score: 19,
      maxScore: 35,
      positives: ['Quantified SDR pipeline ($2.1M)', 'Specific team ranking mentioned'],
      issues: [
        'No quota attainment % or $ARR closed on AE role',
        'Fortune 500 deal lacks ACV or deal size',
        'BDR role missing revenue or pipe contribution',
      ],
    },
    atsKeywords: {
      score: 11,
      maxScore: 25,
      positives: ['Includes: pipeline, outbound, prospecting, new business, quota, cold email'],
      issues: [
        'Missing: Salesforce/SFDC, MEDDIC, Gong, Outreach, territory management, CRM',
        'No skills section — limits ATS keyword matching',
      ],
    },
    formatting: {
      score: 20,
      maxScore: 20,
      positives: ['Clean single-column layout', 'Consistent date formatting', 'Bullet points throughout'],
      issues: [],
    },
    clarity: {
      score: 12,
      maxScore: 20,
      positives: ['Clear role progression (BDR → SDR → AE)', 'Education section present'],
      issues: ['No professional summary — fails the 6-second recruiter scan', '2 bullets exceed 2 lines'],
    },
  },
  checklist: [
    {
      id: 'linkedin',
      category: 'critical',
      action: 'Add your LinkedIn profile URL (linkedin.com/in/yourname)',
      whyItMatters: 'Recruiters verify candidates on LinkedIn before responding. A missing URL is an instant red flag.',
      potentialPoints: 0,
      done: false,
    },
    {
      id: 'demo-metrics-ae',
      category: 'impact',
      action: 'Add quota attainment % or $ARR closed to your TechCorp AE role',
      whyItMatters: 'AEs are hired on their numbers. "Exceeded quota" without a figure means nothing to a recruiter or ATS.',
      potentialPoints: 8,
      done: false,
    },
    {
      id: 'demo-metrics-deal',
      category: 'impact',
      action: 'Quantify the Fortune 500 deal — add the ACV or total contract value',
      whyItMatters: 'Deal size signals deal complexity and which market segment you can sell into.',
      potentialPoints: 5,
      done: false,
    },
    {
      id: 'demo-sdr-pipeline',
      category: 'impact',
      action: 'SDR pipeline already quantified ($2.1M over 18 months) — keep it',
      whyItMatters: 'This is exactly the kind of metric recruiters want to see. Well done.',
      potentialPoints: 0,
      done: true,
    },
    {
      id: 'demo-keywords',
      category: 'ats',
      action: 'Add missing AE keywords: Salesforce (SFDC), MEDDIC, Gong, Outreach, territory management',
      whyItMatters: 'ATS systems filter on exact matches. These are standard requirements in AE job descriptions.',
      potentialPoints: 10,
      done: false,
    },
    {
      id: 'demo-skills',
      category: 'ats',
      action: 'Add a skills section listing your tools and methodologies',
      whyItMatters: 'Skills sections are parsed by ATS systems and dramatically improve keyword matching.',
      potentialPoints: 4,
      done: false,
    },
    {
      id: 'demo-summary',
      category: 'clarity',
      action: 'Add a 2–3 sentence professional summary targeting Account Executive roles',
      whyItMatters: 'A strong summary anchors your profile and is the first thing a recruiter reads. Without it you lose the 6-second scan.',
      potentialPoints: 5,
      done: false,
    },
    {
      id: 'demo-formatting',
      category: 'formatting',
      action: 'Formatting passes — single column, consistent dates, bullet points throughout',
      whyItMatters: 'Your CV is ATS-safe. No multi-column layout, tables, or headers to break parsing.',
      potentialPoints: 0,
      done: true,
    },
  ],
  targetRole: 'AE',
  keywordData: {
    role: 'AE',
    total: 25,
    matched: ['pipeline', 'outbound', 'prospecting', 'new business', 'quota', 'accounts', 'cold email', 'discovery', 'HubSpot'],
    missing: ['Salesforce', 'SFDC', 'MEDDIC', 'Gong', 'Outreach', 'CRM', 'territory', 'enterprise', 'SaaS', 'ARR', 'ACV', 'Challenger', 'SPIN', 'Hubspot', 'Clari', 'ZoomInfo'],
  },
}
