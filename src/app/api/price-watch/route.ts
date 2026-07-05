import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'

// GET — list user's price watches
export async function GET(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('price_watches')
    .select('id, product_name, target_price, current_price, status, last_checked, notified_at, created_at')
    .eq('user_id', user.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ watches: data })
}

// POST — create a new price watch
export async function POST(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_name, target_price, search_query } = await req.json()
  if (!product_name || !target_price || !search_query) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Max 10 active watches per user
  const { count } = await supabase
    .from('price_watches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active')

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Tối đa 10 sản phẩm theo dõi cùng lúc' }, { status: 429 })
  }

  const { data, error } = await supabase
    .from('price_watches')
    .insert({
      user_id: user.id,
      product_name,
      target_price: Math.round(Number(target_price)),
      search_query,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id, ok: true })
}

// DELETE — cancel a watch
export async function DELETE(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabase
    .from('price_watches')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  // Never report success if the cancel failed or matched nothing (wrong id / not owner).
  if (error) return NextResponse.json({ error: 'Không thể huỷ theo dõi' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
