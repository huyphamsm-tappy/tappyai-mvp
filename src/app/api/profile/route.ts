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
    .select('full_name, avatar_url, email, created_at')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    full_name: profile?.full_name || user.user_metadata?.full_name || '',
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || '',
    email: profile?.email || user.email || '',
    bio: user.user_metadata?.bio || '',
  })
}

// PATCH /api/profile — update name and bio
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* empty body is OK */ }

    const full_name = typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 100) : undefined
    const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 200) : undefined

    // Update profiles table (only columns that definitely exist)
    if (full_name !== undefined) {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name })
        .eq('id', user.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Save bio + name to auth metadata (no DB schema needed)
    const metaUpdates: Record<string, string> = {}
    if (full_name !== undefined) metaUpdates.full_name = full_name
    if (bio !== undefined) metaUpdates.bio = bio

    if (Object.keys(metaUpdates).length > 0) {
      await supabase.auth.updateUser({ data: metaUpdates })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
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
  let blob: { url: string }
  try {
    blob = await put(`avatars/${user.id}.${ext}`, file, {
      access: 'public',
      addRandomSuffix: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload thất bại'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Update only avatar_url — a column that always exists in profiles
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: blob.url })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also save to auth metadata
  await supabase.auth.updateUser({ data: { avatar_url: blob.url } })

  return NextResponse.json({ avatar_url: blob.url })
}
