import { NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { fetchPublicPage } from '@/lib/security/safePageFetch'
import { supabaseVersionStore } from '@/lib/scam-shield/knowledge/versionStore'
import { runScamShieldSync, SYNC_USER_AGENT, type PageResult } from '@/lib/scam-shield/sync/run'
import { isSyncAiEnabled, structureWithAi } from '@/lib/scam-shield/sync/aiStructure'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// GET /api/cron/scam-shield-sync — the WEEKLY refresh of Scam Shield's official knowledge (owner 18/11/2026).
// Scheduled in vercel.json ("0 3 * * 1" = Monday 03:00 UTC = 10:00 Vietnam). Behind the CRON secret like every other cron route.
//
// It reads ONLY the allow-listed official hosts (OFFICIAL_SOURCE_HOSTS), through the SSRF-safe page fetcher (https only, pinned DNS, byte cap,
// timeouts), identifies itself as "TappyAI/1.0 https://www.tappyai.com", and stores what it finds in scam_knowledge_versions. Whether a page
// goes live by itself or waits for a person is decided by sync/policy.ts. The model step is OFF unless SCAM_SHIELD_SYNC_AI=true.
// The response is counts and URLs of official pages only — never a secret, never page text.

async function fetchPage(url: string): Promise<PageResult> {
  const r = await fetchPublicPage(url, {
    allowHttp: false,
    maxBytes: 1_500_000,
    maxRedirects: 3,
    connectTimeoutMs: 5_000,
    readTimeoutMs: 8_000,
    totalTimeoutMs: 15_000,
    decodeCompressed: true,
    userAgent: SYNC_USER_AGENT,
  })
  return r.ok ? { ok: true, body: r.body, finalUrl: r.finalUrl } : { ok: false, reason: r.reason }
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const report = await runScamShieldSync({
      store: supabaseVersionStore(),
      fetchPage,
      ...(isSyncAiEnabled() ? { structure: async (a) => { const s = await structureWithAi(a); return s ? { ...s } : null } } : {}),
    })
    const failed = report.errors.includes('store_unavailable')
    console.info('[scam-shield-sync]', JSON.stringify({ inserted: report.inserted.length, unchanged: report.unchanged, skipped: report.skipped.length, errors: report.errors.length, ai: isSyncAiEnabled() }))
    return NextResponse.json({ ok: !failed, ...report }, { status: failed ? 503 : 200 })
  } catch (err) {
    console.error('[scam-shield-sync] failed:', err instanceof Error ? err.name : 'error')
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 })
  }
}
