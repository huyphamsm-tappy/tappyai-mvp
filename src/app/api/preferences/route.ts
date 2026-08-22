import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export async function GET(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

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
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

    const { preferences } = await req.json()
    if (!Array.isArray(preferences)) return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })

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
      return NextResponse.json({ error: 'save_failed', message: serverMessage('preferences.saveFailed', requestLocale(req)) }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

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
      return NextResponse.json({ error: 'save_failed', message: serverMessage('preferences.saveFailed', requestLocale(req)) }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}
