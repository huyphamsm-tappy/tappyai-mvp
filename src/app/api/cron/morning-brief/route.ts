import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMemoryBatch } from '@/lib/memory/memoryService'
import { getAllSubscribedUserIds, sendNotificationToUser } from '@/lib/notifications/send'

export const runtime = 'nodejs'
export const maxDuration = 60

// Runs daily at 00:30 UTC = 07:30 ICT (UTC+7) — configured in vercel.json
// Same time as deal-notifications but different path/content

type UserPrefRow = {
  user_id: string
  preferences: unknown
  cuisine_likes: unknown
}

// Vietnamese day names
const VN_DAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

function getVietnamContext(): { dayName: string; isWeekend: boolean; isFriday: boolean; hour: number } {
  const now = new Date()
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  const day = vnTime.getDay()
  const hour = vnTime.getHours()
  return {
    dayName: VN_DAYS[day],
    isWeekend: day === 0 || day === 6,
    isFriday: day === 5,
    hour,
  }
}

// Simple free weather fetch for a location string
async function getWeatherBrief(location: string): Promise<string> {
  const cityMap: Record<string, string> = {
    'hà nội': 'Hanoi', 'ha noi': 'Hanoi',
    'hồ chí minh': 'Ho Chi Minh City', 'ho chi minh': 'Ho Chi Minh City',
    'tp hcm': 'Ho Chi Minh City', 'hcm': 'Ho Chi Minh City', 'sài gòn': 'Ho Chi Minh City',
    'đà nẵng': 'Da Nang', 'da nang': 'Da Nang',
    'hội an': 'Hoi An', 'đà lạt': 'Da Lat', 'nha trang': 'Nha Trang',
  }
  const loc = location.toLowerCase().trim()
  const city = Object.entries(cityMap).find(([k]) => loc.includes(k))?.[1] || 'Ho Chi Minh City'
  try {
    const resp = await Promise.race([
      fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
        headers: { 'User-Agent': 'curl/8.0', Accept: 'application/json' },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ])
    const data = await (resp as Response).json()
    const cur = data.current_condition?.[0]
    const today = data.weather?.[0]
    if (!cur) return ''
    const desc = cur.weatherDesc?.[0]?.value || ''
    const temp = cur.temp_C
    const rain = today?.hourly?.find((h: { time: string }) => h.time === '1200')?.chanceofrain
      ?? today?.hourly?.[4]?.chanceofrain
      ?? 0
    // Build short weather emoji+summary
    const isRainy = parseInt(String(rain)) >= 40 || /rain|thunder|drizzle/i.test(desc)
    const emoji = isRainy ? '🌧️' : temp <= 20 ? '🌤️' : '☀️'
    const weatherStr = `${emoji} ${temp}°C${isRainy ? `, có mưa (${rain}%)` : ''}`
    return weatherStr
  } catch {
    return ''
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userIds = await getAllSubscribedUserIds()
    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    const { dayName, isWeekend, isFriday } = getVietnamContext()

    // Fetch preferences + memory for all subscribed users in parallel
    const supabase = createAdminClient()
    const [{ data: prefs }, memories] = await Promise.all([
      supabase
        .from('user_preferences')
        .select('user_id, preferences, cuisine_likes')
        .in('user_id', userIds),
      getMemoryBatch(userIds, supabase),
    ])

    const prefByUser = new Map<string, string[]>()
    for (const p of (prefs ?? []) as UserPrefRow[]) {
      const tags = [
        ...(Array.isArray(p.preferences) ? (p.preferences as string[]) : []),
        ...(Array.isArray(p.cuisine_likes) ? (p.cuisine_likes as string[]) : []),
      ]
      if (tags.length) prefByUser.set(p.user_id, tags)
    }

    const locationByUser = new Map<string, string>()
    memories.forEach((m, uid) => {
      if (m.location_base) locationByUser.set(uid, m.location_base)
    })

    // Determine common locations for weather (batch unique locations)
    const uniqueLocations = Array.from(new Set(locationByUser.values()))
    const weatherByLocation = new Map<string, string>()
    await Promise.all(
      uniqueLocations.slice(0, 5).map(async (loc) => {
        const weather = await getWeatherBrief(loc)
        if (weather) weatherByLocation.set(loc, weather)
      })
    )

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    // Contextual day prompts
    const dayContext = isFriday
      ? 'Hôm nay là thứ 6 — sắp cuối tuần rồi! Hãy gợi ý kế hoạch cuối tuần hoặc tối nay.'
      : isWeekend
      ? `Hôm nay là ${dayName} — ngày nghỉ! Hãy gợi ý hoạt động vui chơi, ăn uống, khám phá.`
      : `Hôm nay là ${dayName} — ngày thường. Hãy gợi ý cà phê buổi sáng, ăn trưa, hoặc deal hôm nay.`

    const results = await Promise.allSettled(
      userIds.map(async (uid) => {
        const tags = prefByUser.get(uid) ?? []
        const location = locationByUser.get(uid) || 'TP.HCM'
        const weather = weatherByLocation.get(location) || ''
        const prefStr = tags.slice(0, 5).join(', ') || 'ăn uống, đi chơi'

        const prompt = `Bạn là TappyAI — trợ lý AI đời thường người Việt.
Hãy tạo TIN NHẮN CHÀO BUỔI SÁNG cá nhân hóa, ngắn gọn, vui vẻ cho người dùng.

Thông tin:
- ${dayContext}
- Khu vực người dùng: ${location}
- Sở thích: ${prefStr}
${weather ? `- Thời tiết hôm nay: ${weather}` : ''}

Yêu cầu:
- TITLE: tối đa 55 ký tự, bắt đầu bằng emoji phù hợp, đề cập ngày/thời tiết nếu có
- BODY: tối đa 110 ký tự, gợi ý 1 ý tưởng CỤ THỂ phù hợp sở thích + kêu gọi mở Tappy
- Giọng văn: nhắn tin bạn bè, tự nhiên, không cứng nhắc
- Ngôn ngữ: tiếng Việt

Trả lời ĐÚNG format:
TITLE: [nội dung]
BODY: [nội dung]`

        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 150,
          messages: [{ role: 'user', content: prompt }],
        })

        const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const titleMatch = text.match(/TITLE:\s*(.+)/)
        const bodyMatch = text.match(/BODY:\s*(.+)/)

        const title = titleMatch?.[1]?.trim() ?? `${isFriday ? '🎉 Thứ 6 rồi!' : isWeekend ? '🌞 Cuối tuần vui!' : '☀️ Chào buổi sáng!'}`
        const body = bodyMatch?.[1]?.trim() ?? 'Mở Tappy để tìm điểm ăn uống hoặc vui chơi hôm nay nhé!'

        await sendNotificationToUser(uid, {
          title,
          body,
          data: { url: '/' },
        })
      })
    )

    const failed = results.filter(r => r.status === 'rejected').length
    return NextResponse.json({ ok: true, sent: userIds.length - failed, failed, day: dayName })
  } catch (e) {
    console.error('[cron/morning-brief] Error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
