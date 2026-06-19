import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { conversationId, messageIndex, type, reason } = await req.json()

    if (!['like', 'dislike', 'report'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
    if (!conversationId || messageIndex === undefined || messageIndex === null) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { error } = await supabase
      .from('message_feedback')
      .upsert(
        {
          user_id: user.id,
          conversation_id: conversationId,
          message_index: messageIndex,
          type,
          reason: reason ?? null,
        },
        { onConflict: 'user_id,conversation_id,message_index,type' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { conversationId, messageIndex, type } = await req.json()

    if (!conversationId || messageIndex === undefined) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { error } = await supabase
      .from('message_feedback')
      .delete()
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .eq('message_index', messageIndex)
      .eq('type', type)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
