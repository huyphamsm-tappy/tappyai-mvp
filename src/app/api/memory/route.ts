import { createClient } from '@/lib/supabase/server'
import {
  extractMemoryFromConversation,
  getMemory,
  updateMemory,
  clearMemory,
} from '@/lib/memory/memoryService'
import { NextResponse } from 'next/server'

// GET /api/memory — check if user has memory (for badge)
export async function GET() {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ memory: null })

    const memory = await getMemory(user.id)
    const hasMemory =
      memory !== null &&
      (!!memory.location_base ||
        Object.keys(memory.preferences || {}).length > 0 ||
        Object.keys(memory.budget || {}).length > 0 ||
        (memory.history || []).length > 0)

    return NextResponse.json({ memory: hasMemory ? memory : null })
  } catch {
    return NextResponse.json({ memory: null })
  }
}

// POST /api/memory — extract + save memory from conversation
export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false })

    const { messages } = await req.json()
    if (!messages?.length) return NextResponse.json({ ok: false })

    const existing = await getMemory(user.id)
    const extracted = await extractMemoryFromConversation(messages, existing)

    if (Object.keys(extracted).length > 0) {
      await updateMemory(user.id, {
        location_base: extracted.location_base ?? existing?.location_base ?? null,
        companions: extracted.companions ?? existing?.companions ?? null,
        timing: extracted.timing ?? existing?.timing ?? null,
        personality: extracted.personality ?? existing?.personality ?? null,
        preferences: {
          ...(existing?.preferences || {}),
          ...(extracted.preferences || {}),
        },
        budget: {
          ...(existing?.budget || {}),
          ...(extracted.budget || {}),
        },
        history: extracted.history ?? existing?.history ?? [],
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Memory POST error:', e)
    return NextResponse.json({ ok: false })
  }
}

// DELETE /api/memory — clear all memory for user
export async function DELETE() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })
    await clearMemory(user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Memory DELETE error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
