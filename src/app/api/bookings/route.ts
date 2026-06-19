import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { serviceId, serviceName, serviceType, date, time, guests, name, phone, notes } = await req.json()

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
