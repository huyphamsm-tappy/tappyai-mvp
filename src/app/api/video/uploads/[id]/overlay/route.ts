import { NextRequest, NextResponse } from 'next/server'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { supabaseOverlayStore } from '@/lib/media/video/overlay/overlayStore'
import { guardVideoRoute, isGuarded } from '@/lib/media/video/overlay/routeGuard'
import { MAX_OVERLAY_BYTES, emptyOverlay, overlayTextOf, validateOverlayDoc } from '@/lib/media/video/overlay/schema'
import { unsupportedInTexts } from '@/lib/media/video/overlay/fonts'

/**
 * GET /api/video/uploads/[id]/overlay — the saved text overlay of MY video: { version, doc } (version 0 and an empty document when nothing was saved).
 * PUT /api/video/uploads/[id]/overlay — save it: body { version, doc } where `version` is the version the editor loaded (0 for a first save) and `doc` is overlay schema v1.
 *
 * OFF by default (404 while EXPLORE_VIDEO_PIPELINE_ENABLED is not "true"). Owner only: someone else's asset and an unknown id answer the same 404. The document is validated
 * strictly (unknown fields refused; times inside the clip's own length, as the file's header reported it); a stale `version` answers 409 with the current one and overwrites
 * nothing. `warnings.unsupported_chars` lists characters the download renderer's font cannot draw (the save still succeeds; the download of such text reports its own code).
 * The original video is never touched: this stores JSON next to it.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guardVideoRoute(req, params.id, { key: 'video-overlay-read', max: 120 })
  if (!isGuarded(g)) return g
  try {
    const stored = await supabaseOverlayStore(g.admin).get(g.asset.id)
    return NextResponse.json({ version: stored?.version ?? 0, doc: stored?.doc ?? emptyOverlay() }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'overlay_unavailable', message: serverMessage('server.error', g.locale) }, { status: 503 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guardVideoRoute(req, params.id, { key: 'video-overlay-save', max: 60 })
  if (!isGuarded(g)) return g
  const anonRefusal = refuseAnonymousSocialWrite(req, g.user)
  if (anonRefusal) return anonRefusal

  // Refuse an oversized body before parsing it.
  const tooLarge = () => NextResponse.json({ error: 'overlay_too_large', message: serverMessage('video.overlayTooLarge', g.locale) }, { status: 413 })
  const invalidBody = () => NextResponse.json({ error: 'invalid_body', message: serverMessage('validation.invalid', g.locale) }, { status: 400 })
  const length = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > MAX_OVERLAY_BYTES * 2) return tooLarge()
  let text: string
  try { text = await req.text() } catch { return invalidBody() }
  if (text.length > MAX_OVERLAY_BYTES * 2) return tooLarge()
  let body: unknown
  try { body = JSON.parse(text) } catch { return invalidBody() }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return invalidBody()
  const { version, doc, ...rest } = body as Record<string, unknown>
  if (Object.keys(rest).length > 0 || typeof version !== 'number' || !Number.isInteger(version) || version < 0 || version > 1_000_000) {
    return invalidBody()
  }

  const valid = validateOverlayDoc(doc, { durationMs: g.asset.duration_ms ?? undefined })
  if (!valid.ok) return NextResponse.json({ error: 'invalid_overlay', message: serverMessage('video.invalidOverlay', g.locale), fields: valid.errors }, { status: 400 })
  // A canonical re-serialisation is what is stored, never the caller's own object.
  if (JSON.stringify(valid.doc).length > MAX_OVERLAY_BYTES) return tooLarge()

  let saved
  try {
    saved = await supabaseOverlayStore(g.admin).save(g.asset.id, g.user.id, version, valid.doc)
  } catch {
    return NextResponse.json({ error: 'overlay_unavailable', message: serverMessage('server.error', g.locale) }, { status: 503 })
  }
  if (saved.status === 'not_found') return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', g.locale) }, { status: 404 })
  if (saved.status === 'deleted') return NextResponse.json({ error: 'asset_deleted', message: serverMessage('video.assetDeleted', g.locale) }, { status: 409 })
  if (saved.status === 'conflict') return NextResponse.json({ error: 'version_conflict', message: serverMessage('video.versionConflict', g.locale), version: saved.version }, { status: 409 })

  const unsupported = unsupportedInTexts(overlayTextOf(valid.doc))
  return NextResponse.json({ version: saved.version, ...(unsupported.length > 0 ? { warnings: { unsupported_chars: unsupported } } : {}) })
}
