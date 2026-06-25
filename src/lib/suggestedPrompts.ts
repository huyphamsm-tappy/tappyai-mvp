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

const CAFE_GRADIENT = 'from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-900/10'

// ===== WITTY GENERAL PROMPTS (không phân giới tính) =====

const WITTY_PROMPTS: PromptItem[] = [
  { text: '"Ăn gì?" — câu hỏi khó nhất ngày. Tappy quyết hộ luôn 🤔', category: 'food' },
  { text: 'Hôm nay tự thưởng một cái gì đó đi, xứng đáng mà 🎁', category: 'entertainment' },
  { text: 'Tìm quán ngon không cần hỏi cả group chat nữa', category: 'food' },
  { text: 'Deadline xong rồi — tối nay ăn gì cho xứng? 🎉', category: 'food' },
  { text: 'Đặt đồ ăn thôi, hôm nay không muốn quyết định thêm gì 😌', category: 'food' },
  { text: 'Tìm chỗ ngồi đủ ngon để gọi là "đang làm việc" 💼', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Bữa ăn ngon nhất là bữa ăn không cần nấu 😏', category: 'food' },
  { text: 'Giá như có người quyết chỗ ăn hộ... à có rồi, là Tappy 😄', category: 'food' },
  { text: 'Deal hôm nay có gì để biện hộ cho ví tiền không? 💸', category: 'shopping' },
  { text: 'Chỗ đẹp, ngon, không đắt — unicorn hay có thật?', category: 'food' },
  { text: 'Cần kế hoạch cho buổi tối không cần nghĩ quá nhiều', category: 'entertainment' },
  { text: 'Đi đâu cuối tuần mà về không muốn đi làm sớm hơn?', category: 'travel' },
]

// ===== GENDER-SPECIFIC PROMPTS =====

const FEMALE_PROMPTS: PromptItem[] = [
  { text: 'Ăn sáng healthy mà không hại chế độ diet (lần này thật) 🥗', category: 'food' },
  { text: '"Chỉ xem thôi không mua" — quán nào test được ý chí vậy? 😅', category: 'shopping' },
  { text: 'Nail + cà phê để có content IG đẹp hôm nay? 📸', category: 'spa', emoji: '💅', gradient: DEFAULT_GRADIENT.spa },
  { text: 'Spa thư giãn vì tự thưởng cho bản thân là điều tối thiểu ✨', category: 'spa' },
  { text: 'Deal skincare + facial hôm nay có gì không Tappy?', category: 'spa' },
  { text: 'Ăn ở đâu ngon mà nhìn cân xong không hối hận? 🙈', category: 'food' },
  { text: 'Brunch đẹp, ngon, chụp không xấu — combo hoàn hảo không? 📷', category: 'food' },
  { text: 'Trà chiều + bánh ngọt để "vừa ăn vừa tám" cuối tuần 🍰', category: 'food', emoji: '🍰' },
  { text: 'Sale hôm nay có gì để hợp lý hoá 1 bữa mua sắm? 🛒', category: 'shopping' },
  { text: 'Làm nail chỗ nào đẹp, nhanh, không xước 3 tiếng sau? 💅', category: 'spa', emoji: '💅', gradient: DEFAULT_GRADIENT.spa },
  { text: 'Cà phê chụp ảnh đẹp + ngon + yên tĩnh, có không? ☕', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Mua sắm không cần lý do, chỉ cần chỗ ngon lành thôi 🛍️', category: 'shopping' },
  { text: 'Gói spa + massage cho 2 người, hợp lý hoá với bạn thân nha', category: 'spa' },
  { text: 'Đi mua đồ "chỉ một cái thôi" — Tappy biết kết quả rồi đấy 😂', category: 'shopping' },
]

const MALE_PROMPTS: PromptItem[] = [
  { text: 'Cơm trưa không cần suy nghĩ — Tappy quyết hộ luôn 🍚', category: 'food' },
  { text: 'Bóng đá tối nay + bia lạnh — bar nào có combo này? ⚽', category: 'entertainment' },
  { text: 'Quán nhậu ngon, có điều hoà, không quá ồn?', category: 'food' },
  { text: 'Cơm nhanh, no, không cần ra khỏi khu vực nhiều 🛋️', category: 'food' },
  { text: 'Cà phê không nhạt, không đắt, wifi không cắt 💻', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Cần quán "ngồi làm việc" kiểu né sếp một buổi 😅', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Craft beer mới đang hot gần đây, Tappy biết chỗ nào? 🍺', category: 'entertainment' },
  { text: 'Ăn gì hôm nay? (câu hỏi khó nhất vũ trụ)', category: 'food' },
  { text: 'Chỗ chơi game + ăn uống, không cần ra ngoài quá xa', category: 'entertainment' },
  { text: 'No bụng, không đắt, không phải xếp hàng — có thật không?', category: 'food' },
  { text: 'Tối nay nhậu kiểu gì mà vẫn dậy sáng làm việc được? 🤣', category: 'entertainment' },
  { text: 'Quán ăn ngon không cần lên mạng search 30 phút', category: 'food' },
  { text: 'Địa điểm chill cuối tuần không quá phải suy nghĩ', category: 'travel' },
  { text: 'Buffet thịt nướng ngon, đáng tiền, gần đây?', category: 'food' },
]

// ===== TIME-BASED POOLS =====

const MORNING_PROMPTS: PromptItem[] = [
  { text: 'Sáng nay ăn gì? Gợi ý quán ăn sáng ngon gần đây', category: 'food' },
  { text: 'Cà phê yên tĩnh để làm việc buổi sáng?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Bún bò, phở hay bánh mì ngon sáng nay?', category: 'food' },
  { text: 'Cà phê sáng không đông, ngồi được lâu?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Ăn sáng nhẹ, healthy gần chỗ làm?', category: 'food' },
  { text: 'Cà phê take away ngon và nhanh buổi sáng?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Quán bánh mì ngon, không xếp hàng lâu?', category: 'food' },
  { text: 'Sáng nay ngủ dậy muộn, ăn gì nhanh nhỉ? ⏰', category: 'food' },
  { text: 'Cà phê sáng mà đến không muộn — liệu có khả thi? 🤔', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
]

const LUNCH_PROMPTS: PromptItem[] = [
  { text: 'Hôm nay ăn trưa ở đâu ngon gần đây?', category: 'food' },
  { text: 'Quán cơm ngon, không phải chờ lâu?', category: 'food' },
  { text: 'Cơm văn phòng bình dân gần khu vực này?', category: 'food' },
  { text: 'Bún/phở/mì trưa nay ăn gì ngon?', category: 'food' },
  { text: 'Đặt đồ ăn trưa qua ShopeeFood có gì ngon?', category: 'food' },
  { text: 'Cơm gà hay cơm sườn, quán nào ngon nhất gần đây?', category: 'food' },
  { text: '11h rồi, họp xong là chạy đi ăn ngay — chỗ nào nhanh? 🏃', category: 'food' },
  { text: 'Ăn trưa một mình mà không thấy buồn — quán nào hay? 😄', category: 'food' },
]

const AFTERNOON_PROMPTS: PromptItem[] = [
  { text: 'Cà phê buổi chiều, chỗ nào có view đẹp?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Deal spa chiều nay, thư giãn sau giờ làm?', category: 'spa' },
  { text: 'Bánh ngọt + cà phê chiều ở đâu ngon?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Chỗ ngồi làm việc yên tĩnh, wifi tốt buổi chiều?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Trà sữa hay đồ uống mát lạnh chiều nay ngon?', category: 'food', emoji: '🧋', gradient: CAFE_GRADIENT },
  { text: 'Nail + spa nhanh, xong trước 18h gần đây?', category: 'spa' },
  { text: 'Chiều nay cần relax, spa massage ở đâu ngon?', category: 'spa' },
  { text: '3h chiều — buồn ngủ hay cà phê? Tappy gợi ý đi ☕', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Chiều nay trốn office một tí — cà phê chỗ nào ổn? 😏', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
]

const EVENING_PROMPTS: PromptItem[] = [
  { text: 'Tối nay ăn gì với gia đình hay bạn bè?', category: 'food' },
  { text: 'Bar hoặc café nghe nhạc tối nay ở đâu?', category: 'entertainment' },
  { text: 'Nhà hàng tối nay, không cần đặt trước?', category: 'food' },
  { text: 'Quán lẩu hoặc nướng tối nay gần đây?', category: 'food' },
  { text: 'Xem phim tối nay, rạp nào còn chỗ?', category: 'entertainment' },
  { text: 'Happy hour tối nay ở bar nào ngon?', category: 'entertainment' },
  { text: 'Quán hải sản tươi sống tối nay gần đây?', category: 'food' },
  { text: 'Tối nay muốn đi đâu đó — không cần nghĩ nhiều, Tappy đề xuất đi', category: 'entertainment' },
  { text: 'Ăn gì tối nay mà cả nhóm không cãi nhau? 😂', category: 'food' },
]

const NIGHT_PROMPTS: PromptItem[] = [
  { text: 'Đêm nay có gì vui không?', category: 'entertainment' },
  { text: 'Quán nhậu ngon, không quá ồn tối nay?', category: 'food' },
  { text: 'Bia hơi hay cocktail bar tối nay ở đâu?', category: 'entertainment' },
  { text: 'Đồ ăn khuya ngon ship nhanh gần đây?', category: 'food' },
  { text: 'Quán cà phê mở khuya, ngồi chill được?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Đặt pizza/burger khuya giao nhanh?', category: 'food' },
  { text: 'Karaoke tối nay, chỗ nào giá ok?', category: 'entertainment' },
  { text: 'Khuya rồi mà vẫn chưa ngủ được — đặt gì ăn vặt thôi 🌙', category: 'food' },
  { text: 'Mì tôm hay order đồ ăn khuya? Tappy chọn hộ đi 😴', category: 'food' },
]

// ===== DAY-OF-WEEK POOLS =====

const WEEKDAY_PROMPTS: PromptItem[] = [
  { text: 'Cà phê làm việc đầu tuần, chỗ nào yên tĩnh?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Ăn uống healthy đầu tuần, quán nào ngon?', category: 'food' },
  { text: 'Cơm bình dân gần văn phòng đầu tuần?', category: 'food' },
  { text: 'Thứ 2 lại rồi... ăn gì để đỡ buồn hơn nhỉ? 😅', category: 'food' },
]

const THUFRI_PROMPTS: PromptItem[] = [
  { text: 'Spa thư giãn cuối tuần sắp tới, đặt trước ở đâu?', category: 'spa' },
  { text: 'Kế hoạch tối thứ 6 đi đâu chơi?', category: 'entertainment' },
  { text: 'Happy hour thứ 6 ở bar nào ngon?', category: 'entertainment' },
  { text: 'Dinner cuối tuần, nhà hàng nào cần đặt trước?', category: 'food' },
  { text: 'Thứ 6 rồi! Tối nay ăn gì xứng tầm với cả tuần làm việc? 🎊', category: 'food' },
]

const WEEKEND_PROMPTS: PromptItem[] = [
  { text: 'Cuối tuần đi đâu chơi gần thành phố?', category: 'travel' },
  { text: 'Khách sạn staycation cuối tuần giá tốt?', category: 'travel' },
  { text: 'Hoạt động vui cuối tuần cho cả gia đình?', category: 'entertainment' },
  { text: 'Resort nghỉ dưỡng 1-2 ngày gần thành phố?', category: 'travel' },
  { text: 'Buffet cuối tuần ngon, không phải đặt trước?', category: 'food' },
  { text: 'Điểm check-in đẹp cuối tuần gần đây?', category: 'travel' },
  { text: 'Cuối tuần mà ở nhà thì... thôi đi đâu đó đi 😄', category: 'entertainment' },
  { text: 'Kế hoạch cuối tuần: không plan gì cả, Tappy gợi ý hộ đi', category: 'entertainment' },
]

const SPA_OVERRIDE_PROMPTS: PromptItem[] = [
  { text: 'Spa massage thư giãn giá tốt gần đây?', category: 'spa' },
  { text: 'Nail salon chất lượng, không phải chờ lâu?', category: 'spa' },
  { text: 'Gói chăm sóc da mặt ở spa uy tín?', category: 'spa' },
  { text: 'Spa nước khoáng hoặc sauna gần đây?', category: 'spa' },
]

export function getDynamicPrompts(
  hour: number,
  dayOfWeek: number,
  memory?: UserMemory | null,
  gender?: 'male' | 'female' | null,
  count = 4
): SuggestedPrompt[] {
  // 1. Pick time-based base pool
  let basePool: PromptItem[]
  if (hour >= 5 && hour < 9) basePool = MORNING_PROMPTS
  else if (hour >= 11 && hour < 14) basePool = LUNCH_PROMPTS
  else if (hour >= 14 && hour < 17) basePool = AFTERNOON_PROMPTS
  else if (hour >= 17 && hour < 20) basePool = EVENING_PROMPTS
  else if (hour >= 20) basePool = NIGHT_PROMPTS
  else basePool = MORNING_PROMPTS

  // 2. Day-of-week pool
  let dayPool: PromptItem[]
  if (dayOfWeek >= 1 && dayOfWeek <= 3) dayPool = WEEKDAY_PROMPTS
  else if (dayOfWeek === 4 || dayOfWeek === 5) dayPool = THUFRI_PROMPTS
  else dayPool = WEEKEND_PROMPTS

  // 3. Gender pool — pick 2 from gender-specific if known
  const genderPool: PromptItem[] = gender === 'female'
    ? shuffle(FEMALE_PROMPTS)
    : gender === 'male'
      ? shuffle(MALE_PROMPTS)
      : shuffle(WITTY_PROMPTS)

  // 4. Merge: gender/witty prompts have priority, then time/day
  const pool = shuffle([
    ...genderPool.slice(0, 4),
    ...basePool,
    ...dayPool,
    ...WITTY_PROMPTS.slice(0, 3),
  ])

  // 5. Memory signals
  const location = memory?.location_base ?? null
  const prefs = memory?.preferences ?? {}
  const budgets = memory?.budget ?? {}

  const isLowBudget = Object.values(budgets).some(
    b => typeof b === 'object' && b !== null && (b as { max: number }).max > 0 && (b as { max: number }).max <= 200_000
  )
  const likesSpa = (Array.isArray(prefs.spa) && prefs.spa.length > 0) ||
                   (Array.isArray(memory?.history) && (memory?.history ?? []).some(h => /spa|massage|nail/i.test(h)))

  function localize(text: string): string {
    if (!location) return text
    return text
      .replace('gần khu vực này', `gần ${location}`)
      .replace('gần đây', `gần ${location}`)
  }

  function isTooLuxury(text: string): boolean {
    return isLowBudget && /(cao cấp|sang trọng|luxury|resort cao|5 sao)/i.test(text)
  }

  let candidates = pool.filter(p => !isTooLuxury(p.text))

  if (likesSpa && !candidates.some(p => p.category === 'spa')) {
    candidates = [shuffle(SPA_OVERRIDE_PROMPTS)[0], ...candidates]
  }

  // 6. Pick with category diversity
  const selected: PromptItem[] = []
  const usedCategories = new Set<string>()

  for (const p of candidates) {
    if (selected.length >= count) break
    if (!usedCategories.has(p.category) || selected.length === count - 1) {
      selected.push(p)
      usedCategories.add(p.category)
    }
  }
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
