// CV Pulse — Non-CV document rejection tests
// Verifies that the confidence gate correctly rejects financial documents
// (bank statements, invoices, payslips) whilst still passing real CVs.

import { describe, it, expect } from 'vitest'
import { calculateConfidence } from '@/lib/parser'
import type { StructuredCV } from '@/types/database'

const EMPTY_STRUCTURED: StructuredCV = {
  summary: '',
  experience: [],
  skills: [],
  education: [],
  certifications: [],
}

const CONFIDENCE_THRESHOLD = 40

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildBankStatement(overrides?: Partial<{
  hasSortCode: boolean
  hasBalance: boolean
  hasTransactions: boolean
}>): string {
  const opts = { hasSortCode: true, hasBalance: true, hasTransactions: true, ...overrides }
  return [
    'HSBC Bank plc',
    'Mr James Smith',
    '123 High Street, London, EC1A 1BB',
    '',
    opts.hasSortCode ? 'Sort Code: 40-12-34    Account Number: 12345678' : '',
    'Statement Date: 01 March 2026',
    'Statement Period: 01 Feb 2026 – 28 Feb 2026',
    '',
    opts.hasBalance ? 'Opening Balance: £1,250.00' : '',
    opts.hasBalance ? 'Closing Balance: £2,430.50' : '',
    '',
    opts.hasTransactions
      ? [
          'Date        Description                   Debit      Credit     Balance',
          '01/02/2026  BACS PAYMENT — EMPLOYER        —         £2,500.00  £3,750.00',
          '03/02/2026  AMAZON.CO.UK                  £45.99      —         £3,704.01',
          '05/02/2026  DIRECT DEBIT — COUNCIL TAX    £120.00     —         £3,584.01',
          '10/02/2026  ATM WITHDRAWAL                £200.00     —         £3,384.01',
          '15/02/2026  STANDING ORDER — RENT         £900.00     —         £2,484.01',
        ].join('\n')
      : '',
  ]
    .filter(l => l !== '')
    .join('\n')
}

function buildInvoice(): string {
  return `
ACME Consulting Ltd
123 Business Park, Manchester, M1 1AA

Invoice No: INV-2026-00142
Invoice Date: 1 March 2026
Due Date: 31 March 2026

Bill To:
Widgets Corp Ltd
456 Commerce Street
London, EC2A 2BB

Description                     Qty   Unit Price   Total
Strategy consulting session      8h    £150.00     £1,200.00
Report writing                   4h    £150.00     £600.00

Subtotal:                                          £1,800.00
VAT (20%):                                         £360.00
Total Amount Due:                                  £2,160.00

Payment Terms: 30 days net. Please pay by BACS to Sort Code 20-00-00 Account 87654321.
  `.trim()
}

function buildPayslip(): string {
  return `
Company: Acme Ltd
Employee: Sarah Johnson
Employee No: E12345

Pay Period: February 2026
Payment Date: 28 February 2026
Pay Method: BACS

Earnings Statement
Basic Salary:      £3,333.33
Overtime:           £250.00
Gross Pay:         £3,583.33

Deductions
Income Tax:         £600.00
National Insurance: £320.00
Pension:            £179.17
Net Pay:           £2,484.16
  `.trim()
}

function buildRealCV(): string {
  return `
Jane Doe
jane.doe@email.com | 07700 900000 | LinkedIn: linkedin.com/in/janedoe | London, UK

PROFESSIONAL SUMMARY
Results-driven Senior Marketing Manager with 8 years of experience in B2B SaaS.
Specialised in demand generation, ABM campaigns, and pipeline growth.

EXPERIENCE

Senior Marketing Manager — Acme SaaS Ltd, London
Jan 2022 – Present
• Led demand generation strategy, growing MQL volume by 45% YoY
• Managed £500k annual marketing budget across paid, content, and events
• Built ABM programme targeting 200 enterprise accounts

Marketing Manager — BetaSoftware Ltd, London
Mar 2019 – Dec 2021
• Owned full-funnel campaigns for EMEA region
• Increased trial sign-ups by 32% through SEO and content overhaul
• Managed a team of 3 marketers

SKILLS
Salesforce, HubSpot, Google Ads, LinkedIn Ads, SQL, Tableau, ABM, SEO, Content Strategy

EDUCATION
BSc Marketing, University of Manchester — 2014–2017
  `.trim()
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Non-CV document rejection', () => {
  describe('Hard-reject patterns', () => {
    it('rejects a bank statement containing Sort Code', () => {
      const text = buildBankStatement({ hasSortCode: true, hasBalance: true, hasTransactions: true })
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects a document containing "bank statement" phrase', () => {
      const text = 'NATIONWIDE BANK STATEMENT\nMr John Smith\nAccount: 12345678\nSome transactions here'
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects a document containing "account statement" phrase', () => {
      const text = 'Account Statement\nPeriod: 01 Jan – 31 Jan 2026\nJohn Smith\nBalance: £1,000.00'
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects an invoice with "Invoice No" and "Amount Due"', () => {
      const text = buildInvoice()
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects a document containing "Total Amount Due"', () => {
      const text = 'Services rendered\nTotal Amount Due: £500.00\nPayment by 30 days\nThank you for your business'
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects a payslip containing "Earnings Statement"', () => {
      const text = buildPayslip()
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects a document containing "Pay Slip"', () => {
      const text = 'Pay Slip — March 2026\nEmployee: Tom Brown\nGross Pay: £2,500.00\nNet Pay: £1,950.00'
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects a document with IBAN pattern', () => {
      const text = 'Please transfer funds to:\nIBAN: GB29NWBK60161331926819\nBIC: NWBKGB2L\nAmount Due: £1,200.00'
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects a document with "Remittance Advice"', () => {
      const text = 'Remittance Advice\nSupplier: ABC Ltd\nPayment: £750.00\nDate: 01 March 2026'
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects a P60 tax form', () => {
      const text = 'P60 End of Year Certificate\nEmployee: Jane Smith\nNI Number: AB 12 34 56 C\nTotal Pay: £42,000\nTax Paid: £8,400'
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('rejects a P45 leaving document', () => {
      const text = 'Parts 1A and 2\nP45 Details of employee leaving work\nEmployee: Mark Jones\nDate of leaving: 28 Feb 2026'
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })
  })

  describe('Soft-signal density rejection', () => {
    it('rejects a document with 4+ financial soft signals', () => {
      const text = `
        Statement period January 2026
        Opening Balance £500.00
        Closing Balance £750.00
        Transaction on 5 Jan: Debit £100.00
        Credit received 10 Jan: £350.00
        Payment reference: REF-12345
      `.trim()
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('allows a document with 3 or fewer financial soft signals', () => {
      // A CV could legitimately mention "credit" once (e.g. university credits) — 
      // only reject when density is high
      const text = `
        John Smith
        john@email.com | London, UK

        EXPERIENCE
        Finance Manager — Barclays, London (2019–2024)
        • Managed debit card products for UK retail division
        • Oversaw credit risk reporting team of 5
        • Delivered £2M cost reduction through process improvement

        SKILLS
        Financial modelling, Excel, SQL, Risk analysis

        EDUCATION
        BSc Economics, University of Leeds 2015–2018
      `.trim()
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    })
  })

  describe('Real CVs still pass', () => {
    it('passes a well-formed marketing CV', () => {
      const text = buildRealCV()
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    })

    it('passes a CV that mentions financial terms in a professional context', () => {
      const text = `
        Sarah Clarke
        s.clarke@email.com | 07700 900123

        EXPERIENCE
        Finance Business Partner — Acme Corp, London
        Jan 2021 – Present
        • Prepared monthly balance sheet reconciliations
        • Led project to reduce transaction processing time by 30%
        • Managed £5M capital budget

        Financial Analyst — Beta Ltd, Manchester
        Mar 2018 – Dec 2020
        • Built credit risk models used across EMEA

        EDUCATION
        MSc Finance, London Business School 2017–2018
        BSc Accounting, University of Leeds 2014–2017
      `.trim()
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    })

    it('passes a CV mentioning "sort" in a non-financial context', () => {
      const text = `
        Alex Jones — alex@email.com — London

        EXPERIENCE
        Software Engineer — TechCo Ltd, London (2020–2025)
        • Implemented sort algorithms reducing query time by 40%
        • Led team of 4 engineers

        SKILLS
        TypeScript, Python, SQL, React

        EDUCATION
        BSc Computer Science, University of Bristol 2016–2019
      `.trim()
      const result = calculateConfidence(text, EMPTY_STRUCTURED)
      expect(result.score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    })
  })
})
