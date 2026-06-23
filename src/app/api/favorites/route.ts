import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('favorites')
    .select('id, place_id, place_name, place_address, place_type, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Lỗi tải danh sách' }, { status: 500 })
  return NextResponse.json({ favorites: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let placeId: string, placeName: string, placeAddress: string, placeType: string
  try {
    const b = await req.json()
    placeId = b.placeId?.trim()
    placeName = b.placeName?.trim()
    placeAddress = b.placeAddress?.trim() || ''
    placeType = b.placeType?.trim() || ''
    if (!placeId || !placeName) throw new Error('missing')
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }

  const { error } = await supabase
    .from('favorites')
    .upsert(
      { user_id: user.id, place_id: placeId, place_name: placeName, place_address: placeAddress, place_type: placeType },
      { onConflict: 'user_id,place_id', ignoreDuplicates: true }
    )

  if (error) return NextResponse.json({ error: 'Không thể lưu' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const placeId = req.nextUrl.searchParams.get('placeId')
  if (!placeId) return NextResponse.json({ error: 'placeId required' }, { status: 400 })

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('place_id', placeId)

  if (error) return NextResponse.json({ error: 'Không thể xóa' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
