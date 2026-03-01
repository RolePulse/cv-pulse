// CV Pulse — Admin Dashboard tests
// Epic 15 | Tests: buildFunnelMetrics, aggregateFailingItems, admin auth,
//                  API response shape, sorting, limits.
//
// Level: thorough (14 tests)

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildFunnelMetrics,
  aggregateFailingItems,
  FUNNEL_EVENT_NAMES,
} from '@/lib/adminMetrics'
import type { ChecklistItem } from '@/types/database'
import type { FunnelMetrics } from '@/lib/adminMetrics'

// ─── Read source files for auth guard verification ────────────────────────────

const metricsRouteSource = readFileSync(
  join(__dirname, '../../app/api/admin/metrics/route.ts'),
  'utf-8'
)

const allowlistRouteSource = readFileSync(
  join(__dirname, '../../app/api/admin/allowlist/route.ts'),
  'utf-8'
)

const deleteAccountRouteSource = readFileSync(
  join(__dirname, '../../app/api/user/delete-account/route.ts'),
  'utf-8'
)

// ─── Helper: make a checklist item ────────────────────────────────────────────

function makeItem(action: string, done: boolean): ChecklistItem {
  return {
    id: `item-${action}`,
    done,
    action,
    why: 'test',
    example: '',
    points: 5,
  }
}

// ─── buildFunnelMetrics ───────────────────────────────────────────────────────

describe('Epic 15 — buildFunnelMetrics()', () => {
  it('1. Returns correct shape with all metric keys', () => {
    const result = buildFunnelMetrics({}, 0)
    const keys: (keyof FunnelMetrics)[] = [
      'total_uploads',
      'sign_ins',
      'scores_viewed',
      'rescore_clicks',
      'paywall_hits',
      'jd_checks',
      'share_links_created',
      'exports',
      'parse_failures',
      'account_deletions',
    ]
    for (const key of keys) {
      expect(result).toHaveProperty(key)
      expect(typeof result[key]).toBe('number')
    }
    expect(Object.keys(result)).toHaveLength(keys.length)
  })

  it('2. Maps event counts to correct metric keys', () => {
    const counts = {
      cv_uploaded: 100,
      cv_scored: 80,
      cv_rescored: 30,
      paywall_hit: 10,
      jd_match_run: 25,
      share_link_created: 5,
      cv_exported: 40,
      parse_failed: 3,
      account_deleted: 2,
    }
    const result = buildFunnelMetrics(counts, 50)

    expect(result.total_uploads).toBe(100)
    expect(result.sign_ins).toBe(50)
    expect(result.scores_viewed).toBe(80)
    expect(result.rescore_clicks).toBe(30)
    expect(result.paywall_hits).toBe(10)
    expect(result.jd_checks).toBe(25)
    expect(result.share_links_created).toBe(5)
    expect(result.exports).toBe(40)
    expect(result.parse_failures).toBe(3)
    expect(result.account_deletions).toBe(2)
  })

  it('3. Defaults missing event counts to 0', () => {
    const result = buildFunnelMetrics({}, 10)
    expect(result.total_uploads).toBe(0)
    expect(result.sign_ins).toBe(10)
    expect(result.paywall_hits).toBe(0)
    expect(result.parse_failures).toBe(0)
  })

  it('4. FUNNEL_EVENT_NAMES contains all expected event names', () => {
    const expected = [
      'cv_uploaded',
      'cv_scored',
      'cv_rescored',
      'paywall_hit',
      'jd_match_run',
      'share_link_created',
      'cv_exported',
      'parse_failed',
      'account_deleted',
    ]
    for (const name of expected) {
      expect(FUNNEL_EVENT_NAMES).toContain(name)
    }
  })
})

// ─── aggregateFailingItems ────────────────────────────────────────────────────

describe('Epic 15 — aggregateFailingItems()', () => {
  it('5. Counts failing items correctly across multiple checklists', () => {
    const checklists: ChecklistItem[][] = [
      [makeItem('Add metrics', false), makeItem('Add LinkedIn', false)],
      [makeItem('Add metrics', false), makeItem('Fix formatting', false)],
      [makeItem('Add metrics', false), makeItem('Add LinkedIn', true)], // LinkedIn done in this one
    ]
    const result = aggregateFailingItems(checklists)

    const metricsItem = result.find(r => r.title === 'Add metrics')
    const linkedinItem = result.find(r => r.title === 'Add LinkedIn')
    const formattingItem = result.find(r => r.title === 'Fix formatting')

    expect(metricsItem?.count).toBe(3)
    expect(linkedinItem?.count).toBe(1) // only 1 not-done
    expect(formattingItem?.count).toBe(1)
  })

  it('6. Sorted by count descending', () => {
    const checklists: ChecklistItem[][] = [
      [makeItem('A', false), makeItem('B', false), makeItem('C', false)],
      [makeItem('A', false), makeItem('C', false)],
      [makeItem('C', false)],
    ]
    const result = aggregateFailingItems(checklists)

    expect(result[0].title).toBe('C')
    expect(result[0].count).toBe(3)
    expect(result[1].title).toBe('A')
    expect(result[1].count).toBe(2)
    expect(result[2].title).toBe('B')
    expect(result[2].count).toBe(1)
  })

  it('7. Limited to 10 items by default', () => {
    const items: ChecklistItem[] = Array.from({ length: 15 }, (_, i) =>
      makeItem(`Item ${i}`, false)
    )
    const result = aggregateFailingItems([items])
    expect(result).toHaveLength(10)
  })

  it('8. Respects custom limit parameter', () => {
    const items: ChecklistItem[] = Array.from({ length: 10 }, (_, i) =>
      makeItem(`Item ${i}`, false)
    )
    const result = aggregateFailingItems([items], 5)
    expect(result).toHaveLength(5)
  })

  it('9. Ignores done=true items', () => {
    const checklists: ChecklistItem[][] = [
      [makeItem('A', true), makeItem('B', false)],
      [makeItem('A', true), makeItem('B', false)],
    ]
    const result = aggregateFailingItems(checklists)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('B')
    expect(result[0].count).toBe(2)
  })

  it('10. Returns empty array for empty input', () => {
    expect(aggregateFailingItems([])).toEqual([])
    expect(aggregateFailingItems([[]])).toEqual([])
  })
})

// ─── Admin auth guards ────────────────────────────────────────────────────────

describe('Epic 15 — Admin auth', () => {
  it('11. Metrics API requires ADMIN_EMAIL — returns 403 when not set', () => {
    // The route checks: if (!adminEmail) → 403
    expect(metricsRouteSource).toContain("if (!adminEmail)")
    expect(metricsRouteSource).toContain("status: 403")
  })

  it('12. Metrics API requires email match — returns 403 for non-admin', () => {
    expect(metricsRouteSource).toContain("user.email !== adminEmail")
    expect(metricsRouteSource).toContain("Admin access required")
  })

  it('13. Allowlist API also fails safe when ADMIN_EMAIL not set', () => {
    // The route should check: if (!ADMIN_EMAIL || user.email !== ADMIN_EMAIL) → 403
    expect(allowlistRouteSource).toContain('!ADMIN_EMAIL')
    expect(allowlistRouteSource).toContain("status: 403")
  })

  it('14. Delete-account route logs account_deleted event', () => {
    expect(deleteAccountRouteSource).toContain("'account_deleted'")
    expect(deleteAccountRouteSource).toContain("event_name")
  })
})
