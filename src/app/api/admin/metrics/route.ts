// CV Pulse — Admin Metrics API
// Epic 15 | GET /api/admin/metrics
// Returns funnel metrics and top failing checklist items.
// Auth: requires signed-in user matching ADMIN_EMAIL env var.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildFunnelMetrics,
  aggregateFailingItems,
  FUNNEL_EVENT_NAMES,
} from '@/lib/adminMetrics'
import type { ChecklistItem } from '@/types/database'

export async function GET() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL ?? ''

  if (!adminEmail) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  if (user.email !== adminEmail) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // ── Count events by name ──────────────────────────────────────────────────
  const eventCounts: Record<string, number> = {}

  for (const eventName of FUNNEL_EVENT_NAMES) {
    const { count } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('event_name', eventName)

    eventCounts[eventName] = count ?? 0
  }

  // ── Count users (proxy for sign-ins) ──────────────────────────────────────
  const { count: userCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })

  // ── Build funnel metrics ──────────────────────────────────────────────────
  const funnelMetrics = buildFunnelMetrics(eventCounts, userCount ?? 0)

  // ── Aggregate top failing checklist items ─────────────────────────────────
  const { data: scores } = await supabase
    .from('scores')
    .select('checklist_json')

  const checklists = (scores ?? []).map(
    (s: { checklist_json: ChecklistItem[] }) => s.checklist_json ?? []
  )

  const topFailingItems = aggregateFailingItems(checklists)

  return NextResponse.json({ funnelMetrics, topFailingItems })
}
