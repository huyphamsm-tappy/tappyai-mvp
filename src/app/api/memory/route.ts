import { getRequestUser } from '@/lib/auth/getRequestUser'
import {
  extractMemoryFromConversation,
  getMemory,
  updateMemory,
  clearMemory,
} from '@/lib/memory/memoryService'
import { NextResponse } from 'next/server'

// GET /api/memory — check if user has memory (for badge)
export async function GET(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ memory: null })

    const memory = await getMemory(user.id, supabase)
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
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const { messages } = await req.json()
    if (!messages?.length) return NextResponse.json({ ok: false })

    const existing = await getMemory(user.id, supabase)
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
      }, supabase)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Memory POST error:', e)
    return NextResponse.json({ ok: false })
  }
}

// PATCH /api/memory — correct memory: edit/remove individual remembered facts.
// The client sends the whitelisted fields it wants to change (e.g. a history
// array with one entry removed, or location_base:null to clear it). Lets the
// user review AND correct their own record (MFS 2.2).
export async function PATCH(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* empty */ }

    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null)
    const strArr = (v: unknown) =>
      Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => (x as string).trim().slice(0, 60)).slice(0, 50) : []

    const patch: Record<string, unknown> = {}
    if ('location_base' in body) patch.location_base = str(body.location_base)
    if ('companions' in body) patch.companions = str(body.companions)
    if ('timing' in body) patch.timing = str(body.timing)
    if ('personality' in body) patch.personality = str(body.personality)
    if ('history' in body) patch.history = strArr(body.history)
    if (body.preferences && typeof body.preferences === 'object') {
      const cleaned: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(body.preferences as Record<string, unknown>)) {
        if (/^(food|spa|entertainment|shopping|avoid)$/.test(k)) cleaned[k] = strArr(v)
      }
      patch.preferences = cleaned
    }
    if (body.budget && typeof body.budget === 'object' && !Array.isArray(body.budget)) {
      const cleaned: Record<string, { min: number; max: number }> = {}
      for (const [k, v] of Object.entries(body.budget as Record<string, unknown>)) {
        const r = v as { min?: unknown; max?: unknown }
        if (typeof r?.max === 'number') cleaned[k.slice(0, 40)] = { min: Number(r.min) || 0, max: Number(r.max) }
      }
      patch.budget = cleaned
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'no valid fields' }, { status: 400 })

    await updateMemory(user.id, patch, supabase)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Memory PATCH error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// DELETE /api/memory — clear all memory for user
export async function DELETE(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })
    await clearMemory(user.id, supabase)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Memory DELETE error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
