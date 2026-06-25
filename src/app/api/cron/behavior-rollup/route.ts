import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// Runs every Monday 01:00 UTC = 08:00 VN
// Aggregates last 7 days of user_events into a behavior_summary string → stored in user_memory

type EventRow = { event_type: string; metadata: Record<string, unknown>; created_at: string }

function buildEventSummary(events: EventRow[]): string {
  const counts: Record<string, number> = {}
  const searches: string[] = []
  const categories: string[] = []
  const places: string[] = []

  // Hour distribution (VN time = UTC+7)
  const hourBuckets: Record<string, number> = { sáng: 0, trưa: 0, chiều: 0, tối: 0 }

  for (const e of events) {
    counts[e.event_type] = (counts[e.event_type] ?? 0) + 1

    const m = e.metadata || {}
    if (e.event_type === 'chat_search' && m.query) searches.push(String(m.query))
    if (e.event_type === 'category_click' && m.category) categories.push(String(m.category))
    if ((e.event_type === 'place_save' || e.event_type === 'place_click') && m.name) places.push(String(m.name))

    // Hour bucket
    const hour = new Date(e.created_at).getUTCHours() + 7 // VN time
    if (hour >= 6 && hour < 11) hourBuckets.sáng++
    else if (hour >= 11 && hour < 14) hourBuckets.trưa++
    else if (hour >= 14 && hour < 18) hourBuckets.chiều++
    else hourBuckets.tối++
  }

  const peakTime = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0]?.[0] || 'tối'
  const topCategories = [...new Set(categories)].slice(0, 3)
  const topSearches = [...new Set(searches)].slice(0, 5)

  const parts: string[] = []
  if (counts['page_view']) parts.push(`mở app ${counts['page_view']} lần tuần này`)
  if (topSearches.length) parts.push(`hay tìm: ${topSearches.join(', ')}`)
  if (topCategories.length) parts.push(`quan tâm: ${topCategories.join(', ')}`)
  if (counts['place_save']) parts.push(`lưu ${counts['place_save']} địa điểm`)
  parts.push(`thường dùng app buổi ${peakTime}`)

  return parts.join('; ')
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Get all users who had events in the last 7 days
  const { data: eventUsers } = await supabase
    .from('user_events')
    .select('user_id')
    .gte('created_at', sevenDaysAgo)

  if (!eventUsers?.length) return NextResponse.json({ ok: true, processed: 0 })

  const userIds = Array.from(new Set(eventUsers.map(e => e.user_id)))
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  let processed = 0
  await Promise.allSettled(userIds.map(async (userId) => {
    const { data: events } = await supabase
      .from('user_events')
      .select('event_type, metadata, created_at')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo)
      .limit(500)

    if (!events?.length) return

    const rawSummary = buildEventSummary(events as EventRow[])

    // Haiku polishes the summary into natural Vietnamese
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Dữ liệu hành vi của user: "${rawSummary}"
Viết lại thành 1 câu mô tả ngắn gọn, tự nhiên bằng tiếng Việt (tối đa 80 ký tự).
Ví dụ: "hay dùng app buổi tối, thường tìm quán cà phê và spa, đã lưu 3 địa điểm tuần này"
Chỉ trả lời câu mô tả, không thêm gì khác.`
      }],
    })

    const behaviorSummary = msg.content[0].type === 'text'
      ? msg.content[0].text.trim()
      : rawSummary

    // Upsert into user_memory
    await supabase
      .from('user_memory')
      .upsert({ user_id: userId, behavior_summary: behaviorSummary }, { onConflict: 'user_id' })

    processed++
  }))

  return NextResponse.json({ ok: true, processed })
}
