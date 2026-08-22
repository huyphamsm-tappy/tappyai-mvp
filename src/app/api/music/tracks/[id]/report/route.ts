import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitNotification } from '@/lib/notifications/emit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

const REASONS = ['copyright', 'inappropriate', 'spam', 'other']

// POST /api/music/tracks/[id]/report — file a copyright/abuse report.
// Stored for the copyright agent, who removes infringing tracks within 24–48h.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('music.signInToReport', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let body: { reason?: string; details?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 }) }

  const reason = body.reason
  if (!reason || !REASONS.includes(reason)) return NextResponse.json({ error: 'invalid_reason', message: serverMessage('validation.invalidReason', requestLocale(req)) }, { status: 400 })

  const { error } = await supabase.from('music_track_reports').insert({
    track_id: params.id,
    reporter_id: user.id,
    reason,
    details: body.details?.trim()?.slice(0, 1000) || null,
  })
  if (error) {
    console.error('[music report]', error)
    return NextResponse.json({ error: 'report_failed', message: serverMessage('music.reportFailed', requestLocale(req)) }, { status: 500 })
  }

  // Alert the copyright agent(s) so takedown can happen inside the 24–48h SLA.
  // ADMIN_IDS is a comma-separated list of admin user ids (the designated agents).
  try {
    const adminIds = (process.env.ADMIN_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const admin = createAdminClient()
    const { data: track } = await admin.from('music_tracks').select('title').eq('id', params.id).single()
    await Promise.allSettled(adminIds.map(id => emitNotification({
      userId: id,
      type: 'system',
      category: 'system',
      title: 'Báo cáo bản quyền nhạc',
      body: `"${track?.title ?? params.id}" bị báo cáo (${reason}).`,
      entityUrl: `/sound/${params.id}`,
    })))
  } catch { /* notification is best-effort; the report is already saved */ }

  return NextResponse.json({ ok: true })
}
