import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data } = await supabase
      .from('user_preferences')
      .select('budget_level, cuisine_likes, dietary_restrictions, inferred_preferences, preferences, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({
      preferences: Array.isArray(data?.preferences) ? data.preferences : [],
      structured: data ? {
        budget_level: data.budget_level,
        cuisine_likes: data.cuisine_likes,
        dietary_restrictions: data.dietary_restrictions,
        inferred_preferences: data.inferred_preferences,
        updated_at: data.updated_at,
      } : null,
    })
  } catch {
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { preferences } = await req.json()
    if (!Array.isArray(preferences)) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

    const limited = preferences
      .filter((p: unknown) => typeof p === 'string' && (p as string).trim().length > 0)
      .slice(0, 50)

    const { error } = await supabase
      .from('user_preferences')
      .upsert(
        { user_id: user.id, preferences: limited, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Preferences POST error:', error)
      return NextResponse.json({ error: 'Không thể lưu sở thích' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
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
