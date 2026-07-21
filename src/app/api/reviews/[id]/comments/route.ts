import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import { sendNotificationToUser } from '@/lib/notifications/send'

type CommentProfile = { full_name: string | null; avatar_url: string | null }

// review_comments.user_id references auth.users, not public.profiles, so PostgREST has no
// FK path to resolve an implicit profiles(...) embed here (unlike e.g. reviews.user_id).
// Fetch comments and profiles separately and merge in application code instead.
async function attachProfiles<T extends { user_id: string }>(
  supabase: ReturnType<typeof createClient>,
  rows: T[]
): Promise<(T & { profiles: CommentProfile | null })[]> {
  const userIds = Array.from(new Set(rows.map(r => r.user_id)))
  if (userIds.length === 0) return rows.map(r => ({ ...r, profiles: null }))

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds)

  const byId = new Map((profiles || []).map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]))
  return rows.map(r => ({ ...r, profiles: byId.get(r.user_id) ?? null }))
}

// reviews.comment_count is a denormalized counter kept in sync by a DB trigger that runs
// AS the requesting user (no SECURITY DEFINER) — with no RLS UPDATE policy on `reviews` for
// ordinary users, that trigger's own update is silently dropped, so the stored column drifts.
// Reads aren't affected by that gap, so compute the true count directly on every request
// instead of trusting the column — this guarantees what's returned always matches reality.
async function getRealCommentCount(supabase: ReturnType<typeof createClient>, reviewId: string): Promise<number> {
  const { count } = await supabase
    .from('review_comments')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', reviewId)
  return count ?? 0
}

// Aggregate each comment's reactions into { reactions: { like: 2, love: 1 }, my_reaction: 'like' }.
// One row per (comment, user) in comment_reactions, so counts are a simple group-by and the
// caller's own reaction (if any) is the single row matching [currentUserId].
async function attachReactions<T extends { id: string }>(
  supabase: ReturnType<typeof createClient>,
  rows: T[],
  currentUserId: string | null,
): Promise<(T & { reactions: Record<string, number>; my_reaction: string | null })[]> {
  const ids = rows.map(r => r.id)
  if (ids.length === 0) return rows.map(r => ({ ...r, reactions: {}, my_reaction: null }))

  const { data } = await supabase
    .from('comment_reactions')
    .select('comment_id, user_id, reaction')
    .in('comment_id', ids)

  const counts = new Map<string, Record<string, number>>()
  const mine = new Map<string, string>()
  for (const r of (data || []) as { comment_id: string; user_id: string; reaction: string }[]) {
    const c = counts.get(r.comment_id) ?? {}
    c[r.reaction] = (c[r.reaction] ?? 0) + 1
    counts.set(r.comment_id, c)
    if (currentUserId && r.user_id === currentUserId) mine.set(r.comment_id, r.reaction)
  }
  return rows.map(r => ({ ...r, reactions: counts.get(r.id) ?? {}, my_reaction: mine.get(r.id) ?? null }))
}

// GET /api/reviews/[id]/comments?limit=30
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get('limit') || '30'))
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('review_comments')
    .select('id, body, created_at, user_id, parent_comment_id')
    .eq('review_id', params.id)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return NextResponse.json({ error: 'Loi tai binh luan' }, { status: 500 })

  const withProfiles = await attachProfiles(supabase, data || [])
  const [comments, count] = await Promise.all([
    attachReactions(supabase, withProfiles, user?.id ?? null),
    getRealCommentCount(supabase, params.id),
  ])
  return NextResponse.json({ comments, count })
}

// POST /api/reviews/[id]/comments
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })

  // Burst cap: each comment inserts a row AND fires a push to the review owner,
  // so an uncapped POST is a spam vector against that owner.
  if (!rateLimit(`comment:${user.id}`, 10, 60_000).ok) {
    return NextResponse.json({ error: 'Ban binh luan qua nhanh, thu lai sau giay lat.' }, { status: 429 })
  }

  let body: string
  let parentId: string | null = null
  try {
    const b = await req.json()
    body = b.body?.trim()
    // Optional: replying to another comment. A one-level thread — a reply's own parentId is
    // ignored by the UI's nesting, matching typical social-app comment threads.
    parentId = typeof b.parentId === 'string' && b.parentId.trim() ? b.parentId.trim() : null
    if (!body || body.length < 1 || body.length > 300) throw new Error('invalid')
  } catch {
    return NextResponse.json({ error: 'Binh luan phai tu 1-300 ky tu' }, { status: 400 })
  }

  const { data: insertedComment, error } = await supabase
    .from('review_comments')
    .insert({ review_id: params.id, user_id: user.id, body, parent_comment_id: parentId })
    .select('id, body, created_at, user_id, parent_comment_id')
    .single()

  if (error) return NextResponse.json({ error: 'Khong the gui binh luan' }, { status: 500 })

  const [withProfile] = await attachProfiles(supabase, [insertedComment])
  const comment = { ...withProfile, reactions: {} as Record<string, number>, my_reaction: null as string | null }

  // Notify review owner (fire-and-forget, skip self-comment)
  const adminSb = createAdminClient()
  const { data: review } = await adminSb
    .from('reviews')
    .select('user_id, place_name')
    .eq('id', params.id)
    .single()

  if (review && review.user_id !== user.id) {
    const commenterName = comment.profiles?.full_name?.split(' ').pop() || 'Ai do'
    sendNotificationToUser(review.user_id, {
      title: commenterName + ' binh luan review cua ban',
      body: '"' + body.slice(0, 60) + (body.length > 60 ? '...' : '') + '"',
      data: { url: '/reviews/' + params.id },
    }).catch(() => {})
  }

  const count = await getRealCommentCount(supabase, params.id)
  return NextResponse.json({ comment, count })
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

  const count = await getRealCommentCount(supabase, params.id)
  return NextResponse.json({ ok: true, count })
}
