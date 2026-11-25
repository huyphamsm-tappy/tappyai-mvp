import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { getVideoDeliveryProvider } from '@/lib/media/video/deliveryStorage'
import { supabaseVideoDeliveryStore } from '@/lib/media/video/deliveryStore'
import { getCdnInvalidator } from '@/lib/media/video/cdnInvalidate'
import { runVideoTakedownSweep } from '@/lib/media/video/takedown'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// video-takedown cron (Explore video, publishing + delivery): removes the approved HLS copy of every video that must no longer be served — a video that left `published`
// (rejected, review_required after a report, deleted) or whose post is hidden, held or deleted (that one is first moved to review_required) — then invalidates its CDN path.
// Idempotent and retryable with a bounded attempt count per video. CRON secret required. It does nothing (skipped, 200) until GCS_VIDEO_DELIVERY_BUCKET is set and migration
// 20261116 is applied, so it is safe to schedule before the feature is switched on. NOT gated by EXPLORE_VIDEO_PIPELINE_ENABLED on purpose: taking content down must keep
// working if the feature is switched off again. Counts only are logged — never keys.

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const target = getVideoDeliveryProvider(process.env, req)
    const result = await runVideoTakedownSweep({
      store: supabaseVideoDeliveryStore(createAdminClient()),
      delivery: target?.provider ?? null,
      cdn: getCdnInvalidator(process.env, req),
      deadline: Date.now() + 50_000,
    })
    console.log(JSON.stringify({ type: 'tappyai_cron', job: 'video-takedown', ok: true, ...result }))
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error(JSON.stringify({ type: 'tappyai_cron', job: 'video-takedown', ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
    return NextResponse.json({ ok: false, error: 'takedown_failed' }, { status: 500 })
  }
}
