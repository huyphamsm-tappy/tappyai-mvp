// The account's explicit acceptance of the conditions for POSTING A CLIP (owner 05/11/2026: every account must accept, otherwise it cannot post a clip; it can still watch).
// Separate from the iOS-era ai_data_consent on purpose: that gate treats a web-only account as allowed, which is not the owner's rule for clips. The wording that is accepted is in
// src/lib/i18n/video.ts (`video.consent.body`); a new wording means a new VIDEO_CLIP_CONSENT_VERSION, and the old acceptance stops counting.
//
// Fail-closed: no record, a withdrawn one, another version, or a read that fails all mean "not accepted".

import type { SupabaseClient } from '@supabase/supabase-js'

export const VIDEO_CLIP_CONSENT_VERSION = 1

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function hasClipConsent(admin: SupabaseClient, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false
  try {
    const { data, error } = await admin.from('video_clip_consents').select('version, withdrawn_at').eq('user_id', userId).maybeSingle()
    if (error || !data) return false
    return data.version === VIDEO_CLIP_CONSENT_VERSION && data.withdrawn_at === null
  } catch {
    return false
  }
}

export async function recordClipConsent(admin: SupabaseClient, userId: string): Promise<void> {
  if (!UUID.test(userId)) throw new Error('clip consent: not a user id')
  const { error } = await admin.from('video_clip_consents').upsert({ user_id: userId, version: VIDEO_CLIP_CONSENT_VERSION, accepted_at: new Date().toISOString(), withdrawn_at: null })
  if (error) throw new Error('clip consent: write failed')
}

export async function withdrawClipConsent(admin: SupabaseClient, userId: string): Promise<void> {
  if (!UUID.test(userId)) throw new Error('clip consent: not a user id')
  const { error } = await admin.from('video_clip_consents').update({ withdrawn_at: new Date().toISOString() }).eq('user_id', userId)
  if (error) throw new Error('clip consent: write failed')
}
