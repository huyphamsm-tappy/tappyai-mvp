import { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

export interface UserMemory {
  location_base: string | null
  preferences: {
    food?: string[]
    spa?: string[]
    entertainment?: string[]
    shopping?: string[]
    avoid?: string[]
    [key: string]: string[] | undefined
  }
  budget: Record<string, { min: number; max: number }>
  history: string[]
  companions?: string | null       // "thường đi với bạn bè", "hay đi 2 người", "cặp đôi", "gia đình"
  timing?: string | null           // "hay đi cuối tuần", "hay đi tối", "thường đi trưa"
  personality?: string | null      // "thích local quán nhỏ", "ưa cao cấp", "thích thử đồ mới"
  behavior_summary?: string | null // weekly rollup of user_events (written by cron/behavior-rollup)
  updated_at?: string
}

// memoryService is the SINGLE gateway for user_memory access. No other module
// may touch the table directly. Callers with a user session omit `client`
// (cookie-scoped server client); cron jobs inject createAdminClient().

const MEMORY_COLUMNS = 'location_base, preferences, budget, history, companions, timing, personality, updated_at'

export async function getMemory(userId: string, client?: SupabaseClient): Promise<UserMemory | null> {
  try {
    const supabase = client ?? createClient()
    const { data, error } = await supabase
      .from('user_memory')
      .select(MEMORY_COLUMNS)
      .eq('user_id', userId)
      .single()
    if (error || !data) return null
    return data as unknown as UserMemory
  } catch {
    return null
  }
}

// Batch read for cron jobs — one .in() query instead of N getMemory() calls.
// Returns only users that have a memory row.
export async function getMemoryBatch(userIds: string[], client: SupabaseClient): Promise<Map<string, UserMemory>> {
  const map = new Map<string, UserMemory>()
  if (userIds.length === 0) return map
  try {
    const { data } = await client
      .from('user_memory')
      .select(`user_id, ${MEMORY_COLUMNS}`)
      .in('user_id', userIds)
    for (const row of data ?? []) {
      const { user_id, ...memory } = row as unknown as UserMemory & { user_id: string }
      map.set(user_id, memory)
    }
  } catch (e) {
    console.error('getMemoryBatch error:', e)
  }
  return map
}

export async function updateMemory(userId: string, newData: Partial<UserMemory>, client?: SupabaseClient): Promise<void> {
  try {
    const supabase = client ?? createClient()
    await supabase.from('user_memory').upsert(
      { user_id: userId, ...newData, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  } catch (e) {
    console.error('updateMemory error:', e)
  }
}

export async function clearMemory(userId: string, client?: SupabaseClient): Promise<void> {
  try {
    const supabase = client ?? createClient()
    await supabase.from('user_memory').delete().eq('user_id', userId)
  } catch (e) {
    console.error('clearMemory error:', e)
  }
}

export function countMemoryFacts(memory: UserMemory): number {
  let count = 0
  if (memory.location_base) count++
  if (memory.companions) count++
  if (memory.timing) count++
  if (memory.personality) count++
  const prefs = memory.preferences || {}
  for (const v of Object.values(prefs)) {
    if (v && v.length > 0) count += Math.min(v.length, 3)
  }
  const budgets = memory.budget || {}
  count += Object.keys(budgets).length
  count += Math.min((memory.history || []).length, 5)
  return count
}

export function buildMemoryBlock(memory: UserMemory, forcedTool?: string | null): string {
  const infoOnly = forcedTool === 'get_weather' || forcedTool === 'get_gold_price'
  const locationAndHistory = forcedTool === 'get_news'

  const parts: string[] = []

  if (memory.location_base) {
    parts.push(`- Vi tri thuong dung: ${memory.location_base}`)
  }

  if (!infoOnly && !locationAndHistory) {
    if (memory.companions) {
      parts.push(`- Hay di cung: ${memory.companions}`)
    }

    if (memory.timing) {
      parts.push(`- Thoi gian hay di: ${memory.timing}`)
    }

    if (memory.personality) {
      parts.push(`- Phong cach: ${memory.personality}`)
    }
  }

  if (!infoOnly && !locationAndHistory) {
    const prefs = memory.preferences || {}
    const prefParts: string[] = []
    if (prefs.food && prefs.food.length > 0)
      prefParts.push(`an uong: ${prefs.food.join(', ')}`)
    if (prefs.spa && prefs.spa.length > 0)
      prefParts.push(`spa: ${prefs.spa.join(', ')}`)
    if (prefs.entertainment && prefs.entertainment.length > 0)
      prefParts.push(`giai tri: ${prefs.entertainment.join(', ')}`)
    if (prefs.shopping && prefs.shopping.length > 0)
      prefParts.push(`mua sam: ${prefs.shopping.join(', ')}`)
    if (prefs.avoid && prefs.avoid.length > 0)
      prefParts.push(`khong thich: ${prefs.avoid.join(', ')}`)
    if (prefParts.length > 0) parts.push(`- So thich: ${prefParts.join('; ')}`)

    const budgets = memory.budget || {}
    const budgetParts: string[] = []
    for (const [cat, range] of Object.entries(budgets)) {
      if (range?.max) {
        const label = range.min > 0
          ? `${range.min.toLocaleString('vi-VN')}-${range.max.toLocaleString('vi-VN')}d`
          : `duoi ${range.max.toLocaleString('vi-VN')}d`
        budgetParts.push(`${cat}: ${label}`)
      }
    }
    if (budgetParts.length > 0) parts.push(`- Budget thuong dung: ${budgetParts.join('; ')}`)
  }

  const history = memory.history || []
  if (history.length > 0 && !infoOnly) {
    parts.push(`- Lan truoc da hoi ve: ${history.slice(-3).join(', ')}`)
  }

  if (parts.length === 0) return ''

  return `===== THONG TIN VE USER NAY =====
${parts.join('\n')}
Dung thong tin nay de ca nhan hoa response. Khong can hoi lai nhung gi da biet.
==================================`
}

export async function extractMemoryFromConversation(
  messages: Array<{ role: string; content: string }>,
  existingMemory: UserMemory | null
): Promise<Partial<UserMemory>> {
  try {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const userTexts = messages
      .filter(m => m.role === 'user')
      .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n')

    if (!userTexts.trim()) return {}

    const existingCtx = existingMemory
      ? JSON.stringify({
          location_base: existingMemory.location_base,
          companions: existingMemory.companions,
          timing: existingMemory.timing,
          personality: existingMemory.personality,
          preferences: existingMemory.preferences,
          budget: existingMemory.budget,
          history: (existingMemory.history || []).slice(-5),
        })
      : '{}'

    const { text: rawText } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      maxTokens: 500,
      messages: [
        {
          role: 'user',
          content: `Phan tich cuoc hoi thoai va trich xuat thong tin ve user. Tra ve JSON ngan gon.

Memory hien tai: ${existingCtx}

Cac tin nhan cua user:
${userTexts}

Tra ve JSON (chi cac truong co du lieu RO RANG tu user):
{
  "location_base": "quan/khu vuc user o hoac hay lui toi (vd: Quan 3, Binh Thanh, Ha Noi)",
  "companions": "hay di voi ai (vd: ban be, cap doi, gia dinh, 1 minh)",
  "timing": "thoi gian hay di (vd: cuoi tuan, buoi toi, gio trua)",
  "personality": "phong cach (vd: thich quan nho local, ua sang trong, thich thu do moi)",
  "preferences": {
    "food": ["mon/kieu an ua thich"],
    "spa": ["loai spa/massage thich"],
    "entertainment": ["hoat dong giai tri ua thich"],
    "shopping": ["thuong hieu/loai hang hay mua"],
    "avoid": ["thu khong thich/di ung/kieng"]
  },
  "budget": {
    "food": {"min": 0, "max": 200000},
    "spa": {"min": 0, "max": 500000},
    "trip": {"min": 0, "max": 5000000}
  },
  "history": ["chu de chinh cuoc hoi thoai nay (1-3 tu, vd: spa Binh Thanh, cafe Q3, trip Da Lat)"]
}

Quy tac:
- Chi dien truong neu co bang chung RO RANG tu user (khong suy doan)
- history: ghi chu de chinh cua cuoc hoi thoai NAY, khong copy tu memory cu
- Neu khong co thong tin gi moi, tra ve {}
- Chi tra ve JSON, khong giai thich.`,
        },
      ],
    })

    const text = rawText.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return {}

    const parsed = JSON.parse(jsonMatch[0])

    // Merge history (deduplicate, keep latest 10)
    if (parsed.history?.length > 0 && existingMemory?.history?.length) {
      const combined = [...existingMemory.history, ...parsed.history]
      parsed.history = [...new Set(combined)].slice(-10)
    }

    // Merge preferences (keep existing keys not in new extraction)
    if (parsed.preferences && existingMemory?.preferences) {
      for (const [k, v] of Object.entries(existingMemory.preferences)) {
        if (!parsed.preferences[k]) parsed.preferences[k] = v
      }
    }

    // Merge budget (keep existing categories not overwritten)
    if (parsed.budget && existingMemory?.budget) {
      for (const [k, v] of Object.entries(existingMemory.budget)) {
        if (!parsed.budget[k]) parsed.budget[k] = v
      }
    }

    // Keep existing companions/timing/personality if not extracted
    if (!parsed.companions && existingMemory?.companions)
      parsed.companions = existingMemory.companions
    if (!parsed.timing && existingMemory?.timing)
      parsed.timing = existingMemory.timing
    if (!parsed.personality && existingMemory?.personality)
      parsed.personality = existingMemory.personality

    return parsed
  } catch (e) {
    console.error('extractMemory error:', e)
    return {}
  }
}
