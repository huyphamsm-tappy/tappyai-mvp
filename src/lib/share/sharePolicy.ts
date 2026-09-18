// ─────────────────────────────────────────────────────────────────────────────
// Who may publish a public share, and under which caps. One decision, used by
// both the preview and the create route so the preview can never promise what
// the create refuses.
//
//   REAL ACCOUNT      → may share any of its own answers.
//   ANONYMOUS SESSION → may share ONLY an answer reached from an existing public
//                       share (a "child share": `parentSlug` resolves), under
//                       SHARE_DAILY_LIMIT_ANON. The page it creates is public
//                       but noindex + unlisted while the owner stays anonymous.
//
// This is the second generation of the viral loop without a publishing tool
// for anonymous sessions: a stranger cannot mint indexable pages, but a
// recipient who got value can pass it on before they sign up.
// ─────────────────────────────────────────────────────────────────────────────

import { isAnonymousUser, type MaybeAnonymousUser } from '@/lib/auth/socialWriteAccess'
import { SHARE_DAILY_LIMIT, SHARE_DAILY_LIMIT_ANON } from '@/lib/config/product'
import { getPublicSharedResult } from './sharedResultStore'

export type SharePolicyDecision =
  | { ok: true; ownerIsAnonymous: false; parentId: string | null; dailyLimit: number; limitKey: string }
  | { ok: true; ownerIsAnonymous: true; parentId: string; dailyLimit: number; limitKey: string }
  | { ok: false; code: 'account_required' | 'parent_not_found' }

/** Pure apart from the parent lookup, which is injected so the rule is testable. */
export async function decideSharePolicy(
  user: MaybeAnonymousUser & { id: string },
  parentSlug: string | undefined,
  lookupParent: (slug: string) => Promise<{ id: string } | null> = async (slug) => getPublicSharedResult(slug),
): Promise<SharePolicyDecision> {
  const parent = parentSlug ? await lookupParent(parentSlug) : null
  if (parentSlug && !parent) return { ok: false, code: 'parent_not_found' }
  if (!isAnonymousUser(user)) {
    return { ok: true, ownerIsAnonymous: false, parentId: parent?.id ?? null, dailyLimit: SHARE_DAILY_LIMIT, limitKey: `share-daily:uid:${user.id}` }
  }
  if (!parent) return { ok: false, code: 'account_required' }
  return { ok: true, ownerIsAnonymous: true, parentId: parent.id, dailyLimit: SHARE_DAILY_LIMIT_ANON, limitKey: `share-daily:anon:${user.id}` }
}
