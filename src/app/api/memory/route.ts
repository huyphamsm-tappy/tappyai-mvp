import { getRequestUser } from '@/lib/auth/getRequestUser'
import {
  getMemory,
  updateMemory,
  clearMemory,
} from '@/lib/memory/memoryService'
import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// GET /api/memory — check if user has memory (for badge)
export async function GET(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ memory: null })

    const memory = await getMemory(user.id, supabase)
    const hasMemory =
      memory !== null &&
      (!!memory.location_base ||
        !!memory.discovery_city ||
        Object.keys(memory.preferences || {}).length > 0 ||
        Object.keys(memory.budget || {}).length > 0 ||
        (memory.history || []).length > 0)

    return NextResponse.json({ memory: hasMemory ? memory : null })
  } catch {
    return NextResponse.json({ memory: null })
  }
}

// POST /api/memory — DISABLED (SEC4, 2026-10-10). It ran an LLM extraction on caller-supplied messages with no limiter and no input cap, and nothing calls it:
// the Web removed its duplicate call, Android and iOS use GET / PATCH / DELETE only (no client has ever called POST), and chat extracts server-side in /api/chat's
// onFinish. It answers 404 BEFORE any authentication, memory read, model call or write. Restoring it needs the owner's limiter and payload numbers
// (docs/phase8/MEMORY-POST-AUDIT.md). GET / PATCH / DELETE are unchanged.
export async function POST() {
  return new NextResponse(null, { status: 404 })
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
    if ('discovery_city' in body) patch.discovery_city = str(body.discovery_city)
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

    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })

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
