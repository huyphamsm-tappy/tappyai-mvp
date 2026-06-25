import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

// GET /api/profile
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    full_name: profile?.full_name || user.user_metadata?.full_name || '',
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || '',
    email: profile?.email || user.email || '',
    bio: profile?.bio || '',
    phone: profile?.phone || '',
  })
}

// PATCH /api/profile — update name, bio, phone
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const full_name = typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 100) : undefined
  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 200) : undefined
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : undefined

  const updates: Record<string, string> = {}
  if (full_name !== undefined) updates.full_name = full_name
  if (bio !== undefined) updates.bio = bio
  if (phone !== undefined) updates.phone = phone

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Không có thay đổi' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also update Supabase auth metadata for name
  if (full_name !== undefined) {
    await supabase.auth.updateUser({ data: { full_name } })
  }

  return NextResponse.json({ ok: true })
}

// POST /api/profile — upload avatar
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const file = formData.get('avatar') as File | null
  if (!file) return NextResponse.json({ error: 'Không có file' }, { status: 400 })

  if (file.size > 3 * 1024 * 1024) {
    return NextResponse.json({ error: 'Ảnh tối đa 3MB' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Chỉ chấp nhận file ảnh' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const blob = await put(`avatars/${user.id}.${ext}`, file, {
    access: 'public',
    addRandomSuffix: false,
  })

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: blob.url, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.auth.updateUser({ data: { avatar_url: blob.url } })

  return NextResponse.json({ avatar_url: blob.url })
}
