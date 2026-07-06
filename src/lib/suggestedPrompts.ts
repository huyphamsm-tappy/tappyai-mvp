import type { UserMemory } from './memory/memoryService'

export interface SuggestedPrompt {
  text: string
  textEn: string
  category: 'food' | 'shopping' | 'entertainment' | 'travel' | 'spa'
  emoji: string
  gradient: string
}

type PromptItem = {
  text: string
  textEn: string
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
  { text: '"Ăn gì?" — câu hỏi khó nhất ngày. Tappy quyết hộ luôn 🤔', textEn: '"What to eat?" — the hardest question of the day. Let Tappy decide 🤔', category: 'food' },
  { text: 'Hôm nay tự thưởng một cái gì đó đi, xứng đáng mà 🎁', textEn: 'Treat yourself to something today, you deserve it 🎁', category: 'entertainment' },
  { text: 'Tìm quán ngon không cần hỏi cả group chat nữa', textEn: 'Find a great spot without asking the whole group chat', category: 'food' },
  { text: 'Deadline xong rồi — tối nay ăn gì cho xứng? 🎉', textEn: 'Deadline done — what dinner does that deserve? 🎉', category: 'food' },
  { text: 'Đặt đồ ăn thôi, hôm nay không muốn quyết định thêm gì 😌', textEn: 'Just order food — no more decisions today 😌', category: 'food' },
  { text: 'Tìm chỗ ngồi đủ ngon để gọi là "đang làm việc" 💼', textEn: 'Find a spot nice enough to count as "working" 💼', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Bữa ăn ngon nhất là bữa ăn không cần nấu 😏', textEn: "The best meal is the one you don't have to cook 😏", category: 'food' },
  { text: 'Giá như có người quyết chỗ ăn hộ... à có rồi, là Tappy 😄', textEn: "If only someone picked where to eat for you... oh wait, that's Tappy 😄", category: 'food' },
  { text: 'Deal hôm nay có gì để biện hộ cho ví tiền không? 💸', textEn: 'Any deals today to justify to my wallet? 💸', category: 'shopping' },
  { text: 'Chỗ đẹp, ngon, không đắt — unicorn hay có thật?', textEn: 'Pretty, tasty, not pricey — a unicorn or the real deal?', category: 'food' },
  { text: 'Cần kế hoạch cho buổi tối không cần nghĩ quá nhiều', textEn: 'Need an evening plan that requires zero overthinking', category: 'entertainment' },
  { text: 'Đi đâu cuối tuần mà về không muốn đi làm sớm hơn?', textEn: "Where to go this weekend that won't make Monday feel worse?", category: 'travel' },
]

// ===== GENDER-SPECIFIC PROMPTS =====

const FEMALE_PROMPTS: PromptItem[] = [
  { text: 'Ăn sáng healthy mà không hại chế độ diet (lần này thật) 🥗', textEn: "A healthy breakfast that won't ruin the diet (for real this time) 🥗", category: 'food' },
  { text: '"Chỉ xem thôi không mua" — quán nào test được ý chí vậy? 😅', textEn: '"Just browsing, not buying" — which shop can test that willpower? 😅', category: 'shopping' },
  { text: 'Nail + cà phê để có content IG đẹp hôm nay? 📸', textEn: 'Nails + coffee for cute IG content today? 📸', category: 'spa', emoji: '💅', gradient: DEFAULT_GRADIENT.spa },
  { text: 'Spa thư giãn vì tự thưởng cho bản thân là điều tối thiểu ✨', textEn: 'A relaxing spa day, because self-care is the bare minimum ✨', category: 'spa' },
  { text: 'Deal skincare + facial hôm nay có gì không Tappy?', textEn: 'Any skincare + facial deals today, Tappy?', category: 'spa' },
  { text: 'Ăn ở đâu ngon mà nhìn cân xong không hối hận? 🙈', textEn: "Somewhere tasty that won't cause regret on the scale? 🙈", category: 'food' },
  { text: 'Brunch đẹp, ngon, chụp không xấu — combo hoàn hảo không? 📷', textEn: "Brunch that's pretty, tasty and photogenic — perfect combo, right? 📷", category: 'food' },
  { text: 'Trà chiều + bánh ngọt để "vừa ăn vừa tám" cuối tuần 🍰', textEn: 'Afternoon tea + pastries for a weekend gossip session 🍰', category: 'food', emoji: '🍰' },
  { text: 'Sale hôm nay có gì để hợp lý hoá 1 bữa mua sắm? 🛒', textEn: 'Any sales today to justify a shopping spree? 🛒', category: 'shopping' },
  { text: 'Làm nail chỗ nào đẹp, nhanh, không xước 3 tiếng sau? 💅', textEn: 'Where to get nails done — pretty, fast, and not chipped 3 hours later? 💅', category: 'spa', emoji: '💅', gradient: DEFAULT_GRADIENT.spa },
  { text: 'Cà phê chụp ảnh đẹp + ngon + yên tĩnh, có không? ☕', textEn: "A café that's photogenic + tasty + quiet — does it exist? ☕", category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Mua sắm không cần lý do, chỉ cần chỗ ngon lành thôi 🛍️', textEn: 'No reason needed for shopping, just a good place to do it 🛍️', category: 'shopping' },
  { text: 'Gói spa + massage cho 2 người, hợp lý hoá với bạn thân nha', textEn: 'Spa + massage package for 2 — totally justified with a bestie', category: 'spa' },
  { text: 'Đi mua đồ "chỉ một cái thôi" — Tappy biết kết quả rồi đấy 😂', textEn: 'Shopping for "just one thing" — Tappy already knows how that ends 😂', category: 'shopping' },
]

const MALE_PROMPTS: PromptItem[] = [
  { text: 'Cơm trưa không cần suy nghĩ — Tappy quyết hộ luôn 🍚', textEn: 'Lunch with zero thinking — let Tappy decide 🍚', category: 'food' },
  { text: 'Bóng đá tối nay + bia lạnh — bar nào có combo này? ⚽', textEn: 'Football tonight + cold beer — which bar has that combo? ⚽', category: 'entertainment' },
  { text: 'Quán nhậu ngon, có điều hoà, không quá ồn?', textEn: "A good drinking spot with AC that's not too loud?", category: 'food' },
  { text: 'Cơm nhanh, no, không cần ra khỏi khu vực nhiều 🛋️', textEn: 'A quick, filling meal without going too far 🛋️', category: 'food' },
  { text: 'Cà phê không nhạt, không đắt, wifi không cắt 💻', textEn: "Coffee that's not weak, not pricey, and wifi that doesn't drop 💻", category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Cần quán "ngồi làm việc" kiểu né sếp một buổi 😅', textEn: 'Need a "working from café" spot to dodge the boss for a bit 😅', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Craft beer mới đang hot gần đây, Tappy biết chỗ nào? 🍺', textEn: 'Any hot new craft beer spots nearby, Tappy? 🍺', category: 'entertainment' },
  { text: 'Ăn gì hôm nay? (câu hỏi khó nhất vũ trụ)', textEn: 'What to eat today? (the hardest question in the universe)', category: 'food' },
  { text: 'Chỗ chơi game + ăn uống, không cần ra ngoài quá xa', textEn: 'Somewhere to game + eat without traveling too far', category: 'entertainment' },
  { text: 'No bụng, không đắt, không phải xếp hàng — có thật không?', textEn: 'Filling, cheap, no queue — is that even real?', category: 'food' },
  { text: 'Tối nay nhậu kiểu gì mà vẫn dậy sáng làm việc được? 🤣', textEn: 'How to drink tonight and still make it to work tomorrow? 🤣', category: 'entertainment' },
  { text: 'Quán ăn ngon không cần lên mạng search 30 phút', textEn: 'A good place to eat without 30 minutes of googling', category: 'food' },
  { text: 'Địa điểm chill cuối tuần không quá phải suy nghĩ', textEn: 'A chill weekend spot that needs no overthinking', category: 'travel' },
  { text: 'Buffet thịt nướng ngon, đáng tiền, gần đây?', textEn: "A good BBQ buffet nearby that's worth the money?", category: 'food' },
]

// ===== TIME-BASED POOLS =====

const MORNING_PROMPTS: PromptItem[] = [
  { text: 'Sáng nay ăn gì? Gợi ý quán ăn sáng ngon gần đây', textEn: "What's for breakfast? Suggest good breakfast spots nearby", category: 'food' },
  { text: 'Cà phê yên tĩnh để làm việc buổi sáng?', textEn: 'A quiet café for morning work?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Bún bò, phở hay bánh mì ngon sáng nay?', textEn: 'Bún bò, phở or bánh mì — what sounds good this morning?', category: 'food' },
  { text: 'Cà phê sáng không đông, ngồi được lâu?', textEn: "A morning café that's not crowded and good for a long sit?", category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Ăn sáng nhẹ, healthy gần chỗ làm?', textEn: 'A light, healthy breakfast near work?', category: 'food' },
  { text: 'Cà phê take away ngon và nhanh buổi sáng?', textEn: 'Good, quick takeaway coffee this morning?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Quán bánh mì ngon, không xếp hàng lâu?', textEn: 'A good bánh mì spot without a long queue?', category: 'food' },
  { text: 'Sáng nay ngủ dậy muộn, ăn gì nhanh nhỉ? ⏰', textEn: "Overslept this morning — what's quick to eat? ⏰", category: 'food' },
  { text: 'Cà phê sáng mà đến không muộn — liệu có khả thi? 🤔', textEn: 'Morning coffee without being late — is that even possible? 🤔', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
]

const LUNCH_PROMPTS: PromptItem[] = [
  { text: 'Hôm nay ăn trưa ở đâu ngon gần đây?', textEn: "Where's a good lunch nearby today?", category: 'food' },
  { text: 'Quán cơm ngon, không phải chờ lâu?', textEn: 'A good rice place without a long wait?', category: 'food' },
  { text: 'Cơm văn phòng bình dân gần khu vực này?', textEn: 'An affordable office lunch near this area?', category: 'food' },
  { text: 'Bún/phở/mì trưa nay ăn gì ngon?', textEn: "Bún, phở or noodles — what's good for lunch today?", category: 'food' },
  { text: 'Đặt đồ ăn trưa qua ShopeeFood có gì ngon?', textEn: "What's good for lunch delivery on ShopeeFood?", category: 'food' },
  { text: 'Cơm gà hay cơm sườn, quán nào ngon nhất gần đây?', textEn: 'Cơm gà or cơm sườn — which spot is best nearby?', category: 'food' },
  { text: '11h rồi, họp xong là chạy đi ăn ngay — chỗ nào nhanh? 🏃', textEn: "It's 11 already, sprinting to lunch right after the meeting — where's fast? 🏃", category: 'food' },
  { text: 'Ăn trưa một mình mà không thấy buồn — quán nào hay? 😄', textEn: 'Lunch alone without feeling lonely — any good spots? 😄', category: 'food' },
]

const AFTERNOON_PROMPTS: PromptItem[] = [
  { text: 'Cà phê buổi chiều, chỗ nào có view đẹp?', textEn: 'Afternoon coffee — where has a nice view?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Deal spa chiều nay, thư giãn sau giờ làm?', textEn: 'Spa deals this afternoon to unwind after work?', category: 'spa' },
  { text: 'Bánh ngọt + cà phê chiều ở đâu ngon?', textEn: "Where's good for afternoon coffee + pastries?", category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Chỗ ngồi làm việc yên tĩnh, wifi tốt buổi chiều?', textEn: 'A quiet work spot with good wifi this afternoon?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Trà sữa hay đồ uống mát lạnh chiều nay ngon?', textEn: "Bubble tea or a cold drink — what's good this afternoon?", category: 'food', emoji: '🧋', gradient: CAFE_GRADIENT },
  { text: 'Nail + spa nhanh, xong trước 18h gần đây?', textEn: 'Quick nails + spa nearby, done before 6pm?', category: 'spa' },
  { text: 'Chiều nay cần relax, spa massage ở đâu ngon?', textEn: "Need to relax this afternoon — where's a good spa massage?", category: 'spa' },
  { text: '3h chiều — buồn ngủ hay cà phê? Tappy gợi ý đi ☕', textEn: '3pm — nap or coffee? Tappy, suggest something ☕', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Chiều nay trốn office một tí — cà phê chỗ nào ổn? 😏', textEn: 'Sneaking out of the office this afternoon — which café works? 😏', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
]

const EVENING_PROMPTS: PromptItem[] = [
  { text: 'Tối nay ăn gì với gia đình hay bạn bè?', textEn: 'What to eat tonight with family or friends?', category: 'food' },
  { text: 'Bar hoặc café nghe nhạc tối nay ở đâu?', textEn: 'A bar or café with music tonight — where to?', category: 'entertainment' },
  { text: 'Nhà hàng tối nay, không cần đặt trước?', textEn: 'A restaurant tonight, no reservation needed?', category: 'food' },
  { text: 'Quán lẩu hoặc nướng tối nay gần đây?', textEn: 'Hotpot or BBQ nearby tonight?', category: 'food' },
  { text: 'Xem phim tối nay, rạp nào còn chỗ?', textEn: 'Movie tonight — which cinema still has seats?', category: 'entertainment' },
  { text: 'Happy hour tối nay ở bar nào ngon?', textEn: 'Which bar has a good happy hour tonight?', category: 'entertainment' },
  { text: 'Quán hải sản tươi sống tối nay gần đây?', textEn: 'Fresh seafood nearby tonight?', category: 'food' },
  { text: 'Tối nay muốn đi đâu đó — không cần nghĩ nhiều, Tappy đề xuất đi', textEn: 'Want to go somewhere tonight — no overthinking, Tappy, you pick', category: 'entertainment' },
  { text: 'Ăn gì tối nay mà cả nhóm không cãi nhau? 😂', textEn: "What dinner won't start a group argument tonight? 😂", category: 'food' },
]

const NIGHT_PROMPTS: PromptItem[] = [
  { text: 'Đêm nay có gì vui không?', textEn: 'Anything fun going on tonight?', category: 'entertainment' },
  { text: 'Quán nhậu ngon, không quá ồn tối nay?', textEn: "A good drinking spot tonight that's not too loud?", category: 'food' },
  { text: 'Bia hơi hay cocktail bar tối nay ở đâu?', textEn: 'Bia hơi or a cocktail bar — where to tonight?', category: 'entertainment' },
  { text: 'Đồ ăn khuya ngon ship nhanh gần đây?', textEn: 'Good late-night food with fast delivery nearby?', category: 'food' },
  { text: 'Quán cà phê mở khuya, ngồi chill được?', textEn: 'A café open late, good for chilling?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Đặt pizza/burger khuya giao nhanh?', textEn: 'Late-night pizza/burger with fast delivery?', category: 'food' },
  { text: 'Karaoke tối nay, chỗ nào giá ok?', textEn: 'Karaoke tonight — where has decent prices?', category: 'entertainment' },
  { text: 'Khuya rồi mà vẫn chưa ngủ được — đặt gì ăn vặt thôi 🌙', textEn: "It's late and sleep isn't happening — let's order a snack 🌙", category: 'food' },
  { text: 'Mì tôm hay order đồ ăn khuya? Tappy chọn hộ đi 😴', textEn: 'Instant noodles or late-night delivery? Tappy, you choose 😴', category: 'food' },
]

// ===== DAY-OF-WEEK POOLS =====

const WEEKDAY_PROMPTS: PromptItem[] = [
  { text: 'Cà phê làm việc đầu tuần, chỗ nào yên tĩnh?', textEn: 'A quiet café to start the work week?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Ăn uống healthy đầu tuần, quán nào ngon?', textEn: 'Healthy eats to kick off the week — which spot is good?', category: 'food' },
  { text: 'Cơm bình dân gần văn phòng đầu tuần?', textEn: 'An affordable lunch near the office to start the week?', category: 'food' },
  { text: 'Thứ 2 lại rồi... ăn gì để đỡ buồn hơn nhỉ? 😅', textEn: 'Monday again... what to eat to make it hurt less? 😅', category: 'food' },
]

const THUFRI_PROMPTS: PromptItem[] = [
  { text: 'Spa thư giãn cuối tuần sắp tới, đặt trước ở đâu?', textEn: 'A relaxing spa for the coming weekend — where to book ahead?', category: 'spa' },
  { text: 'Kế hoạch tối thứ 6 đi đâu chơi?', textEn: 'Friday night plans — where to go?', category: 'entertainment' },
  { text: 'Happy hour thứ 6 ở bar nào ngon?', textEn: 'Which bar has a good Friday happy hour?', category: 'entertainment' },
  { text: 'Dinner cuối tuần, nhà hàng nào cần đặt trước?', textEn: 'Weekend dinner — which restaurants need a reservation?', category: 'food' },
  { text: 'Thứ 6 rồi! Tối nay ăn gì xứng tầm với cả tuần làm việc? 🎊', textEn: "It's Friday! What dinner is worthy of the whole work week? 🎊", category: 'food' },
]

const WEEKEND_PROMPTS: PromptItem[] = [
  { text: 'Cuối tuần đi đâu chơi gần thành phố?', textEn: 'Where to go this weekend near the city?', category: 'travel' },
  { text: 'Khách sạn staycation cuối tuần giá tốt?', textEn: 'A good-value staycation hotel this weekend?', category: 'travel' },
  { text: 'Hoạt động vui cuối tuần cho cả gia đình?', textEn: 'Fun weekend activities for the whole family?', category: 'entertainment' },
  { text: 'Resort nghỉ dưỡng 1-2 ngày gần thành phố?', textEn: 'A 1-2 day resort getaway near the city?', category: 'travel' },
  { text: 'Buffet cuối tuần ngon, không phải đặt trước?', textEn: 'A good weekend buffet, no booking needed?', category: 'food' },
  { text: 'Điểm check-in đẹp cuối tuần gần đây?', textEn: 'Pretty photo spots nearby this weekend?', category: 'travel' },
  { text: 'Cuối tuần mà ở nhà thì... thôi đi đâu đó đi 😄', textEn: "Staying home on a weekend? Nah... let's go somewhere 😄", category: 'entertainment' },
  { text: 'Kế hoạch cuối tuần: không plan gì cả, Tappy gợi ý hộ đi', textEn: 'Weekend plan: no plan at all — Tappy, suggest something', category: 'entertainment' },
]

const SPA_OVERRIDE_PROMPTS: PromptItem[] = [
  { text: 'Spa massage thư giãn giá tốt gần đây?', textEn: 'A relaxing spa massage nearby at a good price?', category: 'spa' },
  { text: 'Nail salon chất lượng, không phải chờ lâu?', textEn: 'A quality nail salon without a long wait?', category: 'spa' },
  { text: 'Gói chăm sóc da mặt ở spa uy tín?', textEn: 'A facial package at a reputable spa?', category: 'spa' },
  { text: 'Spa nước khoáng hoặc sauna gần đây?', textEn: 'A mineral spa or sauna nearby?', category: 'spa' },
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

  function localizeEn(text: string): string {
    if (!location) return text
    return text
      .replace('near this area', `near ${location}`)
      .replace('nearby', `near ${location}`)
  }

  function isTooLuxury(text: string): boolean {
    return isLowBudget && /(cao cấp|sang trọng|luxury|resort cao|5 sao)/i.test(text)
  }

  let candidates = pool.filter(p => !isTooLuxury(p.text))

  if (likesSpa && !candidates.some(p => p.category === 'spa')) {
    candidates = [shuffle(SPA_OVERRIDE_PROMPTS)[0], ...candidates]
  }

  // Deduplicate by text. The pools overlap (e.g. WITTY_PROMPTS is included both via
  // the gender/witty slice and its own explicit slice), so the same prompt text can
  // appear more than once. Returning duplicates would collide on React's `key={text}`
  // in consumers and render duplicate suggestion cards.
  const seenText = new Set<string>()
  candidates = candidates.filter(p => {
    if (seenText.has(p.text)) return false
    seenText.add(p.text)
    return true
  })

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
    textEn: localizeEn(p.textEn),
    category: p.category,
    emoji: p.emoji ?? DEFAULT_EMOJI[p.category] ?? '✨',
    gradient: p.gradient ?? DEFAULT_GRADIENT[p.category] ?? DEFAULT_GRADIENT.food,
  }))
}
