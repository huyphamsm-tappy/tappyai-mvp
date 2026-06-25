// Test suite for getDynamicPrompts
// Run: node test-prompts.mjs

// ---- Inline the module (no TS transpile needed) ----

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const DEFAULT_EMOJI = { food: '🍜', shopping: '🛍️', entertainment: '🎮', travel: '✈️', spa: '💆' }
const DEFAULT_GRADIENT = {
  food: 'from-orange-100 to-orange-50',
  shopping: 'from-pink-100 to-pink-50',
  entertainment: 'from-purple-100 to-purple-50',
  travel: 'from-blue-100 to-blue-50',
  spa: 'from-green-100 to-green-50',
}
const CAFE_GRADIENT = 'from-amber-100 to-amber-50'

const MORNING_PROMPTS = [
  { text: 'Sáng nay ăn gì? Gợi ý quán ăn sáng ngon gần đây', category: 'food' },
  { text: 'Cà phê yên tĩnh để làm việc buổi sáng?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Bún bò, phở hay bánh mì ngon sáng nay?', category: 'food' },
  { text: 'Cà phê sáng không đông, ngồi được lâu?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Ăn sáng nhẹ, healthy gần chỗ làm?', category: 'food' },
  { text: 'Cà phê take away ngon và nhanh buổi sáng?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Quán bánh mì ngon, không xếp hàng lâu?', category: 'food' },
]
const LUNCH_PROMPTS = [
  { text: 'Hôm nay ăn trưa ở đâu ngon gần đây?', category: 'food' },
  { text: 'Quán cơm ngon, không phải chờ lâu?', category: 'food' },
  { text: 'Cơm văn phòng bình dân gần khu vực này?', category: 'food' },
  { text: 'Bún/phở/mì trưa nay ăn gì ngon?', category: 'food' },
  { text: 'Đặt đồ ăn trưa qua ShopeeFood có gì ngon?', category: 'food' },
  { text: 'Cơm gà hay cơm sườn, quán nào ngon nhất gần đây?', category: 'food' },
]
const AFTERNOON_PROMPTS = [
  { text: 'Cà phê buổi chiều, chỗ nào có view đẹp?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Deal spa chiều nay, thư giãn sau giờ làm?', category: 'spa' },
  { text: 'Bánh ngọt + cà phê chiều ở đâu ngon?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Chỗ ngồi làm việc yên tĩnh, wifi tốt buổi chiều?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Trà sữa hay đồ uống mát lạnh chiều nay ngon?', category: 'food', emoji: '🧋', gradient: CAFE_GRADIENT },
  { text: 'Nail + spa nhanh, xong trước 18h gần đây?', category: 'spa' },
  { text: 'Chiều nay cần relax, spa massage ở đâu ngon?', category: 'spa' },
]
const EVENING_PROMPTS = [
  { text: 'Tối nay ăn gì với gia đình hay bạn bè?', category: 'food' },
  { text: 'Bar hoặc café nghe nhạc tối nay ở đâu?', category: 'entertainment' },
  { text: 'Nhà hàng tối nay, không cần đặt trước?', category: 'food' },
  { text: 'Quán lẩu hoặc nướng tối nay gần đây?', category: 'food' },
  { text: 'Xem phim tối nay, rạp nào còn chỗ?', category: 'entertainment' },
  { text: 'Happy hour tối nay ở bar nào ngon?', category: 'entertainment' },
  { text: 'Quán hải sản tươi sống tối nay gần đây?', category: 'food' },
]
const NIGHT_PROMPTS = [
  { text: 'Đêm nay có gì vui không?', category: 'entertainment' },
  { text: 'Quán nhậu ngon, không quá ồn tối nay?', category: 'food' },
  { text: 'Bia hơi hay cocktail bar tối nay ở đâu?', category: 'entertainment' },
  { text: 'Đồ ăn khuya ngon ship nhanh gần đây?', category: 'food' },
  { text: 'Quán cà phê mở khuya, ngồi chill được?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Đặt pizza/burger khuya giao nhanh?', category: 'food' },
  { text: 'Karaoke tối nay, chỗ nào giá ok?', category: 'entertainment' },
]
const WEEKDAY_PROMPTS = [
  { text: 'Cà phê làm việc đầu tuần, chỗ nào yên tĩnh?', category: 'food', emoji: '☕', gradient: CAFE_GRADIENT },
  { text: 'Ăn uống healthy đầu tuần, quán nào ngon?', category: 'food' },
  { text: 'Cơm bình dân gần văn phòng đầu tuần?', category: 'food' },
]
const THUFRI_PROMPTS = [
  { text: 'Spa thư giãn cuối tuần sắp tới, đặt trước ở đâu?', category: 'spa' },
  { text: 'Kế hoạch tối thứ 6 đi đâu chơi?', category: 'entertainment' },
  { text: 'Happy hour thứ 6 ở bar nào ngon?', category: 'entertainment' },
  { text: 'Dinner cuối tuần, nhà hàng nào cần đặt trước?', category: 'food' },
]
const WEEKEND_PROMPTS = [
  { text: 'Cuối tuần đi đâu chơi gần thành phố?', category: 'travel' },
  { text: 'Khách sạn staycation cuối tuần giá tốt?', category: 'travel' },
  { text: 'Hoạt động vui cuối tuần cho cả gia đình?', category: 'entertainment' },
  { text: 'Resort nghỉ dưỡng 1-2 ngày gần thành phố?', category: 'travel' },
  { text: 'Buffet cuối tuần ngon, không phải đặt trước?', category: 'food' },
  { text: 'Điểm check-in đẹp cuối tuần gần đây?', category: 'travel' },
]
const SPA_OVERRIDE_PROMPTS = [
  { text: 'Spa massage thư giãn giá tốt gần đây?', category: 'spa' },
  { text: 'Nail salon chất lượng, không phải chờ lâu?', category: 'spa' },
  { text: 'Gói chăm sóc da mặt ở spa uy tín?', category: 'spa' },
  { text: 'Spa nước khoáng hoặc sauna gần đây?', category: 'spa' },
]

function getDynamicPrompts(hour, dayOfWeek, memory = null, count = 4) {
  let basePool
  if (hour >= 5 && hour < 9) basePool = MORNING_PROMPTS
  else if (hour >= 11 && hour < 14) basePool = LUNCH_PROMPTS
  else if (hour >= 14 && hour < 17) basePool = AFTERNOON_PROMPTS
  else if (hour >= 17 && hour < 20) basePool = EVENING_PROMPTS
  else if (hour >= 20) basePool = NIGHT_PROMPTS
  else basePool = MORNING_PROMPTS

  let dayPool
  if (dayOfWeek >= 1 && dayOfWeek <= 3) dayPool = WEEKDAY_PROMPTS
  else if (dayOfWeek === 4 || dayOfWeek === 5) dayPool = THUFRI_PROMPTS
  else dayPool = WEEKEND_PROMPTS

  const pool = shuffle([...basePool, ...dayPool])

  const location = memory?.location_base ?? null
  const prefs = memory?.preferences ?? {}
  const budgets = memory?.budget ?? {}
  const isLowBudget = Object.values(budgets).some(b => b && b.max > 0 && b.max <= 200_000)
  const likesSpa = (Array.isArray(prefs.spa) && prefs.spa.length > 0) ||
    (Array.isArray(memory?.history) && memory.history.some(h => /spa|massage|nail/i.test(h)))

  function localize(text) {
    if (!location) return text
    return text.replace('gần khu vực này', `gần ${location}`).replace('gần đây', `gần ${location}`)
  }
  function isTooLuxury(text) {
    return isLowBudget && /(cao cấp|sang trọng|luxury|resort cao|5 sao)/i.test(text)
  }

  let candidates = pool.filter(p => !isTooLuxury(p.text))
  if (likesSpa && !candidates.some(p => p.category === 'spa')) {
    candidates = [shuffle(SPA_OVERRIDE_PROMPTS)[0], ...candidates]
  }

  const selected = []
  const usedCategories = new Set()
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

// ===== TEST RUNNER =====
let passed = 0
let failed = 0

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`)
    failed++
  }
}

console.log('\n=== TappyAI Suggested Prompts — Test Suite ===\n')

// ─── Case 1: 8h Monday (day=1) → food/café prompts ───
console.log('Case 1: 8h sáng thứ 2 (hour=8, day=1)')
{
  const prompts = getDynamicPrompts(8, 1)
  assert('Returns 4 prompts', prompts.length === 4)
  const hasFood = prompts.some(p => p.category === 'food')
  assert('Has food/café prompt (MORNING pool active)', hasFood, JSON.stringify(prompts.map(p => p.category)))
  const texts = prompts.map(p => p.text).join(' ')
  const hasMorningSignal = /sáng|cà phê|ăn sáng|bánh mì|phở|bún/i.test(texts)
  assert('Prompt text reflects morning context', hasMorningSignal, texts.slice(0, 100))
}

// ─── Case 2: 18h Friday (day=5) → food/entertainment prompts ───
console.log('\nCase 2: 18h thứ 6 (hour=18, day=5)')
{
  const prompts = getDynamicPrompts(18, 5)
  assert('Returns 4 prompts', prompts.length === 4)
  const hasEveningCategory = prompts.some(p => p.category === 'food' || p.category === 'entertainment')
  assert('Has food or entertainment prompt (EVENING pool)', hasEveningCategory, JSON.stringify(prompts.map(p => p.category)))
  const texts = prompts.map(p => p.text).join(' ')
  const hasEveningOrFridaySignal = /tối|bar|nhà hàng|happy hour|thứ 6|cuối tuần|lẩu|nướng/i.test(texts)
  assert('Prompt text reflects evening/Friday context', hasEveningOrFridaySignal, texts.slice(0, 100))
}

// ─── Case 3: 10h Saturday (day=6) → weekend/travel prompts ───
console.log('\nCase 3: 10h sáng thứ 7 (hour=10, day=6)')
{
  const prompts = getDynamicPrompts(10, 6)
  assert('Returns 4 prompts', prompts.length === 4)
  const hasWeekendCategory = prompts.some(p => p.category === 'travel' || p.category === 'entertainment')
  assert('Has travel or entertainment prompt (WEEKEND pool)', hasWeekendCategory, JSON.stringify(prompts.map(p => p.category)))
  const texts = prompts.map(p => p.text).join(' ')
  const hasWeekendSignal = /cuối tuần|khách sạn|staycation|resort|check-in|du lịch|gia đình/i.test(texts)
  assert('Prompt text reflects weekend context', hasWeekendSignal, texts.slice(0, 100))
}

// ─── Case 4: Memory "thích spa" → at least 1 spa prompt ───
console.log('\nCase 4: User có memory "thích spa"')
{
  const spaMemory = {
    location_base: 'Quận Bình Thạnh',
    preferences: { spa: ['thư giãn', 'nail'] },
    budget: {},
    history: ['spa Bình Thạnh', 'nail Q1'],
  }
  // Run 5 times (different shuffles) — every run should include ≥1 spa
  let allHaveSpa = true
  for (let i = 0; i < 5; i++) {
    const prompts = getDynamicPrompts(14, 2, spaMemory) // Wed afternoon
    if (!prompts.some(p => p.category === 'spa')) { allHaveSpa = false; break }
  }
  assert('Always includes ≥1 spa prompt when user likes spa', allHaveSpa)

  // Location injection
  const prompts = getDynamicPrompts(14, 2, spaMemory)
  const hasLocation = prompts.some(p => p.text.includes('Bình Thạnh'))
  assert('Location injected into prompts (gần Bình Thạnh)', hasLocation, prompts.map(p => p.text).join(' | '))
}

// ─── Case 5: Refresh 3 times → not all identical ───
console.log('\nCase 5: Refresh 3 lần liên tiếp → không y chang')
{
  const r1 = getDynamicPrompts(12, 3).map(p => p.text).join('|')
  const r2 = getDynamicPrompts(12, 3).map(p => p.text).join('|')
  const r3 = getDynamicPrompts(12, 3).map(p => p.text).join('|')
  const allSame = r1 === r2 && r2 === r3
  // With a pool of 9+ items shuffled, chance of all-same 3 runs is ~(1/9!)^2 ≈ negligible
  // We test across 10 attempts
  let hadVariation = r1 !== r2 || r2 !== r3
  if (!hadVariation) {
    // Try a few more times to confirm it CAN vary (pool has >4 items)
    for (let i = 0; i < 20; i++) {
      const rx = getDynamicPrompts(12, 3).map(p => p.text).join('|')
      if (rx !== r1) { hadVariation = true; break }
    }
  }
  assert('Prompts vary across refreshes (shuffle working)', hadVariation)

  // Also confirm all 3 have 4 items
  const counts = [r1, r2, r3].map(r => r.split('|').length)
  assert('Each refresh returns exactly 4 prompts', counts.every(c => c === 4))
}

// ─── Summary ───
console.log(`\n${'─'.repeat(48)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed === 0) console.log('🎉 ALL TESTS PASS — ready to deploy\n')
else console.log('⚠️  Some tests failed — check output above\n')
