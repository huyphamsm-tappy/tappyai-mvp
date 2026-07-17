// user_acquisition service — the single reusable writer for the permanent
// acquisition dimension (SR-1, SR-4). All population (backfill SQL, the future
// Step 3 cron, any event-driven update) goes through fn_upsert_user_acquisition;
// the merge logic (first-write-wins acquisition attributes, earliest/latest
// login) lives once in that SQL function. This module is the thin, typed,
// platform-agnostic caller + pure mappers.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AcquisitionInput {
  user_id: string
  anon_id?: string | null
  signup_method?: string | null
  signup_platform?: string | null
  signup_app_version?: string | null
  signup_device_type?: string | null
  signup_country?: string | null
  signup_language?: string | null
  acquisition_source?: string | null
  signup_at?: string | null
  first_login_at?: string | null
  last_login_at?: string | null
}

// Minimal shape of a stored/emitted analytics event this service reads from.
export interface AuthAnalyticsEvent {
  user_id?: string | null
  anon_id?: string | null
  platform?: string | null
  app_version?: string | null
  device_type?: string | null
  country?: string | null
  language?: string | null
  client_timestamp?: string | null
  metadata?: Record<string, unknown> | null
}

// Pure: map a signup event → acquisition input (sets the durable signup_* fields
// + first_login_at ≈ signup). Returns null if the event has no user_id.
export function acquisitionFromSignupEvent(e: AuthAnalyticsEvent): AcquisitionInput | null {
  if (!e.user_id) return null
  const m = e.metadata ?? {}
  return {
    user_id: e.user_id,
    anon_id: e.anon_id ?? null,
    signup_method: (m.method as string) ?? null,
    signup_platform: e.platform ?? null,
    signup_app_version: e.app_version ?? null,
    signup_device_type: e.device_type ?? null,
    signup_country: e.country ?? null,
    signup_language: e.language ?? null,
    acquisition_source: (m.acquisition_source as string) ?? 'organic',
    signup_at: e.client_timestamp ?? null,
    first_login_at: e.client_timestamp ?? null,
  }
}

// Pure: map a login event → acquisition input (advances login timestamps only;
// first-write-wins protects the signup_* fields at the DB layer).
export function acquisitionFromLoginEvent(e: AuthAnalyticsEvent): AcquisitionInput | null {
  if (!e.user_id) return null
  const isFirst = (e.metadata ?? {}).is_first_login === true
  return {
    user_id: e.user_id,
    last_login_at: e.client_timestamp ?? null,
    first_login_at: isFirst ? (e.client_timestamp ?? null) : null,
  }
}

// Pure: map AcquisitionInput → fn_upsert_user_acquisition RPC parameters.
export function toRpcParams(input: AcquisitionInput): Record<string, unknown> {
  return {
    p_user_id: input.user_id,
    p_anon_id: input.anon_id ?? null,
    p_signup_method: input.signup_method ?? null,
    p_signup_platform: input.signup_platform ?? null,
    p_signup_app_version: input.signup_app_version ?? null,
    p_signup_device_type: input.signup_device_type ?? null,
    p_signup_country: input.signup_country ?? null,
    p_signup_language: input.signup_language ?? null,
    p_acquisition_source: input.acquisition_source ?? null,
    p_signup_at: input.signup_at ?? null,
    p_first_login_at: input.first_login_at ?? null,
    p_last_login_at: input.last_login_at ?? null,
  }
}

// Idempotent upsert via the single DB merge function. Uses the service-role
// client by default (bypasses RLS; server-controlled write). The admin client is
// imported lazily so this module's pure functions stay dependency-free (unit-testable).
export async function upsertAcquisition(
  input: AcquisitionInput,
  client?: SupabaseClient
): Promise<{ error: unknown }> {
  const c = client ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const { error } = await c.rpc('fn_upsert_user_acquisition', toRpcParams(input))
  if (error) console.error('[userAcquisition] upsert failed:', (error as { message?: string })?.message)
  return { error }
}
