import type { SupabaseClient } from '@supabase/supabase-js'

// ── User blocks — the server side (owner 01/10; migration 20261001_user_blocks.sql) ─────────────────────────────────
//
// The database enforces what a block DOES (RLS: no follow, no comment, no posts/comments/notifications of each other).
// This module holds the pieces that need the SERVICE ROLE because "who blocked ME" is deliberately unreadable through RLS:
// hiding blocked accounts from user search and from a profile lookup, where the read is made with the admin client or
// returns public rows RLS does not cover.
//
// OFF by default: `USER_BLOCKS_ENABLED=true` in the server environment turns the API and the client-visible flag on.
// The migration and its policies are inert until someone blocks, whatever this flag says.

export function userBlocksEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.USER_BLOCKS_ENABLED === 'true'
}

// Reports of comments/users (migration 20261001b). OFF by default; `REPORTS_ENABLED=true` turns the two routes and p8.reports on.
export function reportsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REPORTS_ENABLED === 'true'
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * The subset of `ids` that is in a block pair with `me`, in EITHER direction, from `user_blocks` AND the release chat's
 * `chat_blocks`. Service-role client only — never hand the result to the other party.
 * A failed read returns an EMPTY set: this is a visibility filter on top of RLS, not the authority; the database policies
 * still hold. (Failing closed here would make search unusable on a transient error.)
 */
export async function blockedPeers(admin: SupabaseClient, me: string, ids: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const list = [...new Set(ids)].filter((id) => UUID_RE.test(id) && id !== me)
  if (list.length === 0) return out
  try {
    const reads = await Promise.all(['user_blocks', 'chat_blocks'].flatMap((table) => [
      admin.from(table).select('blocked_id').eq('blocker_id', me).in('blocked_id', list),
      admin.from(table).select('blocker_id').eq('blocked_id', me).in('blocker_id', list),
    ]))
    for (const r of reads) for (const row of (r.data ?? []) as Array<{ blocked_id?: string; blocker_id?: string }>) {
      const id = row.blocked_id ?? row.blocker_id
      if (id) out.add(id)
    }
  } catch { /* see above */ }
  return out
}
