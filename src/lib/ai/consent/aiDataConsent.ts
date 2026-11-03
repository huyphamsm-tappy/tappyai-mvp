import type { SupabaseClient } from '@supabase/supabase-js'

// Server side of the AI data consent (App Review 5.1.1(i) / 5.1.2(i)). The iOS app records its decision and its use with
// POST /api/ai-consent; the background jobs and the group suggestion read it here. Chat is gated on the device (see
// ios/TappyAI/Core/Privacy/AIConsent.swift); the server does not see the device and does not gate chat.
//
// Keep AI_DATA_CONSENT_VERSION equal to `AIConsentStore.disclosureVersion` on iOS. Bumping it asks every iOS user again.
// 2: the disclosure now covers review photos, group members' own agreement, chat search results, precise location and
// memory updates. Build 156 text was version 1; those agreements do not carry over.
export const AI_DATA_CONSENT_VERSION = 2

export type ConsentRow = {
  user_id: string
  ios_used: boolean | null
  granted: boolean | null
  decision: string | null
  version: number | null
}

/**
 * Where an account stands for a background AI task.
 *  - web_only: no iOS use recorded. Nothing iOS-originated is involved, so the existing behaviour stands.
 *  - ios_unasked: used iOS, but has not answered the sheet (or it was never shown). Blocked.
 *  - agreed: used iOS and agreed to the current disclosure. Allowed.
 *  - refused / withdrawn: used iOS and said no (or took it back). Blocked.
 *  - stale: agreed to an older disclosure. Blocked until the person agrees again.
 */
export type ConsentState = 'web_only' | 'ios_unasked' | 'agreed' | 'refused' | 'withdrawn' | 'stale'

export function consentState(row: ConsentRow | undefined | null, version: number = AI_DATA_CONSENT_VERSION): ConsentState {
  if (!row || row.ios_used !== true) return 'web_only'
  if (row.granted === true) return row.version === version ? 'agreed' : 'stale'
  if (row.granted === false) return row.decision === 'refused' ? 'refused' : 'withdrawn'
  return 'ios_unasked'
}

/** True when the account's personal data may go to the AI provider in a background task. */
export function isAllowed(state: ConsentState): boolean {
  return state === 'web_only' || state === 'agreed'
}

/** The subset of `userIds` whose personal data may go to the AI provider. Accounts without a row are web_only. */
export function allowedIds(userIds: string[], rows: ConsentRow[] | null | undefined, version: number = AI_DATA_CONSENT_VERSION): Set<string> {
  const byUser = new Map<string, ConsentRow>()
  for (const r of rows ?? []) byUser.set(r.user_id, r)
  return new Set(userIds.filter(id => isAllowed(consentState(byUser.get(id), version))))
}

// The table is absent (migration not applied yet): 42P01 = undefined_table, PGRST205 = not in the PostgREST schema cache.
const SCHEMA_ABSENT_CODES = new Set(['42P01', 'PGRST205'])

/**
 * Reads the consent for `userIds` and returns the allowed subset. Fails closed: if the read errors, nobody is
 * treated as allowed, so the job sends the generic version rather than data it cannot prove may be sent.
 */
export async function loadAllowedUserIds(admin: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  try {
    const { data, error } = await admin
      .from('ai_data_consent')
      .select('user_id, ios_used, granted, decision, version')
      .in('user_id', userIds)
    if (error) {
      // The table does not exist yet (migration not applied): no account can have an iOS record, so every account is
      // web-only and keeps today's behaviour. 42P01 is Postgres' undefined_table; PGRST205 is PostgREST's "table not in
      // the schema cache" (the same signal dbMembership.ts reads). Any other read error is treated as "cannot verify":
      // nobody is allowed.
      if (SCHEMA_ABSENT_CODES.has((error as { code?: string }).code ?? '')) return new Set(userIds)
      console.error('[ai-consent] read failed; no user treated as allowed:', error.message)
      return new Set()
    }
    return allowedIds(userIds, data as ConsentRow[] | null)
  } catch (e) {
    console.error('[ai-consent] read threw; no user treated as allowed:', e)
    return new Set()
  }
}
