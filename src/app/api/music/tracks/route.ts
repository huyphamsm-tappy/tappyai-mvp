import { NextRequest, NextResponse } from 'next/server'
import { parseTracksQuery } from '@/modules/music/api'
import { browseTracks } from '@/modules/music/services/musicService'
import { getRequestUser } from '@/lib/auth/getRequestUser'

// GET /api/music/tracks?categoryId=&page=&limit=
export async function GET(req: NextRequest) {
  const filter = parseTracksQuery(req.nextUrl.searchParams)
  const result = await browseTracks(filter)
  return NextResponse.json(result)
}

// POST /api/music/tracks — publish an Original Sound (user-owned music).
// The uploader MUST confirm they hold the rights; the RLS insert policy also
// enforces uploaded_by=self + music_type='original_sound' + rights_confirmed.
export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  let body: { title?: string; artist?: string; audioUrl?: string; coverUrl?: string; durationSec?: number; rightsConfirmed?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 }) }

  const title = body.title?.trim()
  const audioUrl = body.audioUrl?.trim()
  const durationSec = Math.round(Number(body.durationSec) || 0)

  if (!title || title.length > 120) return NextResponse.json({ error: 'Tên bài hát 1–120 ký tự' }, { status: 400 })
  if (!audioUrl || !/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(audioUrl)) {
    return NextResponse.json({ error: 'File nhạc không hợp lệ' }, { status: 400 })
  }
  if (!durationSec || durationSec < 1 || durationSec > 600) return NextResponse.json({ error: 'Thời lượng không hợp lệ (tối đa 10 phút)' }, { status: 400 })
  // The rights confirmation is the whole point — refuse without it.
  if (body.rightsConfirmed !== true) {
    return NextResponse.json({ error: 'Bạn cần xác nhận quyền sử dụng nhạc trước khi đăng' }, { status: 400 })
  }

  // Resolve the 'internal' provider (all UGC lives under it).
  const { data: provider } = await supabase.from('music_providers').select('id').eq('slug', 'internal').single()
  if (!provider) return NextResponse.json({ error: 'Thiếu cấu hình provider' }, { status: 500 })

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
    return NextResponse.json({ error: 'Không thể đăng nhạc. Vui lòng thử lại.' }, { status: 500 })
  }
  return NextResponse.json({ id: track.id, ok: true })
}
