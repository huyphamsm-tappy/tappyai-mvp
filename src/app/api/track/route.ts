import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import { rebuildProfile } from '@/lib/preferences/profileCache'
import { randomUUID } from 'crypto'

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
])
const REBUILD_SIGNALS = new Set(['chat_search', 'review_search', 'hide', 'not_interested', 'report'])

const MAX_BATCH = 100          // §8A.3 payload cap
const MAX_EVENT_BYTES = 8_192  // §8A.3 per-event size cap
const PII_RE = /[\w.+-]+@[\w-]+\.[\w-]{2,}|\+?\d[\d\s().-]{7,}\d/ // email / phone (§8A.3 PII reject)

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
    .filter((e) => !PII_RE.test(JSON.stringify(e.metadata ?? {})))
    .filter((e) => user || e.anon_id) // must have an identity
    .map((e) => ({
      event_id: e.event_id || randomUUID(),
      schema_version: typeof e.schema_version === 'number' ? e.schema_version : 1,
      user_id: user?.id ?? null,
      anon_id: e.anon_id ?? null,
      event_type: e.event_type as string,
      metadata: e.metadata ?? {},
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
      device_context: e.device_context ?? null, // full cross-platform device contract
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
