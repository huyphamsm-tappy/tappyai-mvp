import { createClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

export interface UserMemory {
  location_base: string | null
  preferences: Record<string, string[] | string>
  budget: Record<string, { min: number; max: number }>
  history: string[]
  updated_at?: string
}

export async function getMemory(userId: string): Promise<UserMemory | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('user_memory')
      .select('location_base, preferences, budget, history, updated_at')
      .eq('user_id', userId)
      .single()
    if (error || !data) return null
    return data as UserMemory
  } catch {
    return null
  }
}

export async function updateMemory(userId: string, newData: Partial<UserMemory>): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('user_memory').upsert(
      { user_id: userId, ...newData, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  } catch (e) {
    console.error('updateMemory error:', e)
  }
}

export function buildMemoryBlock(memory: UserMemory): string {
  const parts: string[] = []

  if (memory.location_base) {
    parts.push(`- Vi tri thuong dung: ${memory.location_base}`)
  }

  const prefs = memory.preferences || {}
  const prefParts: string[] = []
  if (prefs.food && (prefs.food as string[]).length > 0)
    prefParts.push(`an uong: ${(prefs.food as string[]).join(', ')}`)
  if (prefs.spa && (prefs.spa as string[]).length > 0)
    prefParts.push(`spa: ${(prefs.spa as string[]).join(', ')}`)
  if (prefs.entertainment && (prefs.entertainment as string[]).length > 0)
    prefParts.push(`giai tri: ${(prefs.entertainment as string[]).join(', ')}`)
  if (prefs.avoid && (prefs.avoid as string[]).length > 0)
    prefParts.push(`khong thich: ${(prefs.avoid as string[]).join(', ')}`)
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

  const history = memory.history || []
  if (history.length > 0) {
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
          preferences: existingMemory.preferences,
          budget: existingMemory.budget,
          history: (existingMemory.history || []).slice(-5),
        })
      : '{}'

    const { text: rawText } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      maxTokens: 400,
      messages: [
        {
          role: 'user',
          content: `Phan tich cuoc hoi thoai va trich xuat thong tin ve user. Tra ve JSON ngan gon.

Memory hien tai: ${existingCtx}

Cac tin nhan cua user:
${userTexts}

Tra ve JSON (chi cac truong co du lieu ro rang):
{
  "location_base": "quan/khu vuc user o hoac thuong hay lui toi",
  "preferences": {"food": ["so thich"], "spa": ["so thich"], "avoid": ["khong thich"]},
  "budget": {"food": {"min": 0, "max": 200000}, "spa": {"min": 0, "max": 500000}},
  "history": ["chu de cuoc hoi thoai nay (1-3 tu ngan gon)"]
}

Quy tac:
- Chi update truong neu co thong tin RO RANG tu user
- history: ghi lai chu de chinh cua cuoc hoi thoai nay (vd "spa Binh Thanh", "cafe Q3")
- Neu khong co thong tin gi moi, tra ve {}
- Chi tra ve JSON, khong giai thich.`,
        },
      ],
    })

    const text = rawText.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return {}

    const parsed = JSON.parse(jsonMatch[0])

    // Merge history
    if (parsed.history?.length > 0 && existingMemory?.history?.length) {
      const combined = [...existingMemory.history, ...parsed.history]
      parsed.history = [...new Set(combined)].slice(-10)
    }

    // Merge preferences
    if (parsed.preferences && existingMemory?.preferences) {
      for (const [k, v] of Object.entries(existingMemory.preferences)) {
        if (!parsed.preferences[k]) parsed.preferences[k] = v
      }
    }

    // Merge budget
    if (parsed.budget && existingMemory?.budget) {
      for (const [k, v] of Object.entries(existingMemory.budget)) {
        if (!parsed.budget[k]) parsed.budget[k] = v
      }
    }

    return parsed
  } catch (e) {
    console.error('extractMemory error:', e)
    return {}
  }
}
