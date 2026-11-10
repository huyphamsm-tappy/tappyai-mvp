import { NextRequest, NextResponse } from 'next/server'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { searchParam } from '@/lib/http/searchParams'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { getVideoSourceProvider } from '@/lib/media/video/sourceStorage'
import { getTranscoderClient } from '@/lib/media/video/transcoder'
import { supabaseDownloadRenderStore, supabaseOverlayStore } from '@/lib/media/video/overlay/overlayStore'
import { guardVideoRoute, isGuarded, type GuardedVideoRequest } from '@/lib/media/video/overlay/routeGuard'
import { downloadContentDisposition, openDownloadStream, pollDownload, requestDownload, type DownloadDeps, type DownloadOutcome } from '@/lib/media/video/overlay/downloadFlow'
import { watermarkHandle } from '@/lib/media/video/overlay/renderPng'

/**
 * The watermarked download of MY video (Explore video VID-04). OFF by default (404 while EXPLORE_VIDEO_PIPELINE_ENABLED is not "true"); owner only; allowed only for a video
 * that is `ready` or `published` and approved (409 not_ready otherwise).
 *
 * POST  starts the render (text layers + the TappyAI watermark burned into one MP4 built from the ORIGINAL), or reuses the one that exists for the same (video, overlay
 *       version, username). Idempotent: concurrent calls create one job. Answers { status: 'rendering' | 'ready' | 'failed', code? }.
 * GET   where is it: { status: 'none' | 'rendering' | 'ready' | 'failed', code? }. With ?file=1 and the file ready, the MP4 itself is STREAMED through the server as an
 *       attachment (never a storage address); otherwise 409 with the status.
 * The answer never carries an object key, a bucket or a job name. The watermark shows "@handle", derived from the account's display name (there is no username column).
 */

async function context(g: GuardedVideoRequest, req: NextRequest): Promise<{ deps: DownloadDeps; username: string; displayName: string | null } | null> {
  const target = getVideoSourceProvider(process.env, req)
  if (!target) return null
  let displayName: string | null = null
  try {
    const { data } = await g.admin.from('profiles').select('full_name').eq('id', g.user.id).maybeSingle()
    displayName = typeof data?.full_name === 'string' ? data.full_name : null
  } catch { /* the watermark falls back to the generic handle */ }
  return {
    deps: {
      assets: g.store, overlays: supabaseOverlayStore(g.admin), renders: supabaseDownloadRenderStore(g.admin),
      provider: target.provider, transcoder: getTranscoderClient(process.env, req), bucket: target.bucket,
    },
    username: watermarkHandle(displayName),
    displayName,
  }
}

const unavailable = (g: GuardedVideoRequest) => NextResponse.json({ error: 'download_unavailable', message: serverMessage('media.uploadFailed', g.locale) }, { status: 503 })
const asJson = (o: DownloadOutcome, g: GuardedVideoRequest) =>
  NextResponse.json(o.status === 404 ? { ...o.body, message: serverMessage('server.notFound', g.locale) } : o.body, { status: o.status, headers: { 'Cache-Control': 'private, no-store' } })

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guardVideoRoute(req, params.id, { key: 'video-download-start', max: 10 })
  if (!isGuarded(g)) return g
  const anonRefusal = refuseAnonymousSocialWrite(req, g.user)
  if (anonRefusal) return anonRefusal
  const ctx = await context(g, req)
  if (!ctx) return unavailable(g)
  try {
    return asJson(await requestDownload({ ownerId: g.user.id, assetId: g.asset.id, username: ctx.username }, ctx.deps), g)
  } catch {
    return unavailable(g)
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guardVideoRoute(req, params.id, { key: 'video-download-status', max: 120 })
  if (!isGuarded(g)) return g
  const ctx = await context(g, req)
  if (!ctx) return unavailable(g)

  let outcome: DownloadOutcome
  try {
    outcome = await pollDownload({ ownerId: g.user.id, assetId: g.asset.id, username: ctx.username }, ctx.deps)
  } catch {
    return unavailable(g)
  }

  const wantsFile = searchParam(req, 'file') === '1'
  if (!wantsFile) return asJson(outcome, g)
  // The file was asked for and is not there (yet): the status travels with a fixed code and a sentence for people.
  if (!outcome.file) return NextResponse.json({ ...outcome.body, error: 'not_ready', message: serverMessage('video.downloadNotReady', g.locale) }, { status: outcome.status === 200 ? 409 : outcome.status, headers: { 'Cache-Control': 'private, no-store' } })

  try {
    const stream = openDownloadStream(ctx.deps.provider, outcome.file.key, outcome.file.size)
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(outcome.file.size),
        'Content-Disposition': downloadContentDisposition(ctx.displayName),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return unavailable(g)
  }
}
