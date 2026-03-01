// CV Pulse — Deletion Helpers
// Epic 13 | Pure functions for deleting CV data and account data.
// Extracted from API routes so they can be unit-tested without real Supabase.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DeletionClient = any

/**
 * Tables deleted when deleting CV data, in foreign-key safe order.
 * Usage is updated (reset), not deleted.
 */
export const CV_DELETE_ORDER = [
  'jd_checks',
  'scores',
  'share_links',
  'cvs',
  'events',
] as const

/**
 * Tables deleted when deleting an account, in foreign-key safe order.
 */
export const ACCOUNT_DELETE_ORDER = [
  'jd_checks',
  'scores',
  'share_links',
  'cvs',
  'events',
  'usage',
  'allowlist',
  'users',
] as const

/**
 * Delete all CV data for a user. Account stays open.
 * Returns the list of tables that were operated on, in order.
 */
export async function deleteCvData(
  client: DeletionClient,
  userId: string,
  cvIds: string[]
): Promise<string[]> {
  const operated: string[] = []

  // Delete CV-dependent rows
  if (cvIds.length > 0) {
    await client.from('jd_checks').delete().in('cv_id', cvIds)
    operated.push('jd_checks')
    await client.from('scores').delete().in('cv_id', cvIds)
    operated.push('scores')
    await client.from('share_links').delete().in('cv_id', cvIds)
    operated.push('share_links')
    await client.from('cvs').delete().eq('user_id', userId)
    operated.push('cvs')
  }

  // Delete events
  await client.from('events').delete().eq('user_id', userId)
  operated.push('events')

  // Reset usage counters (not delete)
  await client.from('usage').update({ free_rescores_used: 0, free_jd_checks_used: 0 }).eq('user_id', userId)
  operated.push('usage_reset')

  return operated
}

/**
 * Delete an entire account and all associated data.
 * Returns the list of tables that were operated on, in order.
 */
export async function deleteAccountData(
  client: DeletionClient,
  userId: string,
  userEmail: string | null,
  cvIds: string[]
): Promise<string[]> {
  const operated: string[] = []

  // Delete CV-dependent rows
  if (cvIds.length > 0) {
    await client.from('jd_checks').delete().in('cv_id', cvIds)
    operated.push('jd_checks')
    await client.from('scores').delete().in('cv_id', cvIds)
    operated.push('scores')
    await client.from('share_links').delete().in('cv_id', cvIds)
    operated.push('share_links')
    await client.from('cvs').delete().eq('user_id', userId)
    operated.push('cvs')
  }

  await client.from('events').delete().eq('user_id', userId)
  operated.push('events')
  await client.from('usage').delete().eq('user_id', userId)
  operated.push('usage')

  if (userEmail) {
    await client.from('allowlist').delete().eq('email', userEmail)
    operated.push('allowlist')
  }

  await client.from('users').delete().eq('id', userId)
  operated.push('users')

  return operated
}
