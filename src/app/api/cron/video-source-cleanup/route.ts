import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { getVideoSourceProvider } from '@/lib/media/video/sourceStorage'
import { runVideoSourceCleanup } from '@/lib/media/video/sourceCleanup'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// video-source-cleanup cron (Explore video, part 3): removes original video files that must not stay in the PRIVATE source bucket — a deleted video, a refused or failed upload,
// an upload started and never completed — and records each removal. A live video and anything under a legal hold is never removed here. Daily; CRON secret required.
// It does nothing (skipped, 200) until GCS_VIDEO_SOURCE_BUCKET is set and migration 20261112 is applied, so it is safe to schedule before the feature is switched on.
// It is NOT gated by EXPLORE_VIDEO_PIPELINE_ENABLED on purpose: deleting must keep working if the feature is switched off again. Counts only are logged — never keys.

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const target = getVideoSourceProvider(process.env, req)
    const result = await runVideoSourceCleanup({
      db: createAdminClient(),
      provider: target?.provider ?? null,
      bucket: target?.bucket ?? null,
      deadline: Date.now() + 50_000,
    })
    console.log(JSON.stringify({ type: 'tappyai_cron', job: 'video-source-cleanup', ok: true, ...result }))
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error(JSON.stringify({ type: 'tappyai_cron', job: 'video-source-cleanup', ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
    return NextResponse.json({ ok: false, error: 'cleanup_failed' }, { status: 500 })
  }
}
