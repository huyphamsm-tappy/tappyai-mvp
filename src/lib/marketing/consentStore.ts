import type { SupabaseClient } from '@supabase/supabase-js'
import {
  GLOBAL_CONSENT_CHANNEL,
  MARKETING_CHANNELS,
  type ConsentChannel,
  type ConsentRow,
  type MarketingChannel,
} from './governance'

// ─── V2.2-2 MARKETING — THE CONSENT STORE ────────────────────────────────────
//
// Contract: M-1 (absence = opted out) · M-3 (per channel) · M-10 (global
// unsubscribe) · M-24 (a revocation stays evidenced).
//
// 🚨 THIS FILE NEVER INVENTS A ROW. There is no "ensure a row exists" helper
// and no default seeding, because a row that this code creates on someone's
// behalf is a consent record nobody gave. Rows appear only when a person acts,
// through `setChannelConsent` or `setGlobalUnsubscribe`.
//
// 🚨 AND IT NEVER DELETES ONE. Opting out UPDATEs `opted_in = false` and stamps
// `opted_out_at`. Deleting would return the user to "absence", which reads as
// opted out and is therefore *behaviourally* identical — and would destroy the
// evidence that they ever asked (M-24). The two states are the same to the
// dispatcher and completely different to an auditor.

/** The columns every read below selects. */
const CONSENT_COLUMNS = 'channel, opted_in'

/**
 * One user's consent rows.
 *
 * AN EMPTY ARRAY IS A VALID, MEANINGFUL ANSWER: it is what "has never opted in"
 * looks like, and `hasChannelConsent` reads it as a refusal. It is not an error
 * and must never be turned into one.
 *
 * Throws on a query failure rather than returning `[]`. That distinction is the
 * whole point: a failed read that returned an empty array would look exactly
 * like a user who never consented, and the dispatcher would silently skip them
 * — a fail-safe outcome by luck rather than by design, and one that would hide
 * a broken database from every caller.
 */
export async function readConsent(
  admin: SupabaseClient,
  userId: string,
): Promise<ConsentRow[]> {
  const { data, error } = await admin
    .from('marketing_consent')
    .select(CONSENT_COLUMNS)
    .eq('user_id', userId)

  if (error) throw new Error(`marketing consent: read failed: ${error.message}`)
  return (data ?? []) as ConsentRow[]
}

/**
 * Consent rows for MANY users, keyed by user id.
 *
 * Used by the dispatch path, which must decide for a whole audience without one
 * round trip per person. A user with no rows is ABSENT FROM THE MAP, and the
 * caller must treat a missing entry as an empty array — i.e. opted out. That is
 * why the return type is a Map rather than a record pre-filled with defaults:
 * a pre-filled default is exactly the shape a bug would take.
 */
export async function readConsentForUsers(
  admin: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, ConsentRow[]>> {
  const byUser = new Map<string, ConsentRow[]>()
  if (userIds.length === 0) return byUser

  const { data, error } = await admin
    .from('marketing_consent')
    .select(`user_id, ${CONSENT_COLUMNS}`)
    .in('user_id', [...userIds])

  if (error) throw new Error(`marketing consent: bulk read failed: ${error.message}`)

  for (const row of data ?? []) {
    const r = row as { user_id: string } & ConsentRow
    const list = byUser.get(r.user_id) ?? []
    list.push({ channel: r.channel, opted_in: r.opted_in })
    byUser.set(r.user_id, list)
  }
  return byUser
}

/** The timestamps a write stamps, so an opt-in and an opt-out are both dated. */
function stamps(optedIn: boolean, now: Date) {
  const iso = now.toISOString()
  return optedIn
    ? { opted_in_at: iso, opted_out_at: null }
    : // `opted_in_at` is deliberately LEFT ALONE on an opt-out: when they first
      // agreed is a separate fact from when they withdrew, and overwriting it
      // would erase the only record that consent was ever given.
      { opted_out_at: iso }
}

/**
 * Record this user's choice for one channel.
 *
 * UPSERT on the unique `(user_id, channel)`. Re-stating an existing choice is
 * therefore idempotent, which matters because a settings screen re-submits
 * freely and a double-tap must not produce two rows.
 */
export async function setChannelConsent(
  admin: SupabaseClient,
  userId: string,
  channel: MarketingChannel,
  optedIn: boolean,
  now: Date = new Date(),
): Promise<void> {
  const { error } = await admin.from('marketing_consent').upsert(
    {
      user_id: userId,
      channel,
      opted_in: optedIn,
      updated_at: now.toISOString(),
      ...stamps(optedIn, now),
    },
    { onConflict: 'user_id,channel' },
  )
  if (error) throw new Error(`marketing consent: write failed: ${error.message}`)
}

/**
 * Set or clear the global unsubscribe (M-10).
 *
 * `unsubscribed = true` writes the `global` row with `opted_in = false`, which
 * overrides every per-channel row for that user at dispatch time.
 *
 * 🔑 CLEARING IT RESTORES NOTHING BY ITSELF. Setting `unsubscribed = false`
 * writes `opted_in = true` on the `global` row, which merely stops the override
 * — the per-channel rows still have to say yes on their own. Anything else
 * would mean "resubscribe" silently re-granted consent the user never re-gave.
 */
export async function setGlobalUnsubscribe(
  admin: SupabaseClient,
  userId: string,
  unsubscribed: boolean,
  now: Date = new Date(),
): Promise<void> {
  const optedIn = !unsubscribed
  const { error } = await admin.from('marketing_consent').upsert(
    {
      user_id: userId,
      channel: GLOBAL_CONSENT_CHANNEL satisfies ConsentChannel,
      opted_in: optedIn,
      updated_at: now.toISOString(),
      ...stamps(optedIn, now),
    },
    { onConflict: 'user_id,channel' },
  )
  if (error) throw new Error(`marketing consent: global write failed: ${error.message}`)
}

/** The shape the settings screen renders. Derived, never stored. */
export interface ConsentView {
  channels: Record<MarketingChannel, boolean>
  globallyUnsubscribed: boolean
}

/**
 * Project raw rows into what a person sees.
 *
 * EVERY CHANNEL IS PRESENT IN THE OUTPUT and defaults to `false`. A settings
 * screen that rendered only the channels with rows would show nothing at all to
 * a new user, and "no toggles" reads as "no choice available" rather than "you
 * have not opted in".
 */
export function toConsentView(rows: readonly ConsentRow[]): ConsentView {
  const channels = Object.fromEntries(
    MARKETING_CHANNELS.map((c) => [c, rows.find((r) => r.channel === c)?.opted_in === true]),
  ) as Record<MarketingChannel, boolean>

  const global = rows.find((r) => r.channel === GLOBAL_CONSENT_CHANNEL)
  return { channels, globallyUnsubscribed: global !== undefined && global.opted_in === false }
}
