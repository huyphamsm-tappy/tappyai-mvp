import { NextRequest, NextResponse } from 'next/server'
import { parseTracksQuery } from '@/modules/music/api'
import { browseTracks } from '@/modules/music/services/musicService'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { isTrustedMediaUrl } from '@/lib/media/trustedHosts'
import { requestSearchParams } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

// GET /api/music/tracks?categoryId=&page=&limit=
export async function GET(req: NextRequest) {
  const filter = parseTracksQuery(requestSearchParams(req))
  const result = await browseTracks(filter)
  return NextResponse.json(result)
}

// POST /api/music/tracks — publish an Original Sound (user-owned music).
// The uploader MUST confirm they hold the rights; the RLS insert policy also
// enforces uploaded_by=self + music_type='original_sound' + rights_confirmed.
export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let body: { title?: string; artist?: string; audioUrl?: string; coverUrl?: string; durationSec?: number; rightsConfirmed?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 }) }

  const title = body.title?.trim()
  const audioUrl = body.audioUrl?.trim()
  const durationSec = Math.round(Number(body.durationSec) || 0)

  if (!title || title.length > 120) return NextResponse.json({ error: 'invalid_title', message: serverMessage('music.titleLength', requestLocale(req)) }, { status: 400 })
  // Must point at media storage we own — Blob for everything already stored,
  // Cloud Storage for anything the bridge writes.
  if (!audioUrl || !isTrustedMediaUrl(audioUrl)) {
    return NextResponse.json({ error: 'invalid_file', message: serverMessage('music.invalidFile', requestLocale(req)) }, { status: 400 })
  }
  if (!durationSec || durationSec < 1 || durationSec > 600) return NextResponse.json({ error: 'invalid_duration', message: serverMessage('music.badDuration', requestLocale(req)) }, { status: 400 })
  // The rights confirmation is the whole point — refuse without it.
  if (body.rightsConfirmed !== true) {
    return NextResponse.json({ error: 'rights_required', message: serverMessage('music.rightsRequired', requestLocale(req)) }, { status: 400 })
  }

  // Resolve the 'internal' provider (all UGC lives under it).
  const { data: provider } = await supabase.from('music_providers').select('id').eq('slug', 'internal').single()
  if (!provider) return NextResponse.json({ error: 'not_configured', message: serverMessage('server.providerConfig', requestLocale(req)) }, { status: 500 })

  const { data: track, error } = await supabase
    .from('music_tracks')
    .insert({
      title,
      artist: body.artist?.trim() || null,
      duration_sec: durationSec,
      audio_url: audioUrl,
      preview_url: audioUrl,
      cover_url: body.coverUrl?.trim() || null,
      provider_id: provider.id,
      music_type: 'original_sound',
      uploaded_by: user.id,
      rights_confirmed: true,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[music/tracks POST]', error)
    return NextResponse.json({ error: 'publish_failed', message: serverMessage('music.publishFailed', requestLocale(req)) }, { status: 500 })
  }
  return NextResponse.json({ id: track.id, ok: true })
}
