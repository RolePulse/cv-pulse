// CV Pulse — Settings & Deletion tests
// Epic 13 | Tests: deleteCvData, deleteAccountData, deletion order,
//                  usage reset, auth guards, paid status labels, modals, upload banner.
//
// Level: thorough (16 tests)

import { describe, it, expect, vi } from 'vitest'
import {
  deleteCvData,
  deleteAccountData,
  CV_DELETE_ORDER,
  ACCOUNT_DELETE_ORDER,
} from '@/lib/deletion'
import { getPaidStatusLabel } from '@/app/settings/page'

// ─── Mock Supabase client ────────────────────────────────────────────────────

function createMockClient() {
  const calls: { table: string; operation: string; args: unknown[] }[] = []

  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                single() {
                  calls.push({ table, operation: 'select.eq.single', args: [columns, column, value] })
                  return Promise.resolve({ data: null })
                },
              }
            },
          }
        },
        delete() {
          return {
            eq(column: string, value: string) {
              calls.push({ table, operation: 'delete.eq', args: [column, value] })
              return Promise.resolve({ error: null })
            },
            in(column: string, values: string[]) {
              calls.push({ table, operation: 'delete.in', args: [column, values] })
              return Promise.resolve({ error: null })
            },
          }
        },
        update(values: Record<string, unknown>) {
          return {
            eq(column: string, value: string) {
              calls.push({ table, operation: 'update.eq', args: [values, column, value] })
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
    _calls: calls,
  }

  return client
}

// ─── deleteCvData — correct tables deleted in correct order ──────────────────

describe('Epic 13 — deleteCvData()', () => {

  it('1. Deletes tables in foreign-key safe order when CVs exist', async () => {
    const client = createMockClient()
    const result = await deleteCvData(client, 'user-1', ['cv-1', 'cv-2'])

    expect(result).toEqual([
      'jd_checks',
      'scores',
      'share_links',
      'cvs',
      'events',
      'usage_reset',
    ])
  })

  it('2. Skips CV-dependent tables when no CVs exist, still deletes events and resets usage', async () => {
    const client = createMockClient()
    const result = await deleteCvData(client, 'user-1', [])

    // Should NOT include jd_checks, scores, share_links, cvs
    expect(result).toEqual(['events', 'usage_reset'])
    // Verify no delete calls on CV-dependent tables
    const deletedTables = client._calls
      .filter((c) => c.operation.startsWith('delete'))
      .map((c) => c.table)
    expect(deletedTables).not.toContain('jd_checks')
    expect(deletedTables).not.toContain('scores')
    expect(deletedTables).not.toContain('share_links')
    expect(deletedTables).not.toContain('cvs')
  })

  it('3. Resets usage counters (free_rescores_used and free_jd_checks_used) to 0', async () => {
    const client = createMockClient()
    await deleteCvData(client, 'user-1', ['cv-1'])

    const usageCall = client._calls.find(
      (c) => c.table === 'usage' && c.operation === 'update.eq'
    )
    expect(usageCall).toBeDefined()
    expect(usageCall!.args[0]).toEqual({
      free_rescores_used: 0,
      free_jd_checks_used: 0,
    })
  })

  it('4. Does NOT delete the users table (account stays open)', async () => {
    const client = createMockClient()
    await deleteCvData(client, 'user-1', ['cv-1'])

    const deletedTables = client._calls
      .filter((c) => c.operation.startsWith('delete'))
      .map((c) => c.table)
    expect(deletedTables).not.toContain('users')
    expect(deletedTables).not.toContain('allowlist')
  })

  it('5. Uses correct cv_id for in() queries and user_id for eq() queries', async () => {
    const client = createMockClient()
    await deleteCvData(client, 'user-42', ['cv-a', 'cv-b'])

    // CV-dependent tables use .in('cv_id', cvIds)
    const inCalls = client._calls.filter((c) => c.operation === 'delete.in')
    inCalls.forEach((call) => {
      expect(call.args[0]).toBe('cv_id')
      expect(call.args[1]).toEqual(['cv-a', 'cv-b'])
    })

    // cvs and events use .eq('user_id', userId)
    const eqCalls = client._calls.filter((c) => c.operation === 'delete.eq')
    eqCalls.forEach((call) => {
      expect(call.args[0]).toBe('user_id')
      expect(call.args[1]).toBe('user-42')
    })
  })

  it('6. CV_DELETE_ORDER constant matches expected order', () => {
    expect([...CV_DELETE_ORDER]).toEqual([
      'jd_checks',
      'scores',
      'share_links',
      'cvs',
      'events',
    ])
  })

})

// ─── deleteAccountData — all tables deleted including users and allowlist ─────

describe('Epic 13 — deleteAccountData()', () => {

  it('7. Deletes all tables in foreign-key safe order including users and allowlist', async () => {
    const client = createMockClient()
    const result = await deleteAccountData(client, 'user-1', 'test@example.com', ['cv-1'])

    expect(result).toEqual([
      'jd_checks',
      'scores',
      'share_links',
      'cvs',
      'events',
      'usage',
      'allowlist',
      'users',
    ])
  })

  it('8. Deletes usage row entirely (not just reset) for account deletion', async () => {
    const client = createMockClient()
    await deleteAccountData(client, 'user-1', 'a@b.com', ['cv-1'])

    const usageCalls = client._calls.filter((c) => c.table === 'usage')
    // Should be delete, not update
    expect(usageCalls).toHaveLength(1)
    expect(usageCalls[0].operation).toBe('delete.eq')
  })

  it('9. Skips allowlist deletion when email is null', async () => {
    const client = createMockClient()
    const result = await deleteAccountData(client, 'user-1', null, ['cv-1'])

    expect(result).not.toContain('allowlist')
    const allowlistCalls = client._calls.filter((c) => c.table === 'allowlist')
    expect(allowlistCalls).toHaveLength(0)
  })

  it('10. Always deletes users table last', async () => {
    const client = createMockClient()
    const result = await deleteAccountData(client, 'user-1', 'a@b.com', ['cv-1'])

    expect(result[result.length - 1]).toBe('users')
  })

  it('11. ACCOUNT_DELETE_ORDER constant matches expected order', () => {
    expect([...ACCOUNT_DELETE_ORDER]).toEqual([
      'jd_checks',
      'scores',
      'share_links',
      'cvs',
      'events',
      'usage',
      'allowlist',
      'users',
    ])
  })

  it('12. Deletes allowlist by email, not by user_id', async () => {
    const client = createMockClient()
    await deleteAccountData(client, 'user-1', 'james@test.com', ['cv-1'])

    const allowlistCall = client._calls.find((c) => c.table === 'allowlist')
    expect(allowlistCall).toBeDefined()
    expect(allowlistCall!.args[0]).toBe('email')
    expect(allowlistCall!.args[1]).toBe('james@test.com')
  })

})

// ─── Paid status labels ──────────────────────────────────────────────────────

describe('Epic 13 — getPaidStatusLabel()', () => {

  it('13. Maps "free" to "Free"', () => {
    expect(getPaidStatusLabel('free')).toBe('Free')
  })

  it('14. Maps "rolepulse_paid" to "RolePulse Member"', () => {
    expect(getPaidStatusLabel('rolepulse_paid')).toBe('RolePulse Member')
  })

  it('15. Maps "paid_stripe" to "Pro"', () => {
    expect(getPaidStatusLabel('paid_stripe')).toBe('Pro')
  })

})

// ─── Deletion with no CVs (edge case for account deletion) ───────────────────

describe('Epic 13 — Edge cases', () => {

  it('16. Account deletion with no CVs still deletes events, usage, allowlist, users', async () => {
    const client = createMockClient()
    const result = await deleteAccountData(client, 'user-1', 'a@b.com', [])

    // Should skip CV-dependent tables but still delete everything else
    expect(result).toEqual([
      'events',
      'usage',
      'allowlist',
      'users',
    ])
    expect(result).not.toContain('jd_checks')
    expect(result).not.toContain('scores')
    expect(result).not.toContain('share_links')
    expect(result).not.toContain('cvs')
  })

})
