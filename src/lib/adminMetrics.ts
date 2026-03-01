// CV Pulse — Admin Metrics
// Epic 15 | Pure functions for aggregating funnel metrics and top failing checklist items.
// All logic is deterministic — same input = same output.

import type { ChecklistItem } from '@/types/database'

// ─── Funnel metric event names ────────────────────────────────────────────────

export const FUNNEL_EVENT_NAMES = [
  'cv_uploaded',
  'cv_scored',
  'cv_rescored',
  'paywall_hit',
  'jd_match_run',
  'share_link_created',
  'cv_exported',
  'parse_failed',
  'account_deleted',
] as const

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number]

// ─── Funnel metrics shape ─────────────────────────────────────────────────────

export interface FunnelMetrics {
  total_uploads: number
  sign_ins: number
  scores_viewed: number
  rescore_clicks: number
  paywall_hits: number
  jd_checks: number
  share_links_created: number
  exports: number
  parse_failures: number
  account_deletions: number
}

// ─── Build funnel metrics from event counts + user count ──────────────────────

export function buildFunnelMetrics(
  eventCounts: Record<string, number>,
  userCount: number,
): FunnelMetrics {
  return {
    total_uploads: eventCounts['cv_uploaded'] ?? 0,
    sign_ins: userCount,
    scores_viewed: eventCounts['cv_scored'] ?? 0,
    rescore_clicks: eventCounts['cv_rescored'] ?? 0,
    paywall_hits: eventCounts['paywall_hit'] ?? 0,
    jd_checks: eventCounts['jd_match_run'] ?? 0,
    share_links_created: eventCounts['share_link_created'] ?? 0,
    exports: eventCounts['cv_exported'] ?? 0,
    parse_failures: eventCounts['parse_failed'] ?? 0,
    account_deletions: eventCounts['account_deleted'] ?? 0,
  }
}

// ─── Aggregate top failing checklist items ────────────────────────────────────

export interface FailingItem {
  title: string
  count: number
}

/**
 * Given an array of checklist arrays (one per score row),
 * count how often each item action appears with done=false.
 * Returns the top N items sorted by count descending.
 */
export function aggregateFailingItems(
  checklists: ChecklistItem[][],
  limit = 10,
): FailingItem[] {
  const counts = new Map<string, number>()

  for (const checklist of checklists) {
    for (const item of checklist) {
      if (!item.done) {
        counts.set(item.action, (counts.get(item.action) ?? 0) + 1)
      }
    }
  }

  return Array.from(counts.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
