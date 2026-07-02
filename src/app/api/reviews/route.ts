import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { rebuildProfile } from '@/lib/preferences/profileCache'

// Best-effort in-memory rate limit: 5 reviews/day/IP
const rlStore = new Map<string, { date: string; count: number }>()
function checkRL(ip: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  const e = rlStore.get(ip)
  if (!e || e.date !== today) { rlStore.set(ip, { date: today, count: 1 }); return true }
  if (e.count >= 20) return false
  e.count++
  return true
}

// GET /api/reviews?placeId=ChIJxxx  → list visible reviews for a place
export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId')
  if (!placeId) return NextResponse.json({ error: 'placeId required' }, { status: 400 })

  const supabase = createClient()
  const { data, error } = await supabase
    .from('reviews')
    .select('id, user_id, place_name, rating, body, created_at, is_verified, like_count, photos, profiles(full_name, avatar_url)')
    .eq('place_id', placeId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'Lỗi tải đánh giá' }, { status: 500 })

  const avg = data && data.length > 0
    ? (() => { const rated = data.filter(r => r.rating > 0); return rated.length > 0 ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null })()
    : null

  return NextResponse.json({
    reviews: data || [],
    avg_rating: avg ? Math.round(avg * 10) / 10 : null,
    count: data?.length || 0,
  })
}

// POST /api/reviews  → create review (community — no booking required)
// If user has a past booking at this place, is_verified = true (badge)
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRL(ip)) {
    return NextResponse.json({ error: 'Bạn đã đăng quá 20 bài hôm nay. Thử lại vào ngày mai.' }, { status: 429 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập để đánh giá' }, { status: 401 })

  let placeId: string, placeName: string, placeAddress: string, rating: number, body: string, photos: string[]
  let media_url: string, thumbnail: string, content_type: string, source_type: string, source_url: string, hashtags: string[]
  try {
    const b = await req.json()
    placeId = b.placeId?.trim()
    placeName = b.placeName?.trim()
    placeAddress = b.placeAddress?.trim() || ''
    rating = Number(b.rating)
    body = b.body?.trim() || ''
    photos = Array.isArray(b.photos) ? b.photos.filter((u: unknown) => typeof u === 'string').slice(0, 6) : []
    media_url = b.media_url?.trim() || ''
    thumbnail = b.thumbnail?.trim() || ''
    content_type = b.content_type?.trim() || 'photo'
    source_type = b.source_type?.trim() || 'upload'
    source_url = b.source_url?.trim() || ''
    hashtags = Array.isArray(b.hashtags) ? b.hashtags.filter((t: unknown) => typeof t === 'string').slice(0, 10) : []
    if (!placeId || !placeName) throw new Error('missing fields')
    if (!body && photos.length === 0 && !media_url) throw new Error('need body or photos or media')
    if (rating && (rating < 1 || rating > 5 || !Number.isInteger(rating))) throw new Error('invalid rating')
    if (body.length > 1000) throw new Error('body too long')
  } catch {
    return NextResponse.json({ error: 'Cần có nội dung hoặc ảnh để đăng bài.' }, { status: 400 })
  }

  // Check if user has a past booking here → verified badge
  const today = new Date().toISOString().slice(0, 10)
  const { data: booking } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('place_id', placeId)
    .lt('date', today)
    .limit(1)
    .maybeSingle()

  const isVerified = !!booking

  // Check duplicate (1 review per user per place)
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', user.id)
    .eq('place_id', placeId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Bạn đã đánh giá địa điểm này rồi.' }, { status: 409 })
  }

  const reviewData: Record<string, unknown> = {
    user_id: user.id,
    place_id: placeId,
    place_name: placeName,
    place_address: placeAddress,
    body: body || '',
    is_verified: isVerified,
  }
  if (rating > 0) reviewData.rating = rating
  if (photos.length > 0) reviewData.photos = photos
  if (content_type && content_type !== 'photo') reviewData.content_type = content_type
  if (media_url) reviewData.media_url = media_url
  if (thumbnail) reviewData.thumbnail = thumbnail
  if (source_type && source_type !== 'upload') reviewData.source_type = source_type
  if (source_url) reviewData.source_url = source_url
  if (hashtags.length > 0) reviewData.hashtags = hashtags

  let { error: insertError } = await supabase.from('reviews').insert(reviewData)

  // If photos column doesn't exist yet, retry without it
  if (insertError && photos.length > 0 && insertError.message?.includes('photos')) {
    console.warn('photos column missing, retrying without photos:', insertError.message)
    const { error: retryError } = await supabase.from('reviews').insert({ ...reviewData, photos: undefined })
    insertError = retryError ?? null
  }

  // If rating check constraint fails, retry with rating omitted
  if (insertError && rating > 0 && (insertError.message?.includes('rating') || insertError.code === '23514')) {
    console.warn('rating constraint, retrying without rating:', insertError.message)
    const dataNoRating = { ...reviewData }
    delete dataNoRating.rating
    const { error: retryError2 } = await supabase.from('reviews').insert(dataNoRating)
    insertError = retryError2 ?? null
  }

  if (insertError) {
    // Log concise detail server-side for debugging; never leak DB error text to the client.
    console.error('Review insert error:', insertError.code ?? insertError.message)
    return NextResponse.json({ error: 'Không thể lưu bài viết, vui lòng thử lại' }, { status: 500 })
  }

  rebuildProfile(user.id, supabase).catch(() => {})

  return NextResponse.json({ ok: true, is_verified: isVerified })
}
