// C3-B.8 — measurement-only money-claim detector. NOT production code.
//
// Deliberately NOT reusing budget.ts's private parsers: they target USER text
// and contain `if (!unit && n <= 9999) return n * 1000`, which would read
// "iPhone 15" as ₫15,000. Here a currency unit is MANDATORY — a bare number is
// never a money claim. That single rule kills most false positives
// (model numbers, GB, ratings, battery hours, dates, 5G).

export function normalizeVN(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
}

/** Strip things that contain digits but are never a price claim. */
function scrub(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')      // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')       // markdown links (label + url)
    .replace(/https?:\/\/\S+/g, ' ')            // bare urls
    .replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/g, ' ')
    .replace(/\[FOLLOWUPS\][\s\S]*?\[\/FOLLOWUPS\]/g, ' ')
    .replace(/\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/g, ' ')
}

/** "7.790.000" → 7790000 ; "7.5"/"7,5" with a scale unit → 7.5 */
function toNumber(raw, hasScaleUnit) {
  const groups = raw.match(/[.,]/g) || []
  if (groups.length >= 2) return parseFloat(raw.replace(/[.,]/g, ''))          // 7.790.000
  if (groups.length === 1) {
    const [, frac] = raw.split(/[.,]/)
    if (frac.length === 3 && !hasScaleUnit) return parseFloat(raw.replace(/[.,]/g, '')) // 790.000
    return parseFloat(raw.replace(',', '.'))                                   // 7,5 / 7.5
  }
  return parseFloat(raw)
}

// Unit MUST be present. `M` only counts when glued to the number (11.8M) —
// which is why "WH-1000XM5" (M preceded by X, not a digit) never matches.
// JS \b is ASCII-only: in "màu" the "à" counts as a NON-word char, so "M\b"
// matched "2 màu" as 2 million. Every unit boundary must therefore be a
// Unicode-aware lookahead, not \b. Found by the adversarial tests below.
const UNIT_ALT = 'triệu|trieu|tr|million|M|k|nghìn|nghin|ngàn|ngan|₫|đ|VNĐ|VND|USD|dollars?'
const UNIT = `(${UNIT_ALT})(?![\\p{L}\\d])`
const NUM = '(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d{1,2})?)'
// range: "7–8 triệu", "11.8–14.7M", "7-8M VND"
const RANGE_RE = new RegExp(`${NUM}\\s*[–—-]\\s*${NUM}\\s*${UNIT}`, 'giu')
// "$699" — the $ IS the unit, so no trailing unit is required in that form.
const SINGLE_RE = new RegExp(`\\$\\s*${NUM}|${NUM}\\s*${UNIT}`, 'giu')

const SCALE = { 'triệu': 1e6, trieu: 1e6, tr: 1e6, million: 1e6, m: 1e6, k: 1e3, 'nghìn': 1e3, nghin: 1e3, 'ngàn': 1e3, ngan: 1e3 }
const FX_USD_VND = null   // deliberately NOT converted — see report

function unitScale(u) {
  const k = u.toLowerCase().replace(/\b$/, '').trim()
  return SCALE[k] ?? 1
}
// NB: /usd|dollar|$/ would match the EMPTY string at end-of-input and return
// true for every unit. The dollar sign must be escaped inside a character class.
const isUSD = (u) => /usd|dollar|[$]/i.test(u)

/** All money claims in a reply, normalized to VND where the unit is VND-based. */
export function extractMoneyClaims(text) {
  const t = scrub(text)
  const out = []
  const seen = new Set()
  for (const m of t.matchAll(RANGE_RE)) {
    const unit = m[3]
    const scale = unitScale(unit)
    const lo = toNumber(m[1], scale > 1) * scale
    const hi = toNumber(m[2], scale > 1) * scale
    const key = `${lo}-${hi}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ raw: m[0].trim(), kind: 'range', lo, hi, currency: isUSD(unit) ? 'USD' : 'VND', index: m.index })
  }
  for (const m of t.matchAll(SINGLE_RE)) {
    // skip anything already consumed by a range
    if (out.some(c => c.kind === 'range' && m.index >= c.index && m.index < c.index + c.raw.length)) continue
    // alternation: [1] = "$NNN" form, [2]+[3] = "NNN unit" form
    const isDollarForm = m[1] !== undefined
    const numRaw = isDollarForm ? m[1] : m[2]
    const unit = isDollarForm ? '$' : m[3]
    const scale = unitScale(unit)
    const v = toNumber(numRaw, scale > 1) * scale
    const key = `${v}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ raw: m[0].trim(), kind: 'single', lo: v, hi: v, currency: isUSD(unit) ? 'USD' : 'VND', index: m.index })
  }
  return out.sort((a, b) => a.index - b.index)
}

// ── STEP 6 adversarial test suite ───────────────────────────────────────────
const T = []
const t = (name, text, expect) => T.push({ name, text, expect })

// must DETECT (VI)
t('vi triệu int', 'khoảng 7 triệu', [7e6])
t('vi triệu comma-dec', 'khoảng 7,5 triệu', [7.5e6])
t('vi triệu dot-dec', 'khoảng 7.5 triệu', [7.5e6])
t('vi range triệu', 'từ 7–8 triệu', [[7e6, 8e6]])
t('vi range M', 'tầm 7-8M', [[7e6, 8e6]])
t('vi M dec', 'giá 7,5M', [7.5e6])
t('vi m lower', 'giá 7m', [7e6])
t('vi plain dong', 'giá 7000000đ', [7e6])
t('vi dotted dong', 'giá 7.000.000₫', [7e6])
t('vi million vnd', '7 million VND', [7e6])
t('vi k', 'chỉ 500k', [5e5])
// must DETECT (EN)
t('en dollar sign', 'about $699', [699])
t('en usd suffix', 'about 699 USD', [699])
t('en dollars word', 'about 699 dollars', [699])
t('en range M VND', '11.8–14.7M VND', [[11.8e6, 14.7e6]])
t('en 7.5M VND', '7.5M VND', [7.5e6])
t('en grounded exact', 'Sony WH-1000XM5 khoảng 7.790.000₫', [7.79e6])
// must NOT detect (adversarial false positives)
t('model number', 'iPhone 15 vs Galaxy S24', [])
t('sony model code', 'Sony WH-1000XM5 và Bose QC Ultra', [])
t('storage', 'bản 128GB và 256GB', [])
t('rating', 'đánh giá 4.8/5 sao', [])
t('battery hours', 'pin 40 giờ, sạc 3 tiếng', [])
t('year', 'ra mắt năm 2026', [])
t('percent', 'giảm 50%', [])
t('5g', 'hỗ trợ 5G và Wi-Fi 6', [])
t('markdown link with digits', 'xem [Shopee](https://shopee.vn/search?keyword=abc-i.123.456)', [])
t('cta block', 'text [CTA_BUTTONS]{"buttons":[{"url":"https://x.vn/?q=1.000.000"}]}[/CTA_BUTTONS]', [])
t('bare number no unit', 'có 3 lựa chọn và 2 màu', [])
t('iphone 15 pro max 256', 'iPhone 15 Pro Max 256GB', [])

let pass = 0, fail = 0
for (const c of T) {
  const got = extractMoneyClaims(c.text)
  const gotVals = got.map(x => x.kind === 'range' ? [x.lo, x.hi] : x.lo)
  const ok = JSON.stringify(gotVals) === JSON.stringify(c.expect)
  ok ? pass++ : fail++
  if (!ok) console.log(`FAIL  ${c.name.padEnd(26)} "${c.text.slice(0, 46)}"\n      expected ${JSON.stringify(c.expect)}\n      got      ${JSON.stringify(gotVals)}  raws=${JSON.stringify(got.map(g => g.raw))}`)
}
console.log(`\ndetector unit tests: ${pass} passed, ${fail} failed  (of ${T.length})`)
