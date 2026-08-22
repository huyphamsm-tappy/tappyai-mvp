// Module 08 — reading identity fields that live in `auth.users`, not `profiles`.
//
// WHY THIS EXISTS. `profiles.email` was removed by
// `supabase/migrations/add_profiles_email_isolation.sql`: it was a duplicate of
// `auth.users.email` and, because `profiles` is public-read, it let the
// anonymous internet enumerate every address. The canonical address now lives
// in the `auth` schema, which PostgREST does not expose at all — so it is
// reachable ONLY through the GoTrue Admin API, and only with `service_role`.
//
// That is the entire reason the user LIST does not carry email addresses:
// there is no join and no batch lookup, so a list of 50 users would cost 50
// round trips. The list identifies people by name; the detail view spends one
// lookup on the address. `10_User_Management.md` §2 puts email in the list
// columns — this is a stated deviation, driven by the isolation migration that
// postdates it, not by an oversight.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One user's email address from `auth.users`, or null.
 *
 * Never throws: an address the directory cannot produce must degrade to "no
 * address shown", not take down the whole detail view. The failure is logged
 * rather than swallowed, so a broken service-role key is visible.
 */
export async function getEmailById(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error) {
      console.error('[admin][users] auth lookup failed:', error.message)
      return null
    }
    return data.user?.email ?? null
  } catch (err) {
    console.error('[admin][users] auth lookup threw:', err instanceof Error ? err.message : err)
    return null
  }
}

/** How many `auth.users` pages an email search will walk before giving up. */
export const EMAIL_SEARCH_PAGE_SIZE = 1000
export const EMAIL_SEARCH_MAX_PAGES = 10

export interface EmailLookup {
  userId: string | null
  /**
   * False when the walk hit `EMAIL_SEARCH_MAX_PAGES` with pages still to read.
   * A `userId: null, exhaustive: false` result means "not found in the part of
   * the directory we looked at" — which is NOT the same as "no such user", and
   * the caller must report the difference rather than showing an empty list as
   * if it were an answer.
   */
  exhaustive: boolean
}

/**
 * Find a user id by EXACT email address.
 *
 * Exact, never a substring: a prefix match against the whole directory is a
 * user-enumeration primitive — `?q=@gmail.com` would page out every Gmail
 * account on the platform. The caller must already know the address.
 *
 * The linear walk is the only mechanism available: GoTrue's list endpoint takes
 * a page number and nothing else, so there is no server-side filter to push
 * this into. It is bounded rather than unbounded so one search cannot issue an
 * unlimited number of Admin API calls; the bound is reported, not hidden.
 */
export async function findIdByEmail(admin: SupabaseClient, email: string): Promise<EmailLookup> {
  const needle = email.trim().toLowerCase()

  for (let page = 1; page <= EMAIL_SEARCH_MAX_PAGES; page++) {
    let users: { id: string; email?: string | null }[]
    try {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: EMAIL_SEARCH_PAGE_SIZE,
      })
      if (error) {
        console.error('[admin][users] email search failed:', error.message)
        return { userId: null, exhaustive: false }
      }
      users = data.users ?? []
    } catch (err) {
      console.error('[admin][users] email search threw:', err instanceof Error ? err.message : err)
      return { userId: null, exhaustive: false }
    }

    const hit = users.find((u) => u.email?.toLowerCase() === needle)
    if (hit) return { userId: hit.id, exhaustive: true }

    // A short page is the last page. Reaching it without a match means the
    // whole directory was read, so the negative answer is trustworthy.
    if (users.length < EMAIL_SEARCH_PAGE_SIZE) return { userId: null, exhaustive: true }
  }

  return { userId: null, exhaustive: false }
}
