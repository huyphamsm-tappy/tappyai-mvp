import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import { rebuildProfile } from '@/lib/preferences/profileCache'
import { randomUUID } from 'crypto'
import { ANALYTICS_FORBIDDEN_KEYS, stripForbiddenKeys } from '@/lib/account/userDataClassification'

// Unified analytics ingestion (Analytics v1.1 §8A). Accepts authenticated AND
// anonymous events, dedups on the client-generated event_id, and is
// forward-compatible: unknown event types are accepted and tagged, never
// hard-rejected, so future analytics modules need no ingestion change.
export const dynamic = 'force-dynamic'

// Known taxonomy — used to (a) tag is_unknown_event and (b) trigger the
// preference-profile rebuild on the signal events. NOT a reject-gate anymore.
const KNOWN_TYPES = new Set([
  'page_view', 'page_time', 'chat_search', 'category_click', 'place_save',
  'place_click', 'review_view', 'deal_click', 'feature_use',
  'review_search', 'review_like', 'review_share', 'review_post',
  'hide', 'not_interested', 'report',
  // Explore → the Ask-Tappy-about-this-place CTA. Phase `click` from the three CTAs, phase
  // `target` from the chat route with the resolved/ambiguous/unresolved verdict.
  'ask_tappy_place',
])
const REBUILD_SIGNALS = new Set(['chat_search', 'review_search', 'hide', 'not_interested', 'report'])

const MAX_BATCH = 100          // §8A.3 payload cap
const MAX_EVENT_BYTES = 8_192  // §8A.3 per-event size cap
const PII_RE = /[\w.+-]+@[\w-]+\.[\w-]{2,}|\+?\d[\d\s().-]{7,}\d/ // email / phone (§8A.3 PII reject)
/**
 * Row identifiers are not phone numbers. A UUID whose hex happens to run
 * digit-heavy (`…-4271-8803-99504723…`) matches the phone half of PII_RE, and
 * ~25% of random UUIDs do — so `review_like`/`place_save`/`ask_tappy_place`
 * events carrying a `review_id` were being dropped silently, one in four.
 * Masked before the PII test; the rule itself is unchanged.
 */
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const hasPii = (metadata: unknown) => PII_RE.test(JSON.stringify(metadata ?? {}).replace(UUID_RE, 'uuid'))

// V3 User Data Foundation — the KEY check, alongside the VALUE check above.
//
// `PII_RE` matches things that LOOK like an email or a phone number. A date of
// birth looks like any other date, so no value pattern can find it; a stored
// age looks like any other small integer. What identifies them is the key they
// arrive under. Stripping by key is therefore not redundant with PII_RE — the
// two close opposite halves of the same door.
//
// Stripped rather than rejected: analytics is best-effort by design
// (`tracker.ts` fails silently), so dropping the whole event would turn a
// privacy guard into silent data loss for the events that are fine. The removed
// KEY NAMES are logged — never their values — so a client trying to send a date
// of birth is visible rather than quietly cleaned up forever.

interface IncomingEvent {
  event_id?: string
  schema_version?: number
  anon_id?: string
  event_type?: string
  metadata?: Record<string, unknown>
  platform?: string
  app_version?: string
  build_number?: string
  os_name?: string
  os_version?: string
  device_type?: string
  language?: string
  session_id?: string
  client_timestamp?: string
  // Full cross-platform device contract (see src/lib/tracking/deviceContext.ts).
  // Stored verbatim in the additive user_events.device_context jsonb column; the
  // flat columns above remain the indexed hot dimensions used by the rollups.
  device_context?: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  // Authenticated OR anonymous — no 401. user_id is set from the session
  // (authoritative, un-spoofable); anonymous events carry anon_id instead.
  const { user, supabase } = await getRequestUser(req)

  // Best-effort rate limit per source (§8A.3). Silent drop keeps tracking non-blocking.
  if (!rateLimit(`track:${clientIp(req)}`, 600, 60_000).ok) {
    return NextResponse.json({ ok: true })
  }

  let events: IncomingEvent[]
  try {
    const body = await req.json()
    events = Array.isArray(body.events) ? body.events : []
    if (!events.length) return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const country = req.headers.get('x-vercel-ip-country') || null
  const nowIso = new Date().toISOString()

  const rows = events
    .slice(0, MAX_BATCH)
    .filter((e) => typeof e.event_type === 'string' && e.event_type.length > 0)
    .filter((e) => JSON.stringify(e).length <= MAX_EVENT_BYTES)
    .filter((e) => !hasPii(e.metadata))
    .filter((e) => user || e.anon_id) // must have an identity
    .map((e) => {
      // Applied to `metadata` AND `device_context`: both are caller-supplied
      // JSON that lands in a column verbatim, so both are places a profile row
      // could be spread into by a well-meaning client.
      const cleanedMeta = stripForbiddenKeys(e.metadata ?? {}, ANALYTICS_FORBIDDEN_KEYS)
      const cleanedCtx = stripForbiddenKeys(e.device_context ?? null, ANALYTICS_FORBIDDEN_KEYS)
      const removed = [...new Set([...cleanedMeta.removed, ...cleanedCtx.removed])]
      if (removed.length) {
        console.warn(`[track] dropped disallowed keys from ${e.event_type}: ${removed.join(', ')}`)
      }
      return { e, metadata: cleanedMeta.value, device_context: cleanedCtx.value }
    })
    .map(({ e, metadata, device_context }) => ({
      event_id: e.event_id || randomUUID(),
      schema_version: typeof e.schema_version === 'number' ? e.schema_version : 1,
      user_id: user?.id ?? null,
      anon_id: e.anon_id ?? null,
      event_type: e.event_type as string,
      metadata,
      is_unknown_event: !KNOWN_TYPES.has(e.event_type as string),
      platform: e.platform ?? null,
      app_version: e.app_version ?? null,
      build_number: e.build_number ?? null,
      os_name: e.os_name ?? null,
      os_version: e.os_version ?? null,
      device_type: e.device_type ?? null,
      country,
      language: e.language ?? null,
      session_id: e.session_id ?? null,
      client_timestamp: e.client_timestamp ?? null,
      device_context, // full cross-platform device contract, key-filtered above
      created_at: nowIso, // server_timestamp
    }))

  if (rows.length) {
    // Service-role write: bypasses RLS so anonymous events insert, and is the
    // server-controlled analytics write path (Analytics §8, DB Governance §4).
    // Idempotent: duplicate event_id (retries / double flush) is a no-op.
    const admin = createAdminClient()
    await admin
      .from('user_events')
      .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true })

    // Preserve existing behaviour: rebuild the preference profile on signal
    // events, for authenticated users only (unchanged).
    if (user && rows.some((r) => REBUILD_SIGNALS.has(r.event_type))) {
      rebuildProfile(user.id, supabase).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
