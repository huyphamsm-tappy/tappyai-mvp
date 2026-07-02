import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { sendNotificationToUser } from '@/lib/notifications/send'

// GET /api/reviews/[id]/comments?limit=30
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get('limit') || '30'))
  const supabase = createClient()

  const { data, error } = await supabase
    .from('review_comments')
    .select('id, body, created_at, user_id, profiles(full_name, avatar_url)')
    .eq('review_id', params.id)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return NextResponse.json({ error: 'Loi tai binh luan' }, { status: 500 })

  return NextResponse.json({ comments: data || [] })
}

// POST /api/reviews/[id]/comments
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })

  let body: string
  try {
    const b = await req.json()
    body = b.body?.trim()
    if (!body || body.length < 1 || body.length > 300) throw new Error('invalid')
  } catch {
    return NextResponse.json({ error: 'Binh luan phai tu 1-300 ky tu' }, { status: 400 })
  }

  const { data: comment, error } = await supabase
    .from('review_comments')
    .insert({ review_id: params.id, user_id: user.id, body })
    .select('id, body, created_at, user_id, profiles(full_name, avatar_url)')
    .single()

  if (error) return NextResponse.json({ error: 'Khong the gui binh luan' }, { status: 500 })

  // Notify review owner (fire-and-forget, skip self-comment)
  const adminSb = createAdminClient()
  const { data: review } = await adminSb
    .from('reviews')
    .select('user_id, place_name')
    .eq('id', params.id)
    .single()

  if (review && review.user_id !== user.id) {
    const commenterName = (comment.profiles as unknown as { full_name: string | null } | null)?.full_name?.split(' ').pop() || 'Ai do'
    sendNotificationToUser(review.user_id, {
      title: commenterName + ' binh luan review cua ban',
      body: '"' + body.slice(0, 60) + (body.length > 60 ? '...' : '') + '"',
      data: { url: '/reviews/' + params.id },
    }).catch(() => {})
  }

  return NextResponse.json({ comment })
}

// DELETE /api/reviews/[id]/comments?commentId=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const commentId = req.nextUrl.searchParams.get('commentId')
  if (!commentId) return NextResponse.json({ error: 'commentId required' }, { status: 400 })

  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })

  const { error } = await supabase
    .from('review_comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Khong the xoa' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
