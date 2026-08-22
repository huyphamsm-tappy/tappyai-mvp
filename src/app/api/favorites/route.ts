import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  const { data, error } = await supabase
    .from('favorites')
    .select('id, place_id, place_name, place_address, place_type, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'load_failed', message: serverMessage('server.loadFailed', requestLocale(req)) }, { status: 500 })
  return NextResponse.json({ favorites: data || [] })
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  let placeId: string, placeName: string, placeAddress: string, placeType: string
  try {
    const b = await req.json()
    placeId = b.placeId?.trim()
    placeName = b.placeName?.trim()
    placeAddress = b.placeAddress?.trim() || ''
    placeType = b.placeType?.trim() || ''
    if (!placeId || !placeName) throw new Error('missing')
  } catch {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  }

  const { error } = await supabase
    .from('favorites')
    .upsert(
      { user_id: user.id, place_id: placeId, place_name: placeName, place_address: placeAddress, place_type: placeType },
      { onConflict: 'user_id,place_id', ignoreDuplicates: true }
    )

  if (error) return NextResponse.json({ error: 'save_failed', message: serverMessage('server.saveFailed', requestLocale(req)) }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  const placeId = searchParam(req, 'placeId')
  if (!placeId) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('place_id', placeId)

  if (error) return NextResponse.json({ error: 'delete_failed', message: serverMessage('server.deleteFailed', requestLocale(req)) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
