import type { UserMemory } from './memory/memoryService'

export interface SuggestedPrompt {
  text: string
  category: 'food' | 'shopping' | 'entertainment' | 'travel' | 'spa'
  emoji: string
  gradient: string
}

type PromptItem = {
  text: string
  category: 'food' | 'shopping' | 'entertainment' | 'travel' | 'spa'
  emoji?: string
  gradient?: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const DEFAULT_EMOJI: Record<string, string> = {
  food: '🍜',
  shopping: '🛍️',
  entertainment: '🎮',
  travel: '✈️',
  spa: '💆',
}

const DEFAULT_GRADIENT: Record<string, string> = {
  food: 'from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-orange-900/10',
  shopping: 'from-pink-100 to-pink-50 dark:from-pink-900/30 dark:to-pink-900/10',
  entertainment: 'from-purple-100 to-purple-50 dark:from-purple-900/30 dark:to-purple-900/10',
  travel: 'from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-900/10',
  spa: 'from-green-100 to-green-50 dark:from-green-900/30 dark:to-green-900/10',
}

// Café prompts use food category but amber styling
const CAFE_GRADIENT = 'from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-900/10'

// ===== PROMPT POOLS BY TIME =====

const MORNING_PROMPTS: PromptItem[] = [ // 5h–9h
  { text: 'Sáng nay ăn gì? Gợi ý quán ăn sáng ngon gần đây', category: 'food' },
  { text: 'Cà phê yên tĩnh để làm việc buổi sáng?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Bún bò, phở hay bánh mì ngon sáng nay?', category: 'food' },
  { text: 'Cà phê sáng không đông, ngồi được lâu?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Ăn sáng nhẹ, healthy gần chỗ làm?', category: 'food' },
  { text: 'Cà phê take away ngon và nhanh buổi sáng?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Quán bánh mì ngon, không xếp hàng lâu?', category: 'food' },
]

const LUNCH_PROMPTS: PromptItem[] = [ // 11h–13h
  { text: 'Hôm nay ăn trưa ở đâu ngon gần đây?', category: 'food' },
  { text: 'Quán cơm ngon, không phải chờ lâu?', category: 'food' },
  { text: 'Cơm văn phòng bình dân gần khu vực này?', category: 'food' },
  { text: 'Bún/phở/mì trưa nay ăn gì ngon?', category: 'food' },
  { text: 'Đặt đồ ăn trưa qua ShopeeFood có gì ngon?', category: 'food' },
  { text: 'Cơm gà hay cơm sườn, quán nào ngon nhất gần đây?', category: 'food' },
]

const AFTERNOON_PROMPTS: PromptItem[] = [ // 14h–17h
  { text: 'Cà phê buổi chiều, chỗ nào có view đẹp?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Deal spa chiều nay, thư giãn sau giờ làm?', category: 'spa' },
  { text: 'Bánh ngọt + cà phê chiều ở đâu ngon?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Chỗ ngồi làm việc yên tĩnh, wifi tốt buổi chiều?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Trà sữa hay đồ uống mát lạnh chiều nay ngon?', category: 'food', emoji: '🧋', gradient: CAFE_GRADIENT },
  { text: 'Nail + spa nhanh, xong trước 18h gần đây?', category: 'spa' },
  { text: 'Chiều nay cần relax, spa massage ở đâu ngon?', category: 'spa' },
]

const EVENING_PROMPTS: PromptItem[] = [ // 17h–20h
  { text: 'Tối nay ăn gì với gia đình hay bạn bè?', category: 'food' },
  { text: 'Bar hoặc café nghe nhạc tối nay ở đâu?', category: 'entertainment' },
  { text: 'Nhà hàng tối nay, không cần đặt trước?', category: 'food' },
  { text: 'Quán lẩu hoặc nướng tối nay gần đây?', category: 'food' },
  { text: 'Xem phim tối nay, rạp nào còn chỗ?', category: 'entertainment' },
  { text: 'Happy hour tối nay ở bar nào ngon?', category: 'entertainment' },
  { text: 'Quán hải sản tươi sống tối nay gần đây?', category: 'food' },
]

const NIGHT_PROMPTS: PromptItem[] = [ // 20h–23h
  { text: 'Đêm nay có gì vui không?', category: 'entertainment' },
  { text: 'Quán nhậu ngon, không quá ồn tối nay?', category: 'food' },
  { text: 'Bia hơi hay cocktail bar tối nay ở đâu?', category: 'entertainment' },
  { text: 'Đồ ăn khuya ngon ship nhanh gần đây?', category: 'food' },
  { text: 'Quán cà phê mở khuya, ngồi chill được?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Đặt pizza/burger khuya giao nhanh?', category: 'food' },
  { text: 'Karaoke tối nay, chỗ nào giá ok?', category: 'entertainment' },
]

// ===== DAY-OF-WEEK BONUS POOLS =====

const WEEKDAY_PROMPTS: PromptItem[] = [ // Mon–Wed
  { text: 'Cà phê làm việc đầu tuần, chỗ nào yên tĩnh?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Ăn uống healthy đầu tuần, quán nào ngon?', category: 'food' },
  { text: 'Cơm bình dân gần văn phòng đầu tuần?', category: 'food' },
]

const THUFRI_PROMPTS: PromptItem[] = [ // Thu–Fri
  { text: 'Spa thư giãn cuối tuần sắp tới, đặt trước ở đâu?', category: 'spa' },
  { text: 'Kế hoạch tối thứ 6 đi đâu chơi?', category: 'entertainment' },
  { text: 'Happy hour thứ 6 ở bar nào ngon?', category: 'entertainment' },
  { text: 'Dinner cuối tuần, nhà hàng nào cần đặt trước?', category: 'food' },
]

const WEEKEND_PROMPTS: PromptItem[] = [ // Sat–Sun
  { text: 'Cuối tuần đi đâu chơi gần thành phố?', category: 'travel' },
  { text: 'Khách sạn staycation cuối tuần giá tốt?', category: 'travel' },
  { text: 'Hoạt động vui cuối tuần cho cả gia đình?', category: 'entertainment' },
  { text: 'Resort nghỉ dưỡng 1-2 ngày gần thành phố?', category: 'travel' },
  { text: 'Buffet cuối tuần ngon, không phải đặt trước?', category: 'food' },
  { text: 'Điểm check-in đẹp cuối tuần gần đây?', category: 'travel' },
]

// ===== MEMORY OVERRIDE POOLS =====

const SPA_OVERRIDE_PROMPTS: PromptItem[] = [
  { text: 'Spa massage thư giãn giá tốt gần đây?', category: 'spa' },
  { text: 'Nail salon chất lượng, không phải chờ lâu?', category: 'spa' },
  { text: 'Gói chăm sóc da mặt ở spa uy tín?', category: 'spa' },
  { text: 'Spa nước khoáng hoặc sauna gần đây?', category: 'spa' },
]

export function getDynamicPrompts(
  hour: number,       // 0–23, VN time (UTC+7)
  dayOfWeek: number,  // 0=Sun, 1=Mon, … 6=Sat
  memory?: UserMemory | null,
  count = 4
): SuggestedPrompt[] {
  // 1. Pick time-based base pool
  let basePool: PromptItem[]
  if (hour >= 5 && hour < 9) basePool = MORNING_PROMPTS
  else if (hour >= 11 && hour < 14) basePool = LUNCH_PROMPTS
  else if (hour >= 14 && hour < 17) basePool = AFTERNOON_PROMPTS
  else if (hour >= 17 && hour < 20) basePool = EVENING_PROMPTS
  else if (hour >= 20) basePool = NIGHT_PROMPTS
  else basePool = MORNING_PROMPTS // 0h–4h: treat as morning

  // 2. Add day-of-week pool
  let dayPool: PromptItem[]
  if (dayOfWeek >= 1 && dayOfWeek <= 3) dayPool = WEEKDAY_PROMPTS
  else if (dayOfWeek === 4 || dayOfWeek === 5) dayPool = THUFRI_PROMPTS
  else dayPool = WEEKEND_PROMPTS // 0=Sun, 6=Sat

  // 3. Shuffle and combine
  const pool = shuffle([...basePool, ...dayPool])

  // 4. Read memory signals
  const location = memory?.location_base ?? null
  const prefs = memory?.preferences ?? {}
  const budgets = memory?.budget ?? {}

  const isLowBudget = Object.values(budgets).some(
    b => typeof b === 'object' && b !== null && (b as { max: number }).max > 0 && (b as { max: number }).max <= 200_000
  )
  const likesSpa = (Array.isArray(prefs.spa) && prefs.spa.length > 0) ||
                   (Array.isArray(memory?.history) && (memory?.history ?? []).some(h => /spa|massage|nail/i.test(h)))

  // 5. Localize prompts with user's base location
  function localize(text: string): string {
    if (!location) return text
    return text
      .replace('gần khu vực này', `gần ${location}`)
      .replace('gần đây', `gần ${location}`)
  }

  // 6. Low-budget filter: remove high-end mentions
  function isTooLuxury(text: string): boolean {
    return isLowBudget && /(cao cấp|sang trọng|luxury|resort cao|5 sao)/i.test(text)
  }

  // 7. Build candidate list
  let candidates = pool.filter(p => !isTooLuxury(p.text))

  // 8. If user likes spa → guarantee at least 1 spa prompt
  if (likesSpa && !candidates.some(p => p.category === 'spa')) {
    candidates = [shuffle(SPA_OVERRIDE_PROMPTS)[0], ...candidates]
  }

  // 9. Pick `count` items with category diversity
  const selected: PromptItem[] = []
  const usedCategories = new Set<string>()

  // First pass: ensure variety
  for (const p of candidates) {
    if (selected.length >= count) break
    if (!usedCategories.has(p.category) || selected.length === count - 1) {
      selected.push(p)
      usedCategories.add(p.category)
    }
  }
  // Second pass: fill remaining slots if needed
  for (const p of candidates) {
    if (selected.length >= count) break
    if (!selected.includes(p)) selected.push(p)
  }

  return selected.slice(0, count).map(p => ({
    text: localize(p.text),
    category: p.category,
    emoji: p.emoji ?? DEFAULT_EMOJI[p.category] ?? '✨',
    gradient: p.gradient ?? DEFAULT_GRADIENT[p.category] ?? DEFAULT_GRADIENT.food,
  }))
}
