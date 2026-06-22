import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data } = await supabase
      .from('user_preferences')
      .select('budget_level, cuisine_likes, dietary_restrictions, inferred_preferences, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({ preferences: data || null })
  } catch {
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { budget_level, cuisine_likes, dietary_restrictions } = await req.json()

    const { error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: user.id,
          budget_level: budget_level || null,
          cuisine_likes: Array.isArray(cuisine_likes) ? cuisine_likes : [],
          dietary_restrictions: dietary_restrictions?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Preferences upsert error:', error)
      return NextResponse.json({ error: 'Không thể lưu sở thích' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}
