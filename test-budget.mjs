// node test-budget.mjs

function normalizeVN(str) {
  return str
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')
}

function parseMoneyAmount(numStr, unit) {
  const n = parseFloat(numStr.replace(/\./g, '').replace(/,/g, '.'))
  if (isNaN(n) || n <= 0) return null
  const u = (unit || '').toLowerCase().trim()
  if (u === 'k') return n * 1000
  if (u === 'tr' || u.startsWith('tri') || u.startsWith('trieu')) return n * 1000000
  if (u === 'ngan' || u.startsWith('nghin')) return n * 1000
  if (!u && n > 0 && n <= 9999) return n * 1000
  return n
}

function extractBudget(userMessage) {
  const t = normalizeVN(userMessage.toLowerCase())
  const N = '([\\d][\\d.,]*)'
  const U = '\\s*(k|tr|trieu|ngan|nghin)?'
  const rangeRe = new RegExp('(?:tu\\s+)?' + N + U + '\\s*(?:den|toi|-)\\s*' + N + U)
  let m = t.match(rangeRe)
  if (m) {
    const min = parseMoneyAmount(m[1], m[2] || '')
    const max = parseMoneyAmount(m[3], m[4] || '')
    if (min !== null && max !== null && max >= min && max > 0) return { min, max, type: 'range' }
  }
  const underRe = new RegExp('(?:duoi|khong qua|toi da)\\s+' + N + U)
  m = t.match(underRe)
  if (m) {
    const max = parseMoneyAmount(m[1], m[2] || '')
    if (max !== null && max > 0) return { min: 0, max, type: 'under' }
  }
  const aroundRe = new RegExp('(?:tam|khoang|xap xi)\\s+' + N + U)
  m = t.match(aroundRe)
  if (m) {
    const base = parseMoneyAmount(m[1], m[2] || '')
    if (base !== null && base > 0) return { min: Math.round(base * 0.8), max: Math.round(base * 1.2), type: 'around' }
  }
  return null
}

function extractMinPriceVND(text) {
  const t = normalizeVN(text.toLowerCase())
  const prices = []
  for (const m of t.matchAll(/(\d{1,3}(?:[.,]\d{3})+)\s*(?:d\b|dong|vnd)?/g)) {
    const n = parseFloat(m[1].replace(/\./g, '').replace(/,/g, ''))
    if (!isNaN(n) && n >= 5000) prices.push(n)
  }
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*k\b/g)) {
    const n = parseFloat(m[1]) * 1000
    if (!isNaN(n) && n >= 5000) prices.push(n)
  }
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:trieu|tri\b)/g)) {
    const n = parseFloat(m[1].replace(',', '.')) * 1000000
    if (!isNaN(n) && n > 0) prices.push(n)
  }
  if (prices.length === 0) return null
  return Math.min(...prices)
}

function filterResultsByBudget(items, budget) {
  const tol = 1.1
  const enforceMin = budget.type === 'range' && budget.min > 0
  return items.filter(item => {
    if (typeof item.price_vnd === 'number') {
      const ok = item.price_vnd <= budget.max * tol
      return enforceMin ? ok && item.price_vnd >= budget.min * 0.9 : ok
    }
    const text = (item.title || '') + ' ' + (item.snippet || '')
    const minPrice = extractMinPriceVND(text)
    if (minPrice !== null) {
      const underMax = minPrice <= budget.max * tol
      const aboveMin = enforceMin ? minPrice >= budget.min * 0.9 : true
      return underMax && aboveMin
    }
    return true
  })
}

// ===== TESTS =====
let pass = 0, fail = 0
function assert(label, condition) {
  if (condition) { console.log('  PASS: ' + label); pass++ }
  else { console.log('  FAIL: ' + label); fail++ }
}

console.log('\n=== Test 1: extractBudget ===')

const b1 = extractBudget('tim spa massage duoi 300k')
assert('duoi 300k => {min:0, max:300000, type:under}', b1 && b1.min === 0 && b1.max === 300000 && b1.type === 'under')

const b2 = extractBudget('an toi tam 200k/nguoi')
assert('tam 200k => {min:160000, max:240000, type:around}', b2 && b2.min === 160000 && b2.max === 240000 && b2.type === 'around')

const b3 = extractBudget('tim khach san 500k-800k/dem')
assert('500k-800k => {min:500000, max:800000, type:range}', b3 && b3.min === 500000 && b3.max === 800000 && b3.type === 'range')

const b4 = extractBudget('ca phe khoang 50k')
assert('khoang 50k => {min:40000, max:60000, type:around}', b4 && b4.min === 40000 && b4.max === 60000 && b4.type === 'around')

const b5 = extractBudget('cho toi xem nha hang ngon gan day')
assert('no budget => null', b5 === null)

console.log('\n=== Test 2: filterResultsByBudget ===')

// TC1: spa duoi 300k
const spaResults = [
  { title: 'Spa A', snippet: 'Massage body 250.000d/60 phut, thu gian' },
  { title: 'Spa B', snippet: 'Gia tu 749.000d/nguoi cho combo full' },
  { title: 'Spa C', snippet: 'Dich vu tu 180k, phong sach dep' },
]
const f1 = filterResultsByBudget(spaResults, { min: 0, max: 300000, type: 'under' })
assert('spa duoi 300k: loai Spa B (749k), giu A+C', f1.length === 2 && !f1.find(r => r.title === 'Spa B'))

// TC2: an toi tam 200k/nguoi
const foodResults = [
  { title: 'Nha hang A', snippet: 'Set an 2 nguoi 180.000d, ngon' },
  { title: 'Nha hang B', snippet: 'Buffet 350.000d/nguoi, phong phu' },
]
const f2 = filterResultsByBudget(foodResults, { min: 160000, max: 240000, type: 'around' })
assert('an toi tam 200k: loai B (350k), giu A (180k)', f2.length === 1 && f2[0].title === 'Nha hang A')

// TC3: khach san 500k-800k/dem (range => enforce min)
const hotelResults = [
  { title: 'Khach san A', snippet: 'Gia tu 650.000d/dem, co bua sang' },
  { title: 'Resort B', snippet: 'Phong tu 1.200.000d/dem, sang trong' },
  { title: 'Nha nghi C', snippet: 'Chi 300.000d/dem, phong co ban' },
]
const f3 = filterResultsByBudget(hotelResults, { min: 500000, max: 800000, type: 'range' })
assert('khach san 500k-800k: chi giu A (650k)', f3.length === 1 && f3[0].title === 'Khach san A')

// TC4: ca phe khoang 50k => chi loai >66k, giu ca ca phe co item <= 66k
const cafeResults = [
  { title: 'Ca phe A', snippet: 'Ca phe den 25k, bac xiu 30k, tra sua 45k' },
  { title: 'Ca phe B', snippet: 'Espresso 55k, cappuccino 65k, latte 70k' },
  { title: 'Ca phe C', snippet: 'Ly tom 120k, set 2 nguoi 200k' },
]
const f4 = filterResultsByBudget(cafeResults, { min: 40000, max: 60000, type: 'around' })
assert('ca phe khoang 50k: giu A (min 25k) va B (min 55k), loai C (min 120k)', f4.length === 2 && !f4.find(r => r.title === 'Ca phe C'))

// TC5: khong co budget => truyen {min:0,max:Infinity} => giu tat ca
const f5 = filterResultsByBudget(spaResults, { min: 0, max: Infinity, type: 'under' })
assert('khong budget => giu tat ca ' + spaResults.length + ' results', f5.length === spaResults.length)

console.log('\n=== KET QUA: ' + pass + ' pass / ' + (pass + fail) + ' total ===')
if (fail > 0) process.exit(1)
