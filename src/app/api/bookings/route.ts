import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function inferFromBooking(userId: string, serviceType: string | null) {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('user_preferences')
      .select('inferred_preferences')
      .eq('user_id', userId)
      .maybeSingle()

    const current = ((data?.inferred_preferences as Record<string, number>) || {})
    const key = serviceType || 'other'
    current[key] = (current[key] || 0) + 1

    await supabase
      .from('user_preferences')
      .upsert(
        { user_id: userId, inferred_preferences: current, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
  } catch (e) {
    console.error('inferFromBooking error:', e)
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { serviceId, serviceName, serviceType, date, time, guests, name, phone, notes, placeId } = await req.json()

    if (!date || !name || !phone) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        service_id: serviceId,
        service_name: serviceName,
        service_type: serviceType,
        place_id: placeId || null,
        date,
        time: time || null,
        guests: guests || 1,
        customer_name: name,
        customer_phone: phone,
        notes: notes || null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      console.error('Booking insert error:', error)
      return NextResponse.json({ error: 'Không thể tạo booking' }, { status: 500 })
    }

    // Fire-and-forget: cập nhật inferred_preferences từ lịch sử booking
    inferFromBooking(user.id, serviceType || null)

    return NextResponse.json({ ok: true, bookingId: data.id })
  } catch (e) {
    console.error('Booking error:', e)
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({ bookings: data || [] })
  } catch (e) {
    console.error('Get bookings error:', e)
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}
