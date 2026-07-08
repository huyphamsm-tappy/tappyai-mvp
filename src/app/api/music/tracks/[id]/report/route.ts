import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNotificationToUser } from '@/lib/notifications/send'

const REASONS = ['copyright', 'inappropriate', 'spam', 'other']

// POST /api/music/tracks/[id]/report — file a copyright/abuse report.
// Stored for the copyright agent, who removes infringing tracks within 24–48h.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập để báo cáo' }, { status: 401 })

  let body: { reason?: string; details?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 }) }

  const reason = body.reason
  if (!reason || !REASONS.includes(reason)) return NextResponse.json({ error: 'Lý do không hợp lệ' }, { status: 400 })

  const { error } = await supabase.from('music_track_reports').insert({
    track_id: params.id,
    reporter_id: user.id,
    reason,
    details: body.details?.trim()?.slice(0, 1000) || null,
  })
  if (error) {
    console.error('[music report]', error)
    return NextResponse.json({ error: 'Không thể gửi báo cáo' }, { status: 500 })
  }

  // Alert the copyright agent(s) so takedown can happen inside the 24–48h SLA.
  // ADMIN_IDS is a comma-separated list of admin user ids (the designated agents).
  try {
    const adminIds = (process.env.ADMIN_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const admin = createAdminClient()
    const { data: track } = await admin.from('music_tracks').select('title').eq('id', params.id).single()
    await Promise.allSettled(adminIds.map(id => sendNotificationToUser(id, {
      title: 'Báo cáo bản quyền nhạc',
      body: `"${track?.title ?? params.id}" bị báo cáo (${reason}).`,
      data: { url: `/sound/${params.id}` },
    })))
  } catch { /* notification is best-effort; the report is already saved */ }

  return NextResponse.json({ ok: true })
}
