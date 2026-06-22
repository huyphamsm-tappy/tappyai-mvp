import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Best-effort in-memory rate limit: 5 reviews/day/IP
const rlStore = new Map<string, { date: string; count: number }>()
function checkRL(ip: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  const e = rlStore.get(ip)
  if (!e || e.date !== today) { rlStore.set(ip, { date: today, count: 1 }); return true }
  if (e.count >= 5) return false
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
    .select('id, user_id, place_name, rating, body, created_at, profiles(full_name, avatar_url)')
    .eq('place_id', placeId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'Lỗi tải đánh giá' }, { status: 500 })

  const avg = data && data.length > 0
    ? (data.reduce((s, r) => s + r.rating, 0) / data.length)
    : null

  return NextResponse.json({
    reviews: data || [],
    avg_rating: avg ? Math.round(avg * 10) / 10 : null,
    count: data?.length || 0,
  })
}

// POST /api/reviews  → create review (verified booking check)
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRL(ip)) {
    return NextResponse.json({ error: 'Bạn đã gửi quá 5 đánh giá hôm nay. Thử lại vào ngày mai.' }, { status: 429 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập để đánh giá' }, { status: 401 })

  let placeId: string, placeName: string, placeAddress: string, rating: number, body: string
  try {
    const b = await req.json()
    placeId = b.placeId?.trim()
    placeName = b.placeName?.trim()
    placeAddress = b.placeAddress?.trim() || ''
    rating = Number(b.rating)
    body = b.body?.trim()
    if (!placeId || !placeName || !rating || !body) throw new Error('missing fields')
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) throw new Error('invalid rating')
    if (body.length < 20 || body.length > 500) throw new Error('body length')
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ. Đánh giá phải từ 20–500 ký tự.' }, { status: 400 })
  }

  // Verified booking check: must have a booking with this place_id and date already passed
  const today = new Date().toISOString().slice(0, 10)
  const { data: booking } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('place_id', placeId)
    .lt('date', today)
    .limit(1)
    .maybeSingle()

  if (!booking) {
    return NextResponse.json({
      error: 'Bạn chỉ có thể đánh giá địa điểm sau khi đã có đặt chỗ thật và ngày đã qua.',
    }, { status: 403 })
  }

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

  const { error: insertError } = await supabase
    .from('reviews')
    .insert({
      user_id: user.id,
      place_id: placeId,
      place_name: placeName,
      place_address: placeAddress,
      rating,
      body,
    })

  if (insertError) {
    console.error('Review insert error:', insertError)
    return NextResponse.json({ error: 'Không thể lưu đánh giá. Vui lòng thử lại.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
