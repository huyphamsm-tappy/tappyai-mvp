// ── THE DETERMINISTIC CONSULT ROUTER (owner 2026-09-29) ─────────────────────────────────────────
//
// "The ASK turn must be produced by CODE": area rules + slot rules + question templates decide the
// turn with 0 LLM and 0 search. The LLM brain (consultBrain.runConsultBrain) is called ONLY when this
// router says `confidence: 'unsure'` — no area matched and the text is not clearly small talk, or two
// areas collide with nothing that orders them.
//
// Everything is read on two views of the same text, index-aligned:
//   lo — NFC, lowercase, WITH diacritics. Used where folding would merge different words:
//        mua/mùa/mưa, son/sơn, đói/đổi/đôi, thèm/thêm, lẩu/lâu, nhậu/nhau, ốp/óp, quà/quá.
//   f  — the same text folded (no diacritics, đ→d), same length, so `\b` works (ASCII) and a match
//        index slices the original words back out of `lo`.
// 🚨 `\b` after a Vietnamese vowel never matches — diacritic patterns use (?<![\p{L}\p{N}])…(?![\p{L}\p{N}]).

import { normalizeVN } from '../intent'
import { maskStreetNames } from '../streetNames'
import { SPECIFIC_DATE } from './searchNow'
import { wasAskReply, type AskQuestion, type ConsultDecision, type ConsultDomain, type ConsultTurn } from './consultBrain'

export type RouteConfidence = 'rule' | 'unsure'
export interface RouteCtx { hasGps: boolean; lang: string }
export interface RouteResult { decision: ConsultDecision; confidence: RouteConfidence }

// ── Text views ─────────────────────────────────────────────────────────────────────────────────

export interface Txt { raw: string; lo: string; f: string; /** `f` with street / dish names that contain a city blanked (streetNames.ts) — city matching only */ fc: string }

/** Folds one string char-by-char so `f` stays index-aligned with `lo`. */
export function prep(raw: string): Txt {
  const lo = raw.normalize('NFC').toLowerCase()
  let f = ''
  for (const ch of lo) {
    let d = ch === 'đ' ? 'd' : ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (d.length !== ch.length) d = (d + '  ').slice(0, ch.length)
    f += d
  }
  return { raw, lo, f, fc: maskStreetNames(f) }
}

const W = (alts: string) => new RegExp(`\\b(?:${alts})\\b`)
/** Diacritic-exact word test on `lo` (letter-bounded). */
const N = (alts: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, 'u')

function textOf(c: unknown): string {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map(p => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join(' ')
  return ''
}
const stripMarkers = (s: string) => s.replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/g, ' ')

// ── AREA lexicon ───────────────────────────────────────────────────────────────────────────────
// w: 3 = names the area on its own · 2 = usually this area, yields to a 3 · 1 = a hint only.

interface AreaRule { d: ConsultDomain; w: number; re: RegExp; on: 'f' | 'fc' | 'lo'; id?: string }

const CITY: Array<[string, string]> = [
  ['sai gon|saigon|sg|tp\\.? ?hcm|hcm|tphcm|tp\\.? ?ho chi minh|ho chi minh', 'TP.HCM'], ['ha noi|hanoi', 'Hà Nội'], ['da nang|danang', 'Đà Nẵng'],
  ['da lat|dalat', 'Đà Lạt'], ['nha trang', 'Nha Trang'], ['vung tau', 'Vũng Tàu'], ['phu quoc', 'Phú Quốc'], ['hoi an', 'Hội An'], ['hue', 'Huế'],
  ['sa ?pa', 'Sapa'], ['ha giang', 'Hà Giang'], ['ha long', 'Hạ Long'], ['quy nhon', 'Quy Nhơn'], ['mui ne', 'Mũi Né'], ['phan thiet', 'Phan Thiết'],
  ['con dao', 'Côn Đảo'], ['can tho', 'Cần Thơ'], ['ninh binh', 'Ninh Bình'], ['my khe', 'Mỹ Khê'], ['moc chau', 'Mộc Châu'], ['tam dao', 'Tam Đảo'],
  ['tay ninh', 'Tây Ninh'], ['cat ba', 'Cát Bà'], ['phu yen', 'Phú Yên'], ['buon ma thuot', 'Buôn Ma Thuột'], ['ha tien', 'Hà Tiên'], ['ben tre', 'Bến Tre'],
  ['cu chi', 'Củ Chi'], ['long hai', 'Long Hải'], ['ho tram', 'Hồ Tràm'], ['binh ba', 'Bình Ba'], ['ly son', 'Lý Sơn'], ['mai chau', 'Mai Châu'],
  ['cao bang', 'Cao Bằng'], ['phong nha', 'Phong Nha'], ['quang binh', 'Quảng Bình'], ['bangkok', 'Bangkok'], ['singapore', 'Singapore'], ['seoul', 'Seoul'],
  ['tokyo', 'Tokyo'], ['bali', 'Bali'],
]
const CITY_ALT = CITY.map(c => c[0]).join('|')

const FOOD_DISH_ALT = 'quan an|cho an|di an|an uong|nha hang|an vat|quan nhau|buffet|dat ban|giao do an|do an nhanh|dac san|an chay|quan chay|do chay|mon chay|an khuya|an gi|an sang|an trua|an toi|an dem|bua (?:sang|trua|toi)|quan com|com (?:tam|ga|nieu|van phong|trua|binh dan|chay)|bun (?:bo|cha|rieu|dau|thit nuong|mam|ca)|bun|banh mi|banh xeo|banh cuon|banh canh|hu tieu|mi quang|lau (?:thai|nam|bo|ga|de|mam|hai san|kim chi|nuong)|nuong|do nuong|bbq|sushi|sashimi|ramen|pizza|burger|ga ran|hai san|dimsum|dim sum|quan oc|an oc|oc|xoi|mon (?:nhat|han|thai|viet|au|y|hoa|trung|an)|nha hang (?:nhat|han|thai|au|y)|steak|bo bit tet|restaurant|food|hungry|dinner|lunch|breakfast|eat|bung doi|doi bung|doi meo|dang doi|(?:quan|an|to|tiem|hang) pho|pho (?:bo|ga|bac|nam|cuon|xao|ngon|tai|chin|ha noi)'

const AREA_RULES: AreaRule[] = [
  // FOOD
  { d: 'food', w: 3, on: 'f', re: W(FOOD_DISH_ALT) },
  { d: 'food', w: 3, on: 'lo', re: N('đói|thèm|lẩu|nhậu|phở|bún|cơm|cháo|xôi|chè|mì|ốc|món ăn') },
  { d: 'food', w: 2, on: 'f', re: W('cafe|ca phe|cf|coffee|tra sua|tra chanh|sinh to|nuoc ep|tiem banh') },
  { d: 'food', w: 1, on: 'lo', re: N('ăn|uống') },
  // SHOPPING
  { d: 'shopping', w: 4, on: 'lo', id: 'mua', re: N('mua(?! vé)(?! ve)|sắm|mua sắm|shopping') },
  { d: 'shopping', w: 3, on: 'lo', re: N('ốp|son|quà|váy|giày|dép|áo|mỹ phẩm') },
  { d: 'shopping', w: 3, on: 'f', re: W('mua sam|sam do|sam sua|dien thoai|dt|smartphone|iphone|ipad|samsung|xiaomi|oppo|pixel|laptop|macbook|may tinh|pc|tai nghe|airpods|loa (?:bluetooth|mini|keo)|ban phim|chuot (?:may tinh|khong day|gaming)|man hinh|dong ho|smartwatch|apple watch|may anh|op lung|op (?:uag|iphone|ip|samsung|dien thoai)|uag|cuong luc|sac du phong|cu sac|thoi trang|quan ao|ao khoac|ao thun|ao so mi|tui xach|balo|vi da|my pham|skincare|kem chong nang|kem duong|kem nen|sua rua mat|serum|toner|nuoc hoa|tay trang|gia dung|noi chien|noi com|may loc|may hut|robot hut bui|may giat|tu lanh|dieu hoa|may lanh|may pha|do cu|hang cu|may cu|2hand|second hand|like new|qua tang|tang qua|mon qua|so gia|deal|giam gia|voucher|ma giam|flash sale|shopee|lazada|tiki|tiktok shop|gift|buy|phu kien') },
  // TRAVEL
  { d: 'travel', w: 3, on: 'f', re: W('du lich|dl|lich trinh|khach san|homestay|resort|villa|hostel|ve may bay|may bay|chuyen bay|ve xe|xe khach|xe giuong nam|limousine|ve tau|tau hoa|tau lua|cam trai|camping|glamping|da ngoai|di trong ngay|phuot|honeymoon|trang mat|book phong|dat phong|nghi duong|tour|tron khoi thanh pho|xa thanh pho|di choi xa|flight|hotel|trip|travel') },
  { d: 'travel', w: 3, on: 'fc', id: 'go-city', re: new RegExp(`\\b(?:di|ve|ra|vao|toi|den)\\s+(?:${CITY_ALT})\\b|\\b(?:${CITY_ALT})\\s+\\d+\\s*(?:ngay|n\\d)|\\b\\d+\\s*ngay\\s*\\d+\\s*dem\\b`) },
  { d: 'travel', w: 3, on: 'fc', id: 'getaway', re: new RegExp(`\\b(?:di dau choi|di choi dau|di dau)\\b.*\\b(?:gan|quanh)\\s+(?:${CITY_ALT}|thanh pho)\\b|\\b(?:gan|quanh)\\s+(?:${CITY_ALT})\\b.*\\b(?:di dau|di choi)\\b|\\b(?:vai hom|may hom|ngay nghi|dip le|nghi le)\\b.*\\bdi (?:dau|choi)\\b|\\bnen di dau\\b`) },
  { d: 'travel', w: 1, on: 'fc', re: W(CITY_ALT) },
  // ENTERTAINMENT
  { d: 'entertainment', w: 3, on: 'f', re: W('karaoke|di hat|quan hat|bida|bi a|billiard|bowling|rap phim|rap chieu|xem phim|(?<!ban )phim|cgv|cinema|concert|live ?show|nhac song|live music|acoustic|bar|pub|beer club|rooftop|club|escape room|phong thoat hiem|game center|trung tam tro choi|board ?game|ma soi|san choi|khu vui choi|khu tro choi|cong vien|thao cam vien|so thu|pho di bo|trien lam|bao tang|thuy cung|aquarium|truot bang|paintball|trampoline|workshop|lam gi (?:cho|toi nay|bay gio|cuoi tuan)|toi nay lam gi|chan qua|buon qua|hen ho|di choi nhom|choi nhom|dan (?:con|be|tre|nguoi yeu|ny) di choi|di choi voi (?:con|be|nguoi yeu|ny)') },
  { d: 'entertainment', w: 3, on: 'lo', re: N('hát|quẩy') },
  { d: 'entertainment', w: 3, on: 'f', id: 'tonight', re: /\b(?:toi nay|dem nay|chieu nay)\b.*\b(?:di choi|choi gi|lam gi|di dau)\b/ },
  { d: 'entertainment', w: 2, on: 'f', re: W('di choi|choi gi|giai tri|date|nightlife') },
  // SPA
  { d: 'spa', w: 3, on: 'f', re: W('spa|massage|mat xa|xong hoi|sauna|tam hoi|goi dau|duong sinh|nail|lam mong|son mong|son gel|ve mong|dap bot|cat toc|uon toc|nhuom toc|duoi toc|lam toc|hot toc|toc nam|toc nu|barber|salon|hair|cham soc da|lam dep|tri mun|nan mun|lay mun|facial|waxing|wax long|triet long|noi mi|uon mi|phun may|phun moi|xam may|tam trang|yoga|gym|pilates|phong tap|thu gian|bam huyet|giac hoi|cao gio|foot massage|trang diem|makeup|tham my vien|dau vai|dau lung|moi vai|nhuc moi|met qua|met moi') },
]

interface AreaHit { d: ConsultDomain; w: number; at: number; id?: string }

function areaHits(t: Txt): AreaHit[] {
  const best = new Map<ConsultDomain, AreaHit>()
  for (const r of AREA_RULES) {
    const src = r.on === 'f' ? t.f : r.on === 'fc' ? t.fc : t.lo
    const m = r.re.exec(src)
    if (!m) continue
    const hit: AreaHit = { d: r.d, w: r.w, at: m.index, id: r.id }
    const prev = best.get(r.d)
    if (!prev || hit.w > prev.w || (hit.w === prev.w && hit.at < prev.at)) best.set(r.d, hit)
  }
  return [...best.values()]
}

const CONNECTOR = /\b(?:roi|xong|sau do|va|truoc khi|luon|then|and)\b|\+|,|->/
// Fixed tie-break when two areas are equally named and nothing orders them.
const TIE: ConsultDomain[] = ['shopping', 'spa', 'entertainment', 'travel', 'food']

/** The areas of one text, in the user's order; `conflict` when two areas collide unordered. */
export function detectAreas(raw: string): { domains: ConsultDomain[]; conflict: boolean; hits: AreaHit[] } {
  const t = prep(raw)
  const hits = areaHits(t)
  if (!hits.length) return { domains: [], conflict: false, hits }
  const top = Math.max(...hits.map(h => h.w))
  // Buying something is shopping, whatever it is for ("mua đồ ăn vặt", "áo khoác đi Đà Lạt mua ở đâu").
  const mua = hits.find(h => h.id === 'mua')
  const strong = hits.filter(h => h.w >= 2).sort((a, b) => a.at - b.at)
  if (strong.length >= 2) {
    const [a, b] = strong
    const between = t.f.slice(a.at, b.at)
    if (a.w >= 3 && b.w >= 3 && CONNECTOR.test(between) && !mua) return { domains: strong.filter(h => h.w >= 3).map(h => h.d), conflict: false, hits }
  }
  if (mua) return { domains: ['shopping'], conflict: false, hits }
  const tops = hits.filter(h => h.w === top)
  if (tops.length === 1) return { domains: [tops[0].d], conflict: false, hits }
  // A place-specific activity beats a generic one: travel "go to <city>" vs food "đặc sản <city>" is
  // settled by the food noun; ent vs food: "board game cafe" (cafe is w2, so it never ties here).
  const order = tops.map(h => h.d).sort((x, y) => TIE.indexOf(x) - TIE.indexOf(y))
  if (order.includes('food') && order.includes('travel') && !hits.some(h => h.id === 'go-city' || h.id === 'getaway')) return { domains: ['food'], conflict: false, hits }
  if (order.includes('spa') && order.includes('entertainment') && top === 3) return { domains: ['spa'], conflict: false, hits }
  return { domains: [order[0]], conflict: true, hits }
}

// ── Knowledge / chat ───────────────────────────────────────────────────────────────────────────

const KNOWLEDGE = /\b(?:an toan (?:khong|ko)|co (?:mua|lanh|nong|ret|dong|dep|dat|tot) (?:khong|ko)|mua nao (?:dep|dep nhat|nen di|di)|thang nao (?:dep|nen di)|can chuan bi gi|chuan bi nhung gi|can (?:xem|luu y|biet|kiem tra|chu y) (?:gi|nhung gi)|can may ngay|mat may ngay|la gi|co tot (?:khong|ko)|co hai (?:khong|ko)|dac san\b.*\b(?:an gi|co gi|la gi|mua gi)|co nen\b.*\b(?:khong|ko)|is it safe|when is the best time|what to pack)\b/
const GREETING = /^(?:xin chao|chao|chao ban|chao tappy|hi|hello|hey|alo|a lo|yo|cam on|cam on ban|thanks|thank you|thank|ok|oke|okay|okie|uh|u|um|vang|da|tuyet|hay qua|good|nice|bye|tam biet)(?:\s+(?:nhe|nha|nhieu|ban|tappy|a|ah|nhe ban|you|so much|lam|qua))*[\s!.?~]*$/
const OUT_OF_SCOPE = /\b(?:viet code|lap trinh|code (?:python|java|js)|debug|giai (?:bai|toan|phuong trinh)|bai tap|dich (?:sang|giup|cau)|translate|luat|phap ly|hop dong|thue|chung khoan|co phieu|bitcoin|crypto|chan doan|benh gi|thuoc gi|viet (?:email|van|thu|bai))\b/

// ── Slots ──────────────────────────────────────────────────────────────────────────────────────

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
function grab(t: Txt, re: RegExp, group = 0): string | null {
  const m = re.exec(t.f)
  if (!m) return null
  const g = m[group] ?? m[0]
  const at = m.index + (group ? m[0].indexOf(g) : 0)
  return t.lo.slice(at, at + g.length).trim()
}
function label<T extends string>(t: Txt, table: Array<[RegExp, T]>): T | null {
  for (const [re, v] of table) if (re.test(t.f)) return v
  return null
}

const MONEY = /(?:\b(?:duoi|tam|khoang|tren|toi da|tu|max|under|around)\s+)?\b\d+(?:[.,]\d+)?\s*(?:-\s*\d+(?:[.,]\d+)?\s*)?(?:k|tr|trieu|cu|nghin|ngan|m|million|vnd)\b(?:\s*\/\s*(?:nguoi|ng|dem|ve|dau nguoi|person))?/
const BUDGET_WORDS: Array<[RegExp, string]> = [
  [W('binh dan|gia re|re re|re thoi|sinh vien|hat de|cheap'), 'bình dân'],
  [W('cao cap|sang trong|sang chanh|xin so|fine dining|luxury'), 'cao cấp'],
]
export function budgetOf(t: Txt): string | null {
  const m = MONEY.exec(t.f)
  if (m) {
    const src = t.lo.slice(m.index, m.index + m[0].length).trim()
    // "củ" (slang for a million) folds to "cu" — so does "cũ" (used): "iphone 15 cũ" is not money.
    // Folded "cu" counts as money only when written "củ", or qualified ("tầm 1 cu") and not "cũ".
    const unitCu = /\d\s*cu\b/.test(m[0])
    const qualified = /^(?:duoi|tam|khoang|tren|toi da|tu|max|under|around)\s/.test(m[0])
    if (!unitCu || /củ/.test(src) || (qualified && !/cũ|cụ/.test(src))) return src
  }
  return label(t, BUDGET_WORDS)
}

const NUM_WORD: Record<string, string> = { mot: '1', hai: '2', ba: '3', bon: '4', nam: '5', sau: '6', bay: '7', tam: '8', chin: '9', muoi: '10' }
export function partyOf(t: Txt): string | null {
  // A digit may touch its unit ("4ng"); a number WORD needs a space ("bằng" folds to "bang" = "ba"+"ng").
  const UNIT = '(?:nguoi|dua|dua ban|ban|khach|pax|ng|thanh vien|dua nho|people)'
  const m = new RegExp(`\\b(\\d{1,2})\\s*${UNIT}\\b`).exec(t.f) ?? new RegExp(`\\b(mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\\s+${UNIT}\\b`).exec(t.f) ?? /\bnhom\s+(\d{1,2})\b/.exec(t.f)
  if (m) return `${NUM_WORD[m[1]] ?? m[1]} người`
  if (W('mot minh|1 minh|di le|solo|alone').test(t.f)) return '1 người'
  if (W('nguoi yeu|ny|ban gai|ban trai|vo chong|voi vo|voi chong|couple|cap doi|hen ho|voi sep|voi me|voi bo|2 dua|date').test(t.f)) return '2 người'
  if (W('dan con|voi con|cho con|con \\d+ tuoi|be \\d+ tuoi|tui nho|con nit|tre con|kids?').test(t.f)) return 'gia đình có trẻ nhỏ'
  return null
}

const DISTRICTS: Array<[string, string]> = [
  ['binh thanh', 'Bình Thạnh'], ['phu nhuan', 'Phú Nhuận'], ['go vap', 'Gò Vấp'], ['tan binh', 'Tân Bình'], ['tan phu', 'Tân Phú'], ['binh tan', 'Bình Tân'],
  ['thu duc', 'Thủ Đức'], ['nha be', 'Nhà Bè'], ['hoan kiem', 'Hoàn Kiếm'], ['ba dinh', 'Ba Đình'], ['dong da', 'Đống Đa'], ['cau giay', 'Cầu Giấy'], ['tay ho', 'Tây Hồ'],
  ['hai ba trung', 'Hai Bà Trưng'], ['hang xanh', 'Hàng Xanh'], ['bitexco', 'Bitexco'], ['ben thanh', 'Bến Thành'], ['thao dien', 'Thảo Điền'], ['landmark', 'Landmark 81'],
  ['phu my hung', 'Phú Mỹ Hưng'], ['bui vien', 'Bùi Viện'], ['nguyen hue', 'Nguyễn Huệ'],
]
/** A place the user named (district, landmark, city) — or 'gần bạn' for "gần đây". */
export function localAreaOf(t: Txt): string | null {
  const q = /\b(?:quan|q\.?|district)\s?(\d{1,2})\b/.exec(t.f)
  if (q) return `quận ${q[1]}`
  for (const [k, v] of DISTRICTS) if (W(k).test(t.f)) return v
  for (const [k, v] of CITY) if (W(k).test(t.fc)) return v
  if (W('gan day|gan nha|quanh day|gan toi|gan minh|gan em|gan cong ty|nearby|near me|around here').test(t.f)) return 'gần bạn'
  return null
}

const TIME_RE = /\b(?:toi nay|dem nay|trua nay|chieu nay|sang nay|sang mai|trua mai|chieu mai|toi mai|ngay mai|hom nay|bay gio|luc nay|cuoi tuan|tuan sau|thu (?:[2-7]|hai|ba|tu|nam|sau|bay)|chu nhat|\d{1,2}\s?h(?:\d{2})?|\d{1,2} gio|an khuya|khuya|toi thu \d|tonight|tomorrow|weekend|now)\b/
export function timeOf(t: Txt): string | null { return grab(t, TIME_RE) }

const VIBES: Array<[RegExp, string]> = [
  [W('yen tinh|it nguoi|khong on|rieng tu|quiet'), 'yên tĩnh'],
  [W('soi dong|quay|nao nhiet|vui nhon|lively'), 'sôi động'],
  [W('chill|nhe nhang|thu gian|relax'), 'chill'],
  [W('lang man|romantic|hen ho'), 'lãng mạn'],
  [W('view (?:dep|song|thanh pho|bien)|view'), 'view đẹp'],
  [W('nhac song|acoustic|live music|live'), 'nhạc sống'],
  [W('san vuon|ngoai troi|outdoor'), 'sân vườn'],
  [W('phong rieng|phong vip|vip'), 'phòng riêng'],
  [W('sang trong|cao cap|fancy'), 'sang trọng'],
]
export function vibeOf(t: Txt): string | null { return label(t, VIBES) }

// FOOD ──────────────────────────────────────────────────────────────────────────────────────────

interface Dish { label: string; re: RegExp; place?: boolean; variant?: { known: RegExp; q: string; qEn: string; opts: string[]; optsEn: string[] } }
const DISHES: Dish[] = [
  { label: 'phở', re: /\bpho\b(?!\s+di\s+bo)/, variant: { known: W('pho (?:bac|nam|ha noi|sai gon)|bac|nam'), q: 'Phở Bắc hay Phở Nam?', qEn: 'Northern or Southern pho?', opts: ['Phở Bắc', 'Phở Nam', 'Không quan trọng'], optsEn: ['Northern', 'Southern', "Doesn't matter"] } },
  { label: 'lẩu', re: /\blau\b(?!\s+(?:khong|ko|chua|roi|nua|qua))/, variant: { known: W('lau (?:thai|nam|bo|ga|de|mam|hai san|kim chi|nuong|cua|ca)'), q: 'Lẩu gì?', qEn: 'Which hotpot?', opts: ['Lẩu Thái', 'Lẩu nấm', 'Lẩu hải sản', 'Lẩu bò'], optsEn: ['Thai', 'Mushroom', 'Seafood', 'Beef'] } },
  { label: 'buffet', re: W('buffet'), place: true, variant: { known: W('buffet (?:nuong|lau|hai san|chay|sushi|nhat|han)|nuong|lau|hai san'), q: 'Buffet gì?', qEn: 'What kind of buffet?', opts: ['Nướng', 'Lẩu', 'Hải sản', 'Chưa biết'], optsEn: ['BBQ', 'Hotpot', 'Seafood', 'Not sure'] } },
  { label: 'đồ nướng', re: W('nuong|do nuong|bbq'), variant: { known: W('(?:nuong|bbq) (?:han|nhat|viet)|han quoc|nhat|buffet'), q: 'Nướng kiểu nào?', qEn: 'Which BBQ style?', opts: ['Nướng Hàn', 'Nướng Nhật', 'Nướng Việt', 'Buffet nướng'], optsEn: ['Korean', 'Japanese', 'Vietnamese', 'BBQ buffet'] } },
  { label: 'quán nhậu', re: W('nhau|quan nhau|di nhau'), place: true, variant: { known: W('binh dan|hai san|lau|nuong|bia craft|bia tuoi|oc'), q: 'Nhậu kiểu nào?', qEn: 'What kind of drinking spot?', opts: ['Bình dân', 'Hải sản', 'Lẩu nướng', 'Bia craft'], optsEn: ['Casual', 'Seafood', 'Hotpot & BBQ', 'Craft beer'] } },
  { label: 'cà phê', re: W('cafe|ca phe|cf|coffee'), place: true, variant: { known: W('yen tinh|view|san vuon|lam viec|chill|rooftop|acoustic'), q: 'Kiểu quán nào?', qEn: 'What kind of café?', opts: ['Yên tĩnh', 'View đẹp', 'Sân vườn', 'Ngồi làm việc'], optsEn: ['Quiet', 'Nice view', 'Garden', 'Work-friendly'] } },
  { label: 'ăn vặt', re: W('an vat|do an vat'), variant: { known: W('banh trang|oc|xien|trang mieng|che'), q: 'Ăn vặt món gì?', qEn: 'Which snacks?', opts: ['Bánh tráng', 'Ốc', 'Xiên que', 'Chưa biết'], optsEn: ['Rice paper', 'Snails', 'Skewers', 'Not sure'] } },
  { label: 'trà sữa', re: W('tra sua'), place: true }, { label: 'bún bò', re: W('bun bo') }, { label: 'bún chả', re: W('bun cha') },
  { label: 'bún riêu', re: W('bun rieu') }, { label: 'bánh mì', re: W('banh mi') }, { label: 'cơm tấm', re: W('com tam') }, { label: 'hủ tiếu', re: W('hu tieu') },
  { label: 'mì Quảng', re: W('mi quang') }, { label: 'bánh xèo', re: W('banh xeo') }, { label: 'ốc', re: W('oc|quan oc') }, { label: 'hải sản', re: W('hai san') },
  { label: 'sushi', re: W('sushi|sashimi') }, { label: 'ramen', re: W('ramen') }, { label: 'pizza', re: W('pizza') }, { label: 'gà rán', re: W('ga ran') },
  { label: 'dimsum', re: W('dim ?sum') }, { label: 'đồ chay', re: W('an chay|quan chay|do chay|mon chay') }, { label: 'đặc sản', re: W('dac san') },
  { label: 'món Nhật', re: W('mon nhat|do nhat|quan nhat|nha hang nhat|nhat ban|japanese') }, { label: 'món Hàn', re: W('mon han|do han|han quoc|korean') },
  { label: 'món Thái', re: W('mon thai|do thai|thai lan|thai food') }, { label: 'món Âu', re: W('mon au|do tay|steak|bo bit tet|mon y|pasta|western') },
  { label: 'món Hoa', re: W('mon hoa|mon trung|dim sum') }, { label: 'món Việt', re: W('mon viet|com nha|com van phong|com binh dan') },
  { label: 'bún', re: W('bun') }, { label: 'cơm', re: W('com') }, { label: 'bánh', re: /\bbanh (?:canh|cuon|trang|bao|ngot|flan)\b/ },
]
const NFC_CUISINE: Array<[RegExp, string]> = [[N('nhật'), 'món Nhật'], [N('hàn'), 'món Hàn'], [N('thái'), 'món Thái'], [N('việt'), 'món Việt']]
function dishOf(t: Txt): Dish | null {
  // Diacritic-exact dish words first (lẩu ≠ lâu, nhậu ≠ nhau, phở ≠ phố).
  if (N('lẩu').test(t.lo)) return DISHES.find(d => d.label === 'lẩu')!
  if (N('nhậu').test(t.lo)) return DISHES.find(d => d.label === 'quán nhậu')!
  if (N('phở').test(t.lo)) return DISHES.find(d => d.label === 'phở')!
  for (const d of DISHES) {
    if (d.label === 'lẩu' && !/\blau (?:thai|nam|bo|ga|de|mam|hai san|kim chi|nuong)\b/.test(t.f)) continue
    if (d.label === 'quán nhậu' && !/\b(?:quan|di) nhau\b/.test(t.f)) continue
    if (d.label === 'phở' && !/\b(?:quan|an|to|tiem|hang) pho\b|\bpho (?:bo|ga|bac|nam|cuon|xao|ngon|tai|chin|ha noi)\b/.test(t.f)) continue
    if (d.re.test(t.f)) return d
  }
  for (const [re, l] of NFC_CUISINE) if (re.test(t.lo)) return { label: l, re }
  return null
}
function modeOf(t: Txt): string | null {
  if (W('giao|ship|delivery|mang ve|dat do an|order ve|luoi ra duong|o nha|grab ?food|shopee ?food|takeaway').test(t.f)) return 'giao tận nơi'
  if (W('an tai (?:quan|cho)|tai cho|ngoi (?:quan|an|lai)|dine in|dat ban|di an').test(t.f)) return 'ăn tại quán'
  return null
}

// SHOPPING ──────────────────────────────────────────────────────────────────────────────────────

interface Q { id: string; vi: string; en: string; o: string[]; oEn: string[] }
const q = (id: string, vi: string, en: string, o: string[], oEn: string[]): Q => ({ id, vi, en, o, oEn })

interface Family {
  id: string; label: string; re: RegExp; on?: 'f' | 'lo'
  line?: { known: RegExp; q: Q }
  budget: Q
  must?: { known: RegExp; q: Q }
  condition?: boolean
  purpose?: { known: RegExp; q: Q }
}
const B_CHEAP = q('budget', 'Tầm giá bao nhiêu?', 'Price range?', ['Dưới 300k', '300-700k', '700k-1,5tr', 'Trên 1,5tr'], ['Under 300k', '300-700k', '700k-1.5M', 'Over 1.5M'])
const B_MID = q('budget', 'Tầm giá bao nhiêu?', 'Price range?', ['Dưới 1tr', '1-3tr', '3-5tr', 'Trên 5tr'], ['Under 1M', '1-3M', '3-5M', 'Over 5M'])
const B_PHONE = q('budget', 'Tầm giá bao nhiêu?', 'Price range?', ['Dưới 5tr', '5-10tr', '10-20tr', 'Trên 20tr'], ['Under 5M', '5-10M', '10-20M', 'Over 20M'])
const B_IPHONE = q('budget', 'Tầm giá bao nhiêu?', 'Price range?', ['Dưới 10tr', '10-20tr', '20-30tr', 'Trên 30tr'], ['Under 10M', '10-20M', '20-30M', 'Over 30M'])
const B_LAPTOP = q('budget', 'Tầm giá bao nhiêu?', 'Price range?', ['Dưới 15tr', '15-25tr', '25-40tr', 'Trên 40tr'], ['Under 15M', '15-25M', '25-40M', 'Over 40M'])
const B_BIG = q('budget', 'Tầm giá bao nhiêu?', 'Price range?', ['Dưới 3tr', '3-7tr', '7-15tr', 'Trên 15tr'], ['Under 3M', '3-7M', '7-15M', 'Over 15M'])
const B_GIFT = q('budget', 'Tầm giá món quà?', 'Gift budget?', ['Dưới 500k', '500k-1tr', '1-2tr', 'Trên 2tr'], ['Under 500k', '500k-1M', '1-2M', 'Over 2M'])

const FAMILIES: Family[] = [
  { id: 'case_uag', label: 'ốp UAG', re: W('uag'),
    line: { known: W('monarch|pathfinder|plyo|essential armor|civilian|plasma|metropolis'), q: q('line', 'Dòng nào?', 'Which line?', ['Monarch', 'Pathfinder', 'Plyo', 'Chưa biết'], ['Monarch', 'Pathfinder', 'Plyo', 'Not sure']) },
    budget: B_CHEAP, must: { known: W('magsafe|khong can magsafe'), q: q('must', 'Cần MagSafe không?', 'Need MagSafe?', ['Có MagSafe', 'Không cần'], ['Yes', 'No']) } },
  { id: 'case', label: 'ốp lưng', re: /(?<![\p{L}\p{N}])ốp(?![\p{L}\p{N}])|\bop lung\b/u, on: 'lo',
    line: { known: W('chong soc|trong suot|op da|silicon|magsafe|spigen|uag|esr'), q: q('line', 'Kiểu ốp nào?', 'Which case style?', ['Chống sốc', 'Trong suốt', 'Ốp da', 'Chưa biết'], ['Rugged', 'Clear', 'Leather', 'Not sure']) },
    budget: B_CHEAP, must: { known: W('magsafe'), q: q('must', 'Cần MagSafe không?', 'Need MagSafe?', ['Có MagSafe', 'Không cần'], ['Yes', 'No']) } },
  { id: 'iphone', label: 'iPhone', re: W('iphone|ip \\d{2}'),
    line: { known: /\b(?:iphone|ip)\s?\d{2}\s?(?:pro max|pro|plus|mini|e)\b|\b\d{2}\s?(?:pro max|pro|plus)\b/, q: q('line', 'Bản nào?', 'Which model?', ['Bản thường', 'Plus', 'Pro', 'Pro Max'], ['Base', 'Plus', 'Pro', 'Pro Max']) },
    budget: B_IPHONE, must: { known: /\b\d{3}\s?gb\b|\b1\s?tb\b/, q: q('must', 'Dung lượng bao nhiêu?', 'Storage?', ['128GB', '256GB', '512GB+'], ['128GB', '256GB', '512GB+']) }, condition: true },
  { id: 'laptop', label: 'laptop', re: W('laptop|macbook|may tinh xach tay|notebook'),
    line: { known: W('dell|hp|lenovo|thinkpad|asus|acer|msi|macbook|xps|zenbook|vivobook|legion|rog|surface|gigabyte'), q: q('line', 'Thích hãng nào?', 'Preferred brand?', ['MacBook', 'Dell/HP', 'Asus/Lenovo', 'Không quan trọng'], ['MacBook', 'Dell/HP', 'Asus/Lenovo', "Doesn't matter"]) },
    purpose: { known: W('van phong|hoc tap|do hoa|thiet ke|gaming|choi game|lap trinh|code|dung phim|edit video'), q: q('purpose', 'Dùng chủ yếu để làm gì?', 'Mainly for?', ['Văn phòng', 'Đồ hoạ', 'Gaming', 'Học tập'], ['Office', 'Design', 'Gaming', 'Study']) },
    budget: B_LAPTOP, must: { known: W('nhe|mong|pin trau|pin lau|man dep|cau hinh manh|ram \\d+|\\d+\\s?gb|oled'), q: q('must', 'Cần gì nhất?', 'Top priority?', ['Nhẹ', 'Pin trâu', 'Màn đẹp', 'Cấu hình mạnh'], ['Light', 'Battery', 'Screen', 'Power']) }, condition: true },
  { id: 'phone', label: 'điện thoại', re: W('dien thoai|dt|smartphone|samsung|xiaomi|oppo|vivo|pixel|realme'),
    line: { known: W('samsung|xiaomi|oppo|vivo|pixel|realme|iphone|galaxy \\w+|redmi'), q: q('line', 'Hãng nào?', 'Which brand?', ['iPhone', 'Samsung', 'Xiaomi/Oppo', 'Không quan trọng'], ['iPhone', 'Samsung', 'Xiaomi/Oppo', "Doesn't matter"]) },
    budget: B_PHONE, must: { known: W('camera|chup anh|pin trau|pin lau|choi game|man hinh lon|nho gon'), q: q('must', 'Ưu tiên gì?', 'Top priority?', ['Camera', 'Pin trâu', 'Chơi game', 'Giá tốt'], ['Camera', 'Battery', 'Gaming', 'Value']) }, condition: true },
  { id: 'headphone', label: 'tai nghe', re: W('tai nghe|airpods|headphone|earbuds'),
    line: { known: W('nhet tai|in ear|chup tai|over ear|true wireless|tws|airpods|sony|jbl|bose|sennheiser|soundpeats'), q: q('line', 'Loại nào?', 'Which type?', ['Nhét tai', 'Chụp tai', 'Chưa biết'], ['In-ear', 'Over-ear', 'Not sure']) },
    budget: B_MID, must: { known: W('chong on|anc|noise cancel|mic|chong nuoc'), q: q('must', 'Cần chống ồn không?', 'Need noise cancelling?', ['Có chống ồn', 'Không cần'], ['Yes', 'No']) },
    purpose: { known: W('nghe nhac|goi dien|hop online|tap gym|chay bo|the thao|choi game'), q: q('purpose', 'Dùng để làm gì?', 'Mainly for?', ['Nghe nhạc', 'Gọi/họp', 'Tập thể thao', 'Chơi game'], ['Music', 'Calls', 'Workout', 'Gaming']) } },
  { id: 'watch', label: 'đồng hồ thông minh', re: W('dong ho|smartwatch|apple watch|smart band|vong deo'),
    line: { known: W('apple watch|garmin|galaxy watch|huawei|xiaomi|amazfit|iphone|android'), q: q('line', 'Dùng với điện thoại gì?', 'Paired phone?', ['iPhone', 'Android', 'Chưa biết'], ['iPhone', 'Android', 'Not sure']) },
    budget: B_MID, must: { known: W('suc khoe|nhip tim|do huyet ap|nghe goi|pin lau|gps|chong nuoc|de dung|chu to'), q: q('must', 'Cần tính năng gì?', 'Key feature?', ['Theo dõi sức khỏe', 'Nghe gọi', 'Pin lâu', 'Dễ dùng'], ['Health', 'Calls', 'Battery', 'Easy to use']) } },
  { id: 'keyboard', label: 'bàn phím cơ', re: W('ban phim|keyboard'),
    line: { known: W('full ?size|tkl|75%|65%|60%|akko|keychron|logitech|razer|leopold'), q: q('line', 'Layout nào?', 'Which layout?', ['Fullsize', 'TKL', '75%', 'Chưa biết'], ['Full', 'TKL', '75%', 'Not sure']) },
    budget: B_MID, must: { known: W('linear|tactile|clicky|red|brown|blue|switch \\w+|khong day|wireless|hotswap'), q: q('must', 'Switch kiểu nào?', 'Which switches?', ['Linear (êm)', 'Tactile', 'Clicky', 'Chưa biết'], ['Linear', 'Tactile', 'Clicky', 'Not sure']) } },
  { id: 'sunscreen', label: 'kem chống nắng', re: W('kem chong nang|sunscreen|chong nang'),
    line: { known: W('da (?:dau|kho|nhay cam|hon hop|thuong|mun)'), q: q('line', 'Da bạn loại nào?', 'Your skin type?', ['Da dầu', 'Da khô', 'Nhạy cảm', 'Hỗn hợp'], ['Oily', 'Dry', 'Sensitive', 'Combination']) },
    budget: B_CHEAP, must: { known: W('nang tong|khong nang tong|vat ly|hoa hoc|khong con|chong nuoc|spf'), q: q('must', 'Thích loại nào?', 'Preferred type?', ['Không nâng tông', 'Nâng tông', 'Chống nước'], ['No tint', 'Tinted', 'Water-resistant']) } },
  { id: 'skincare', label: 'mỹ phẩm', re: W('my pham|skincare|kem duong|sua rua mat|serum|toner|tay trang|kem nen|makeup'),
    line: { known: W('da (?:dau|kho|nhay cam|hon hop|thuong|mun)'), q: q('line', 'Da bạn loại nào?', 'Your skin type?', ['Da dầu', 'Da khô', 'Nhạy cảm', 'Hỗn hợp'], ['Oily', 'Dry', 'Sensitive', 'Combination']) },
    budget: B_CHEAP, must: { known: W('tri mun|duong am|trang da|chong lao hoa|lam diu'), q: q('must', 'Cần tác dụng gì?', 'Main goal?', ['Trị mụn', 'Dưỡng ẩm', 'Sáng da', 'Chống lão hoá'], ['Acne', 'Hydration', 'Brightening', 'Anti-aging']) } },
  { id: 'lipstick', label: 'son', re: /(?<![\p{L}\p{N}])(?:son|son môi|son kem|son thỏi)(?![\p{L}\p{N}])/u, on: 'lo',
    line: { known: W('do gach|do cam|do ruou|do tuoi|mau (?:do|cam|hong|nude|nau)|nude|hong dat|cam chay'), q: q('line', 'Tông màu nào?', 'Which shade?', ['Đỏ', 'Cam', 'Hồng', 'Nude'], ['Red', 'Orange', 'Pink', 'Nude']) },
    budget: B_CHEAP, must: { known: W('li|lì|matte|bong|duong|lau troi|kem|thoi'), q: q('must', 'Chất son?', 'Finish?', ['Son lì', 'Son bóng', 'Son dưỡng'], ['Matte', 'Glossy', 'Balm']) } },
  { id: 'perfume', label: 'nước hoa', re: W('nuoc hoa|perfume'),
    line: { known: W('tuoi mat|go am|mui go|ngot|huong hoa|mui hoa|citrus|woody|musk|dior|chanel|versace|ysl|creed'), q: q('line', 'Thích mùi nào?', 'Which scent?', ['Tươi mát', 'Gỗ ấm', 'Ngọt ngào', 'Chưa biết'], ['Fresh', 'Woody', 'Sweet', 'Not sure']) },
    budget: B_MID, purpose: { known: W('di lam|di choi|hen ho|di tiec|hang ngay|tang'), q: q('purpose', 'Dùng dịp nào?', 'For what occasion?', ['Đi làm', 'Đi chơi/hẹn hò', 'Tặng quà'], ['Work', 'Going out', 'Gift']) } },
  { id: 'airfryer', label: 'nồi chiên không dầu', re: W('noi chien'),
    line: { known: /\b\d+(?:[.,]\d)?\s?l(?:it)?\b|\blit\b/, q: q('line', 'Dung tích bao nhiêu?', 'Capacity?', ['Dưới 4L', '4-6L', 'Trên 6L'], ['Under 4L', '4-6L', 'Over 6L']) },
    budget: B_MID, must: { known: W('philips|lock ?& ?lock|sunhouse|xiaomi|cuckoo|tefal|dien tu|co|cua kinh|nuong'), q: q('must', 'Ưu tiên gì?', 'Priority?', ['Dễ vệ sinh', 'Bền', 'Nhiều chức năng', 'Giá tốt'], ['Easy clean', 'Durable', 'Multi-function', 'Value']) } },
  { id: 'purifier', label: 'máy lọc không khí', re: W('may loc(?: khong khi)?'),
    line: { known: /\b\d+\s?m2\b|\b\d+\s?met vuong\b/, q: q('line', 'Phòng khoảng bao nhiêu m²?', 'Room size?', ['Dưới 20m²', '20-40m²', 'Trên 40m²'], ['Under 20m²', '20-40m²', 'Over 40m²']) },
    budget: B_BIG, must: { known: W('bui min|pm2\\.?5|long thu cung|mui|du am|hepa|yen tinh'), q: q('must', 'Cần lọc gì nhất?', 'Main need?', ['Bụi mịn', 'Lông thú cưng', 'Khử mùi', 'Tạo ẩm'], ['Fine dust', 'Pet hair', 'Odors', 'Humidify']) } },
  { id: 'robot', label: 'robot hút bụi', re: W('robot hut bui|robot lau nha|may hut bui'),
    line: { known: W('hut lau|lau nha|tu do rac|chi hut|roborock|ecovacs|dreame|xiaomi'), q: q('line', 'Cần tính năng nào?', 'Which features?', ['Chỉ hút', 'Hút + lau', 'Tự đổ rác'], ['Vacuum only', 'Vacuum + mop', 'Self-emptying']) },
    budget: B_BIG, must: { known: W('co cho|co meo|long thu cung|thu cung|nha rong|tham'), q: q('must', 'Nhà có thú cưng hay thảm?', 'Pets or carpets?', ['Có thú cưng', 'Có thảm', 'Không'], ['Pets', 'Carpets', 'Neither']) } },
  { id: 'appliance', label: 'đồ gia dụng', re: W('gia dung|noi com|may giat|tu lanh|dieu hoa|may lanh|quat|may pha|lo vi song|do dung nha|phong tro'),
    line: { known: W('philips|panasonic|samsung|lg|toshiba|sharp|sunhouse|xiaomi|daikin|electrolux'), q: q('line', 'Cần những món gì?', 'Which items?', ['Đồ bếp', 'Đồ điện', 'Nội thất nhỏ', 'Đủ thứ'], ['Kitchen', 'Appliances', 'Small furniture', 'Everything']) },
    budget: B_BIG, must: { known: W('tiet kiem dien|inverter|nho gon|de ve sinh|ben'), q: q('must', 'Ưu tiên gì?', 'Priority?', ['Nhỏ gọn', 'Tiết kiệm điện', 'Bền', 'Giá tốt'], ['Compact', 'Energy-saving', 'Durable', 'Value']) }, condition: true },
  { id: 'fashion', label: 'đồ thời trang', re: /(?<![\p{L}\p{N}])(?:áo|quần áo|váy|giày|dép|túi|balo|thời trang)(?![\p{L}\p{N}])/u, on: 'lo',
    line: { known: W('nam|nu|cong so|nang dong|the thao|chay bo|streetwear|basic|giu am|chong nuoc|di da lat|du lich'), q: q('line', 'Phong cách nào?', 'Which style?', ['Năng động', 'Công sở', 'Dạo phố', 'Thể thao'], ['Casual', 'Office', 'Street', 'Sport']) },
    budget: B_MID, must: { known: W('size \\w+|\\bsize\\b|\\d{2}\\b|mau \\w+|giu am|chong nuoc|nhe'), q: q('must', 'Size bao nhiêu?', 'Your size?', ['S', 'M', 'L', 'XL+'], ['S', 'M', 'L', 'XL+']) } },
  { id: 'snack', label: 'đồ ăn vặt', re: W('do an vat|an vat|banh keo|snack'),
    line: { known: W('man|ngot|cay|kho ga|kho bo|banh trang|hat|trai cay say'), q: q('line', 'Thích vị gì?', 'Which flavour?', ['Mặn', 'Ngọt', 'Cay', 'Đủ vị'], ['Savory', 'Sweet', 'Spicy', 'Mixed']) },
    budget: B_CHEAP, must: { known: W('online|shopee|lazada|tiktok|tiem|cho|sieu thi|an kieng|healthy'), q: q('must', 'Mua online hay ở tiệm?', 'Online or in store?', ['Online', 'Ở tiệm', 'Sao cũng được'], ['Online', 'In store', 'Either']) } },
  { id: 'gift', label: 'quà tặng', re: W('qua tang|tang qua|mon qua|mua gi|gift|sinh nhat|qua (?:cho|sinh nhat|20\\/10|8\\/3|noel|tet)'),
    line: { known: W('thich [a-z ]{2,}|me (?:ca phe|tra|doc sach|cong nghe|the thao)|nghien \\w+'), q: q('line', 'Người nhận thích gì?', 'What do they like?', ['Cà phê/trà', 'Đồ công nghệ', 'Làm đẹp', 'Chưa biết'], ['Coffee/tea', 'Tech', 'Beauty', 'Not sure']) },
    budget: B_GIFT, must: { known: W('thiet thuc|ky niem|trai nghiem|y nghia|sang trong|handmade'), q: q('must', 'Quà kiểu nào?', 'What kind of gift?', ['Thiết thực', 'Kỷ niệm', 'Trải nghiệm'], ['Practical', 'Keepsake', 'Experience']) } },
]
const GENERIC_FAMILY: Family = {
  id: 'generic', label: 'món đồ', re: /$^/,
  line: { known: /$^/, q: q('line', 'Bạn cần món gì cụ thể?', 'What exactly do you need?', ['Đồ công nghệ', 'Thời trang', 'Gia dụng', 'Làm đẹp'], ['Tech', 'Fashion', 'Home', 'Beauty']) },
  budget: B_MID, condition: true,
}
function familyOf(t: Txt): Family {
  // Order matters: a case beats the phone it is for; an iPhone beats the generic phone family.
  for (const fam of FAMILIES) if (fam.re.test(fam.on === 'lo' ? t.lo : t.f)) return fam
  if (N('quà').test(t.lo)) return FAMILIES.find(f => f.id === 'gift')!
  return GENERIC_FAMILY
}
function conditionOf(t: Txt): string | null {
  if (N('cũ').test(t.lo) || W('dt cu|may cu|hang cu|do cu|2hand|second hand|like new|used|refurbished').test(t.f) || W('cu').test(t.f.replace(/\d+\s*cu\b/g, ' '))) return 'cũ' // "1 củ" is money, not "cũ"
  if (N('mới|chính hãng|new').test(t.lo) || W('fullbox|chinh hang|brand new').test(t.f)) return 'mới'
  return null
}
const PURPOSE: Array<[RegExp, string]> = [
  [W('van phong|di lam'), 'văn phòng'], [W('hoc tap|sinh vien|di hoc'), 'học tập'], [W('do hoa|thiet ke'), 'đồ hoạ'], [W('gaming|choi game'), 'chơi game'],
  [W('lap trinh|dan code|code'), 'lập trình'], [W('chay bo'), 'chạy bộ'], [W('tap gym|the thao'), 'thể thao'],
  [W('cho (?:me|bo|sep|ban gai|ban trai|vo|chong|con|be|nguoi yeu|ny|dong nghiep|ban than)|tang (?:me|bo|sep|ban gai|ban trai|vo|chong|nguoi yeu)|sep \\w+|ban gai|ban trai'), 'làm quà'],
  [W('sinh nhat|20\\/10|8\\/3|valentine|noel|giang sinh|tet|ky niem'), 'dịp đặc biệt'], [W('di da lat|di du lich|di sapa|di bien'), 'đi du lịch'],
  [W('phong tro|nha moi|chuyen nha'), 'nhà mới'], [W('nha co cho|nha co meo|thu cung'), 'nhà có thú cưng'],
]
function purposeOf(t: Txt): string | null { return label(t, PURPOSE) }

// TRAVEL ────────────────────────────────────────────────────────────────────────────────────────

type TravelKind = 'flight' | 'ticket' | 'hotel' | 'trip'
function travelKindOf(t: Txt): TravelKind {
  if (W('ve may bay|chuyen bay|flight|bay thang|hang bay').test(t.f)) return 'flight'
  if (W('ve xe|xe khach|xe giuong nam|limousine|ve tau|tau hoa|tau lua').test(t.f)) return 'ticket'
  if (W('khach san|homestay|resort|villa|hostel|book phong|dat phong|hotel').test(t.f) && !W('du lich|lich trinh|\\d+ ngay').test(t.f)) return 'hotel'
  return 'trip'
}
const cityAt = (s: string): string | null => { for (const [k, v] of CITY) if (new RegExp(`^(?:${k})\\b`).test(s)) return v; return null }
export function routeOf(t: Txt): { origin: string | null; dest: string | null } {
  let origin: string | null = null, dest: string | null = null
  const from = new RegExp(`\\b(?:tu|xuat phat(?: tu)?|khoi hanh(?: tu)?|from|gan|quanh|o)\\s+(${CITY_ALT})\\b`).exec(t.fc)
  if (from) origin = cityAt(from[1])
  const pair = new RegExp(`\\b(${CITY_ALT})\\s*(?:di|->|-|den|toi|ra|vao|to|–)\\s*(${CITY_ALT})\\b`).exec(t.fc)
  if (pair) { origin = origin ?? cityAt(pair[1]); dest = cityAt(pair[2]) }
  if (!dest) {
    const go = new RegExp(`\\b(?:di|ve|ra|vao|toi|den|dl|du lich|lich trinh|khach san|homestay|resort|o)\\s+(${CITY_ALT})\\b`).exec(t.fc)
    if (go && cityAt(go[1]) !== origin) dest = cityAt(go[1])
  }
  if (!dest) {
    // Any other city mentioned (not the origin) is the destination: "tàu hỏa hà nội sapa".
    const all = [...t.f.matchAll(new RegExp(`\\b(${CITY_ALT})\\b`, 'g'))].map(m => cityAt(m[1])).filter((c): c is string => !!c)
    const rest = all.filter(c => c !== origin)
    if (all.length >= 2 && !origin) { origin = all[0]; dest = all[1] } else if (rest.length) dest = rest[rest.length - 1]
  }
  return { origin, dest }
}
const DURATION = /\b\d{1,2}\s*(?:n|ngay)\s*\d{0,2}\s*(?:d|dem)?\b|\b(?:mot|hai|ba|bon|nam)\s+ngay(?:\s+\w+\s+dem)?\b|\btrong ngay\b|\bvai hom\b|\bmay hom\b|\b\d+\s*days?\b/
const OTHER_DATE = /\bthang\s+\d{1,2}\b|\bcuoi tuan\b|\btuan\s+(?:sau|toi|nay)\b|\bthang\s+(?:sau|toi|nay)\b|\b(?:le|dip)\s+(?:2\/9|30\/4|tet)\b|\btet\b|\bngay mai\b|\bnext (?:week|month|weekend)\b|\bthis weekend\b/
// UAT 1ddfadc (affiliate check): "ngày 15/10" was read as "ngày 15" (the day-only alternative matched first, the
// month was lost, the fare link fell back to +7 days) and "10/10 đến 12/10" kept only the check-in (checkout
// defaulted to one night). A day/month wins over a bare day; a "A đến B" range gives the return / checkout.
const DAY_MONTH = /\b\d{1,2}\s*[/.]\s*\d{1,2}(?:\s*[/.]\s*\d{2,4})?\b/
const DATE_RANGE = /\b(\d{1,2}\s*[/.]\s*\d{1,2})\s*(?:den|toi|ve|-|–|~)\s*(?:ngay\s+)?(\d{1,2}\s*[/.]\s*\d{1,2})\b/
export function tripDatesOf(t: Txt): { date: string | null; days: string | null; back: string | null } {
  const days = grab(t, DURATION)
  const noDur = t.f.replace(new RegExp(DURATION.source, 'g'), m => ' '.repeat(m.length))
  let date: string | null = null
  const back: string | null = null
  const range = DATE_RANGE.exec(noDur)
  if (range) return { date: range[1].replace(/\s+/g, ''), days, back: range[2].replace(/\s+/g, '') }
  const m = DAY_MONTH.exec(noDur) ?? SPECIFIC_DATE.exec(noDur) ?? OTHER_DATE.exec(noDur)
  if (m) date = t.lo.slice(m.index, m.index + m[0].length).trim()
  return { date, days, back }
}
const STYLE: Array<[RegExp, string]> = [
  [W('bien|tam bien|view bien|gan bien|beach'), 'biển'], [W('nui|san may|trekking|leo nui|mountain'), 'núi'], [W('an uong|hai san|am thuc|food tour'), 'ăn uống'],
  [W('nghi duong|resort|thu gian|chill'), 'nghỉ dưỡng'], [W('kham pha|phuot|mao hiem'), 'khám phá'], [W('lang man|honeymoon|trang mat'), 'lãng mạn'],
]
const TRANSPORT: Array<[RegExp, string]> = [
  [W('may bay|bay (?:sang|trua|chieu|toi|dem|thang|tu|ra|vao)|flight|fly'), 'máy bay'], [W('xe rieng|tu lai|lai xe|o to|oto|xe hoi'), 'xe riêng'], [W('xe may|phuot'), 'xe máy'],
  [W('xe khach|xe giuong nam|limousine|bus'), 'xe khách'], [W('tau hoa|tau lua|di tau|ve tau|train'), 'tàu hỏa'],
]
const FLIGHT_TIME = /\b(?:bay|chuyen|buoi|di)\s+(?:sang|trua|chieu|toi|dem|khuya)\b|\b(?:sau|truoc|tu|khoang)\s+\d{1,2}\s?h\b|\b\d{1,2}\s?h(?:\d{2})?\b|\b(?:morning|afternoon|evening)\b/

// ENTERTAINMENT / SPA ───────────────────────────────────────────────────────────────────────────

const ACTIVITIES: Array<[RegExp, string]> = [
  [W('karaoke|di hat|quan hat'), 'karaoke'], [W('bida|bi a|billiard'), 'bida'], [W('bowling'), 'bowling'], [W('rap phim|rap chieu|xem phim|(?<!ban )phim|cgv|cinema'), 'xem phim'],
  [W('concert|live ?show'), 'concert'], [W('rooftop'), 'rooftop bar'], [W('bar|pub|beer club'), 'bar/pub'], [W('club|quay'), 'club'], [W('nhac song|acoustic|live music'), 'nhạc sống'],
  [W('escape room|phong thoat hiem'), 'escape room'], [W('board ?game|ma soi'), 'board game'], [W('game center|trung tam tro choi|khu vui choi|khu tro choi|san choi'), 'khu vui chơi'],
  [W('cong vien|thao cam vien|so thu'), 'công viên'], [W('pho di bo'), 'phố đi bộ'], [W('trien lam|bao tang'), 'triển lãm/bảo tàng'], [W('thuy cung|aquarium'), 'thủy cung'],
  [W('truot bang|trampoline|paintball'), 'vận động'], [W('workshop'), 'workshop'],
]
function activityOf(t: Txt): string | null { return label(t, ACTIVITIES) ?? (N('hát').test(t.lo) ? 'karaoke' : null) }

interface Service { label: string; re: RegExp; vague?: boolean; variant?: { known: RegExp; q: Q } }
const SERVICES: Service[] = [
  { label: 'massage', re: W('massage|mat xa|foot massage'), variant: { known: W('toan than|body|chan|foot|co vai gay|vai gay|da nong|thai|nhat|bam huyet|mat'), q: q('style', 'Massage kiểu nào?', 'Which massage?', ['Toàn thân', 'Chân', 'Cổ vai gáy', 'Đá nóng'], ['Full body', 'Foot', 'Neck & shoulders', 'Hot stone']) } },
  { label: 'gội đầu dưỡng sinh', re: W('goi dau|duong sinh') }, { label: 'xông hơi', re: W('xong hoi|sauna|tam hoi') },
  { label: 'làm nail', re: W('nail|lam mong|son mong|son gel|ve mong|dap bot'), variant: { known: W('son gel|gel|ve|dinh da|dap bot|cham soc mong|combo|son thuong'), q: q('style', 'Làm kiểu nào?', 'Which service?', ['Sơn gel', 'Vẽ/đính đá', 'Đắp bột', 'Chăm sóc móng'], ['Gel polish', 'Nail art', 'Acrylic', 'Manicure']) } },
  { label: 'cắt tóc', re: W('cat toc|barber|toc nam|hot toc') },
  { label: 'làm tóc', re: W('uon toc|nhuom toc|duoi toc|lam toc|salon|hair|toc nu'), variant: { known: W('uon|nhuom|duoi|cat|phuc hoi|goi'), q: q('style', 'Làm tóc gì?', 'Which hair service?', ['Cắt', 'Uốn', 'Nhuộm', 'Phục hồi'], ['Cut', 'Perm', 'Color', 'Treatment']) } },
  { label: 'chăm sóc da', re: W('cham soc da|tri mun|nan mun|lay mun|facial') }, { label: 'waxing', re: W('waxing|wax long|triet long') },
  { label: 'nối mi', re: W('noi mi|uon mi') }, { label: 'phun xăm', re: W('phun may|phun moi|xam may') }, { label: 'tắm trắng', re: W('tam trang') },
  { label: 'yoga', re: W('yoga|pilates') }, { label: 'phòng gym', re: W('gym|phong tap') }, { label: 'bấm huyệt', re: W('bam huyet|giac hoi|cao gio') },
  { label: 'trang điểm', re: W('trang diem|makeup') },
  { label: 'làm đẹp', re: W('lam dep|tham my vien'), vague: true },
  { label: 'spa', re: W('spa'), vague: true },
  { label: 'thư giãn', re: W('thu gian|met qua|met moi|dau vai|dau lung|moi vai|nhuc moi'), vague: true },
]
function serviceOf(t: Txt): Service | null {
  for (const s of SERVICES) if (!s.vague && s.re.test(t.f)) return s
  for (const s of SERVICES) if (s.vague && s.re.test(t.f)) return s
  return null
}
const SPECIAL: Array<[RegExp, string]> = [
  [W('ktv nu|ky thuat vien nu|nhan vien nu|nu lam'), 'KTV nữ'], [W('ktv nam|ky thuat vien nam|nhan vien nam'), 'KTV nam'],
  [W('phong rieng|phong vip|rieng tu'), 'phòng riêng'], [W('couple|cap doi|2 nguoi|hai nguoi'), 'cho cặp đôi'], [W('co xong hoi'), 'có xông hơi'],
  [W('spa nam|cho nam|toc nam|nam gioi'), 'cho nam'], [W('cho me|nguoi lon tuoi|me minh'), 'cho người lớn tuổi'], [W('bau|mang thai'), 'cho mẹ bầu'],
]

// ── Slot table per area ────────────────────────────────────────────────────────────────────────

interface SlotView { known: Record<string, string>; count: number; enough: boolean; missing: Q[]; queryParts: string[]; area?: string; lead: { vi: string; en: string }; assumptions: string[] }

const AREA_Q = (gps: boolean) => q('area', 'Khu vực nào?', 'Which area?', gps ? ['Gần mình', 'Quận 1', 'Quận 3', 'Quận 7'] : ['Quận 1', 'Quận 3', 'Bình Thạnh', 'Quận 7'], gps ? ['Near me', 'District 1', 'District 3', 'District 7'] : ['District 1', 'District 3', 'Binh Thanh', 'District 7'])
const PARTY_Q = q('party', 'Đi mấy người?', 'How many people?', ['1 người', '2 người', '3-5 người', 'Nhóm đông'], ['1', '2', '3-5', 'Big group'])

function foodView(t: Txt, gps: boolean): SlotView {
  const dish = dishOf(t)
  const party = partyOf(t), budget = budgetOf(t), mode = modeOf(t)
  let area = localAreaOf(t)
  if (area === 'gần bạn' && !gps) area = null
  const vibe = vibeOf(t)
  const time = timeOf(t)
  const known: Record<string, string> = {}
  if (dish) known.mon = dish.label
  if (party) known.so_nguoi = party
  if (budget) known.ngan_sach = budget
  if (area) known.khu_vuc = area
  if (mode) known.hinh_thuc = mode
  if (vibe) known.khong_khi = vibe
  if (time) known.thoi_gian = time
  // GPS removes the area QUESTION; only what the user said counts toward "enough to pick".
  const count = [dish, party, budget, area, mode].filter(Boolean).length
  const missing: Q[] = []
  if (!dish) {
    const breakfast = W('an sang|bua sang|breakfast').test(t.f)
    missing.push(breakfast ? q('dish', 'Ăn sáng món gì?', 'What for breakfast?', ['Phở/bún', 'Bánh mì', 'Cơm tấm', 'Chưa biết'], ['Pho/noodles', 'Banh mi', 'Broken rice', 'Not sure'])
      : q('dish', 'Món gì / kiểu quán?', 'What kind of food?', ['Món Việt', 'Nhật/Hàn', 'Lẩu/nướng', 'Chưa biết'], ['Vietnamese', 'Japanese/Korean', 'Hotpot/BBQ', 'Not sure']))
  } else if (dish.variant && !dish.variant.known.test(t.f) && !(dish.label === 'cà phê' && vibe)) {
    missing.push(q('style', dish.variant.q, dish.variant.qEn, dish.variant.opts, dish.variant.optsEn))
  }
  if (!party) missing.push(PARTY_Q)
  if (!budget) missing.push(q('budget', 'Tầm bao nhiêu mỗi người?', 'Budget per person?', ['Dưới 100k', '100-300k', '300-500k', 'Trên 500k'], ['Under 100k', '100-300k', '300-500k', 'Over 500k']))
  // With GPS the area is covered ("Gần mình" is the default) — asked last, only if room is left.
  if (!area && !gps && mode !== 'giao tận nơi') missing.push(AREA_Q(gps))
  if (!mode) missing.push(q('mode', 'Ăn tại quán hay giao?', 'Dine in or delivery?', ['Ăn tại quán', 'Giao tận nơi'], ['Dine in', 'Delivery']))
  if (!area && gps && mode !== 'giao tận nơi') missing.push(AREA_Q(gps))
  const base = dish ? (dish.place ? dish.label : dish.label.startsWith('món ') ? `nhà hàng ${dish.label.slice(4)}` : `quán ${dish.label}`) : 'quán ăn ngon'
  const variantWord = dish?.variant ? grab(t, new RegExp(dish.variant.known.source)) : null
  const queryParts = [base, variantWord && !base.includes(variantWord) ? variantWord : '', vibe ?? '', budget === 'bình dân' ? 'bình dân' : '', mode === 'giao tận nơi' ? 'giao tận nơi' : '']
  const assumptions: string[] = []
  if (!party) assumptions.push('Mình chọn chỗ hợp cho 2 người')
  if (!budget) assumptions.push('Mức giá tầm trung')
  if (!mode) assumptions.push('Ăn tại quán')
  if (!area) assumptions.push(gps ? 'Gần vị trí của bạn' : 'Khu trung tâm')
  const what = dish ? `quán ${dish.place ? dish.label.replace(/^quán /, '') : dish.label}` : 'quán'
  return { known, count, enough: count >= 3, missing, queryParts, area: area && area !== 'gần bạn' ? area : undefined, assumptions,
    lead: { vi: `Để chọn đúng ${what}${area && area !== 'gần bạn' ? ` ở ${area}` : ''} cho bạn:`, en: 'To pick the right place for you:' } }
}

function shoppingView(t: Txt): SlotView {
  const fam = familyOf(t)
  const budget = budgetOf(t), condition = fam.condition ? conditionOf(t) : null, purpose = purposeOf(t)
  const lineKnown = fam.line ? grab(t, fam.line.known) : null
  const mustKnown = fam.must ? grab(t, fam.must.known) : null
  // "laptop cho sinh viên" still needs the USE (a student may study design or accounting).
  const purposeKnown = fam.purpose ? (grab(t, fam.purpose.known) ?? (fam.id === 'laptop' ? null : purpose)) : purpose
  const model = /\b(?:iphone|ip|galaxy|pixel)?\s?(\d{2})\s?(pro max|pro|plus|ultra|mini)?\b/.exec(t.f)
  const known: Record<string, string> = { san_pham: fam.label }
  if (fam.id.startsWith('case') && model) known.cho_may = `${model[1]}${model[2] ? ` ${model[2]}` : ''}`
  if (lineKnown) known.dong = lineKnown
  if (budget) known.ngan_sach = budget
  if (mustKnown) known.yeu_cau = mustKnown
  if (condition) known.tinh_trang = condition
  if (purposeKnown) known.muc_dich = purposeKnown
  const count = [lineKnown, budget, mustKnown, condition, purposeKnown].filter(Boolean).length
  const missing: Q[] = []
  if (fam.id === 'iphone' && !lineKnown && !/\b(?:iphone|ip)\s?\d{2}\b/.test(t.f)) missing.push(q('line', 'Đời nào?', 'Which generation?', ['iPhone 14', 'iPhone 15', 'iPhone 16', 'iPhone 17'], ['iPhone 14', 'iPhone 15', 'iPhone 16', 'iPhone 17']))
  else if (fam.line && !lineKnown && fam.id !== 'laptop') missing.push(fam.line.q)
  // Laptop: the use decides everything; the brand is only a preference (never asked first).
  if (fam.purpose && !purposeKnown && fam.id === 'laptop') missing.unshift(fam.purpose.q)
  if (!budget) missing.push(fam.budget)
  if (fam.must && !mustKnown) missing.push(fam.must.q)
  if (fam.condition && !condition) missing.push(q('condition', 'Mới hay cũ?', 'New or used?', ['Mới', 'Cũ/like new', 'Đều được'], ['New', 'Used', 'Either']))
  if (fam.purpose && !purposeKnown && fam.id !== 'laptop') missing.push(fam.purpose.q)
  const interest = fam.id === 'gift' ? grab(t, /\bthich ([a-z]+(?: [a-z]+)?)/, 1) : null
  const recipient = grab(t, /\b(?:cho|tang) (me|bo|sep|ban gai|ban trai|vo|chong|nguoi yeu|dong nghiep)\b/, 1) ?? grab(t, /\b(sep|ban gai|ban trai|me|bo)\b/, 1)
  const queryParts = fam.id === 'gift'
    ? ['quà tặng', recipient ?? '', interest ? `thích ${interest}` : '']
    : [fam.id === 'case_uag' ? 'ốp UAG' : fam.label, fam.id.startsWith('case') && known.cho_may ? `iPhone ${cap(known.cho_may)}` : '', lineKnown ?? '', mustKnown ?? '', condition === 'cũ' ? 'cũ' : '', fam.id === 'laptop' && purposeKnown ? purposeKnown : '']
  const assumptions: string[] = []
  if (!budget) assumptions.push('Tầm giá phổ biến')
  if (fam.condition && !condition) assumptions.push('Hàng mới chính hãng')
  return { known, count, enough: count >= 3, missing, queryParts, assumptions,
    lead: { vi: `Để chọn đúng ${fam.id === 'generic' ? 'món đồ' : fam.label} cho bạn:`, en: 'To pick the right one for you:' } }
}

function travelView(t: Txt): SlotView {
  const kind = travelKindOf(t)
  const { origin, dest } = routeOf(t)
  const { date, days, back } = tripDatesOf(t)
  const party = partyOf(t) ?? (W('gia dinh').test(t.f) ? 'gia đình' : null)
  const budget = budgetOf(t), style = label(t, STYLE), transport = label(t, TRANSPORT)
  const flightTime = kind === 'flight' || kind === 'ticket' ? grab(t, FLIGHT_TIME) : null
  const known: Record<string, string> = {}
  if (dest) known.diem_den = dest
  if (origin) known.xuat_phat = origin
  if (date) known.ngay = date
  if (back) known.ngay_ve = back
  if (days) known.so_ngay = days
  if (party) known.so_nguoi = party
  if (budget) known.ngan_sach = budget
  if (style) known.phong_cach = style
  if (transport) known.phuong_tien = transport
  if (flightTime) known.gio = flightTime
  const missing: Q[] = []
  let enough: boolean
  let count: number
  const DATE_Q = q('date', kind === 'flight' ? 'Ngày bay?' : 'Đi ngày nào?', kind === 'flight' ? 'Flight date?' : 'When are you going?', ['Cuối tuần này', 'Tuần sau', 'Tháng sau', 'Chưa chốt'], ['This weekend', 'Next week', 'Next month', 'Not fixed'])
  const PARTY_T = q('party', 'Mấy người?', 'How many people?', ['1 người', '2 người', 'Gia đình', 'Nhóm bạn'], ['1', '2', 'Family', 'Friends'])
  if (kind === 'flight' || kind === 'ticket') {
    count = [date, flightTime, party].filter(Boolean).length
    enough = !!date
    if (!date) missing.push(DATE_Q)
    if (!flightTime) missing.push(q('time', kind === 'flight' ? 'Bay buổi nào?' : 'Đi buổi nào?', 'What time of day?', ['Sáng', 'Chiều', 'Tối'], ['Morning', 'Afternoon', 'Evening']))
    if (!party) missing.push(PARTY_T)
  } else if (kind === 'hotel') {
    count = [date || days, party, budget, style].filter(Boolean).length
    enough = !!(date || days) && count >= 3
    if (!date && !days) missing.push(q('date', 'Ở ngày nào, mấy đêm?', 'Which dates, how many nights?', ['Cuối tuần này', '1 đêm', '2-3 đêm', 'Chưa chốt'], ['This weekend', '1 night', '2-3 nights', 'Not fixed']))
    if (!party) missing.push(PARTY_T)
    if (!budget) missing.push(q('budget', 'Tầm giá mỗi đêm?', 'Budget per night?', ['Dưới 700k', '700k-1,5tr', '1,5-3tr', 'Trên 3tr'], ['Under 700k', '700k-1.5M', '1.5-3M', 'Over 3M']))
    if (!style) missing.push(q('style', 'Ưu tiên gì?', 'Priority?', ['Gần biển/trung tâm', 'Có hồ bơi', 'Yên tĩnh', 'Giá tốt'], ['Beach/center', 'Pool', 'Quiet', 'Value']))
  } else {
    const others = [party, budget, style, transport].filter(Boolean).length
    count = [date || days, origin].filter(Boolean).length + others
    enough = !!(date || days) && !!origin && (!!dest || others >= 2)
    if (!date) missing.push(days ? q('date', 'Đi ngày nào?', 'When are you going?', ['Cuối tuần này', 'Tuần sau', 'Tháng sau', 'Chưa chốt'], ['This weekend', 'Next week', 'Next month', 'Not fixed'])
      : q('date', 'Đi khi nào, mấy ngày?', 'When and how long?', ['Cuối tuần 2N1Đ', '3N2Đ', '4-5 ngày', 'Chưa chốt'], ['Weekend 2D1N', '3D2N', '4-5 days', 'Not fixed']))
    if (!origin) missing.push(q('origin', 'Xuất phát từ đâu?', 'Leaving from?', ['TP.HCM', 'Hà Nội', 'Đà Nẵng', 'Nơi khác'], ['HCMC', 'Hanoi', 'Da Nang', 'Elsewhere']))
    if (!party) missing.push(PARTY_T)
    if (!budget) missing.push(q('budget', 'Ngân sách cả chuyến?', 'Total budget?', ['Dưới 3tr', '3-7tr', '7-15tr', 'Trên 15tr'], ['Under 3M', '3-7M', '7-15M', 'Over 15M']))
    if (!style) missing.push(q('style', 'Thích kiểu gì?', 'What style?', ['Biển', 'Núi', 'Ăn uống', 'Nghỉ dưỡng'], ['Beach', 'Mountains', 'Food', 'Resort']))
    if (!transport) missing.push(q('transport', 'Đi bằng gì?', 'How will you travel?', ['Máy bay', 'Xe khách', 'Xe riêng'], ['Fly', 'Bus', 'Drive']))
    // A trip with a set destination needs dates before the rest; an open "đi đâu" ask leads with taste.
  }
  const queryParts = kind === 'flight' ? ['vé máy bay', origin ?? '', dest ?? '', flightTime ?? '']
    : kind === 'ticket' ? [transport ?? 'vé xe', origin ?? '', dest ?? '']
      : kind === 'hotel' ? ['khách sạn', style ?? ''] : dest ? ['khách sạn', style === 'biển' ? 'gần biển' : style ?? ''] : ['điểm du lịch', origin ? `gần ${origin}` : '', style ?? '']
  const assumptions: string[] = []
  if (!party) assumptions.push('2 người')
  if (!budget) assumptions.push('Ngân sách tầm trung')
  const lead = kind === 'flight' ? { vi: `Để tìm chuyến bay${origin && dest ? ` ${origin} – ${dest}` : ''} hợp nhất:`, en: 'To find the best flight:' }
    : dest ? { vi: `Để lên chuyến ${dest} vừa ý:`, en: `To plan your ${dest} trip:` } : { vi: 'Để chọn điểm đến hợp nhất:', en: 'To pick the right destination:' }
  return { known, count, enough, missing, queryParts, area: dest ?? undefined, assumptions, lead }
}

function entView(t: Txt, gps: boolean): SlotView {
  const activity = activityOf(t)
  const party = partyOf(t), time = timeOf(t), vibe = vibeOf(t), budget = budgetOf(t)
  let area = localAreaOf(t)
  if (area === 'gần bạn' && !gps) area = null
  const known: Record<string, string> = {}
  if (activity) known.hoat_dong = activity
  if (party) known.so_nguoi = party
  if (time) known.thoi_gian = time
  if (area) known.khu_vuc = area
  if (vibe) known.khong_khi = vibe
  if (budget) known.ngan_sach = budget
  const count = [activity, party, time, area, vibe, budget].filter(Boolean).length
  const date = W('hen ho|nguoi yeu|ny|date|ban gai|ban trai').test(t.f)
  const kids = W('dan con|voi con|cho con|con \\d+ tuoi|be \\d+ tuoi|cho be|tui nho|con nit|tre con|kids?').test(t.f)
  const missing: Q[] = []
  // R11: a concert / show / festival is chosen by WHO and HOW MUCH the ticket is — not "chiều nay hay tối
  // nay" or "sôi động hay chill" (the user said "tháng 10"). Ticket questions only.
  const event = W('concert|live ?show|liveshow|dai nhac hoi|nhac hoi|fan ?meeting|fanmeet|festival|show dien|show ca nhac|mini ?show|nhac kich|vo kich|xem kich|su kien|stand ?up|hai doc thoai|ve xem').test(t.f)
  if (event) {
    const artist = grab(t, /\b(?:cua|xem|nghe)\s+([a-z0-9 ]{2,30}?)(?=\s+(?:thang|tuan|cuoi|o|tai|ngay)\b|[,.!?]|$)/, 1)
    if (artist) known.nghe_si = artist
    if (!artist) missing.push(q('artist', 'Ca sĩ / thể loại?', 'Artist / genre?', ['Chưa biết', 'Nhạc trẻ / pop', 'Rap / hip-hop', 'Indie / acoustic'], ['Not sure', 'Pop', 'Rap / hip-hop', 'Indie / acoustic']))
    if (!party) missing.push(q('party', 'Mấy người đi?', 'How many going?', ['1 người', '2 người', 'Nhóm 3-5', 'Nhóm đông'], ['1', '2', '3-5', 'Big group']))
    if (!budget) missing.push(q('budget', 'Giá vé mỗi người?', 'Ticket budget per person?', ['Dưới 500k', '500k-1tr', '1-2tr', 'Trên 2tr'], ['Under 500k', '500k-1m', '1-2m', 'Over 2m']))
    const eventWord = ({ 'nhac kich': 'nhạc kịch', 'vo kich': 'kịch', 'xem kich': 'kịch' } as Record<string, string>)[/concert|live ?show|liveshow|festival|fan ?meeting|nhac kich|vo kich|xem kich|stand ?up/.exec(t.f)?.[0] ?? ''] ?? (/concert|live ?show|liveshow|festival|fan ?meeting|stand ?up/.exec(t.f)?.[0] ?? 'sự kiện')
    return {
      known, count: [artist, party, budget].filter(Boolean).length, enough: missing.length === 0 || (!!party && !!budget) || missing.length < 2,
      missing, queryParts: [eventWord, artist ?? ''], area: area ?? undefined,
      assumptions: [...(party ? [] : ['1-2 người']), ...(budget ? [] : ['Mức vé phổ thông'])],
      lead: { vi: `Để chọn ${eventWord === 'sự kiện' ? 'sự kiện' : eventWord} hợp với bạn:`, en: 'To pick the right show:' },
    }
  }
  if (!activity) missing.push(date ? q('activity', 'Muốn đi đâu?', 'What would you like to do?', ['Cafe/rooftop', 'Xem phim', 'Bar nhạc sống', 'Dạo phố'], ['Café/rooftop', 'Movie', 'Live-music bar', 'Stroll'])
    : kids ? q('activity', 'Cho bé chơi gì?', 'What for the kids?', ['Khu vui chơi', 'Công viên', 'Thủy cung/bảo tàng', 'Xem phim'], ['Play center', 'Park', 'Aquarium/museum', 'Movie'])
      : q('activity', 'Muốn chơi gì?', 'What would you like to do?', ['Karaoke', 'Xem phim', 'Bar/pub', 'Bida/bowling'], ['Karaoke', 'Movie', 'Bar/pub', 'Billiards/bowling']))
  if (!party) missing.push(q('party', 'Mấy người / đi với ai?', 'How many / with whom?', ['1 mình', '2 người', 'Nhóm 3-5', 'Nhóm đông'], ['Solo', '2 people', 'Group 3-5', 'Big group']))
  if (!time) missing.push(q('time', 'Đi lúc mấy giờ?', 'What time?', ['Chiều nay', 'Tối nay', 'Cuối tuần'], ['This afternoon', 'Tonight', 'Weekend']))
  if (!area && !gps) missing.push(AREA_Q(gps))
  if (!vibe) missing.push(q('vibe', 'Sôi động hay chill?', 'Lively or chill?', ['Sôi động', 'Chill', 'Lãng mạn'], ['Lively', 'Chill', 'Romantic']))
  if (!budget) missing.push(q('budget', 'Ngân sách mỗi người?', 'Budget per person?', ['Dưới 200k', '200-500k', 'Trên 500k'], ['Under 200k', '200-500k', 'Over 500k']))
  if (!area && gps) missing.push(AREA_Q(gps))
  const queryParts = [activity ?? (kids ? 'khu vui chơi trẻ em' : date ? 'địa điểm hẹn hò' : 'chỗ đi chơi'), vibe ?? '', party && /\d/.test(party) && Number(party.split(' ')[0]) >= 5 ? 'cho nhóm' : '']
  const assumptions: string[] = []
  if (!party) assumptions.push('Nhóm nhỏ 2-4 người')
  if (!time) assumptions.push('Tối nay')
  if (!budget) assumptions.push('Mức giá tầm trung')
  return { known, count, enough: !!activity && count >= 3, missing, queryParts, area: area && area !== 'gần bạn' ? area : undefined, assumptions,
    lead: { vi: activity ? `Để chọn chỗ ${activity} hợp nhất:` : 'Để gợi ý chỗ chơi hợp nhất:', en: 'To pick the right spot:' } }
}

function spaView(t: Txt, gps: boolean): SlotView {
  const svc = serviceOf(t)
  const budget = budgetOf(t), time = timeOf(t)
  let area = localAreaOf(t)
  if (area === 'gần bạn' && !gps) area = null
  const special = label(t, SPECIAL)
  const known: Record<string, string> = {}
  if (svc && !svc.vague) known.dich_vu = svc.label
  if (area) known.khu_vuc = area
  if (budget) known.ngan_sach = budget
  if (time) known.thoi_gian = time
  if (special) known.yeu_cau_rieng = special
  const svcKnown = svc && !svc.vague
  const count = [svcKnown ? 'y' : null, area, budget, time, special].filter(Boolean).length
  const missing: Q[] = []
  if (!svcKnown) {
    missing.push(svc?.label === 'làm đẹp' ? q('service', 'Muốn làm gì?', 'Which service?', ['Nail', 'Tóc', 'Da mặt', 'Trang điểm'], ['Nails', 'Hair', 'Facial', 'Makeup'])
      : q('service', 'Muốn làm dịch vụ gì?', 'Which service?', ['Massage', 'Gội đầu dưỡng sinh', 'Xông hơi', 'Chăm sóc da'], ['Massage', 'Head spa', 'Sauna', 'Facial']))
  } else if (svc?.variant && !svc.variant.known.test(t.f)) missing.push(svc.variant.q)
  if (!area && !gps) missing.push(AREA_Q(gps))
  if (!budget) missing.push(q('budget', 'Tầm giá bao nhiêu?', 'Price range?', ['Dưới 200k', '200-500k', '500k-1tr', 'Trên 1tr'], ['Under 200k', '200-500k', '500k-1M', 'Over 1M']))
  if (!time) missing.push(q('time', 'Khi nào đi?', 'When?', ['Hôm nay', 'Tối nay', 'Cuối tuần'], ['Today', 'Tonight', 'Weekend']))
  // Therapist / room requests only matter for body treatments, not for a gym, nails or a haircut.
  const bodyCare = !svcKnown || ['massage', 'gội đầu dưỡng sinh', 'xông hơi', 'chăm sóc da', 'waxing', 'tắm trắng', 'bấm huyệt'].includes(svc!.label)
  if (!special && bodyCare) missing.push(q('special', 'Yêu cầu riêng?', 'Any special request?', ['KTV nữ', 'KTV nam', 'Phòng riêng', 'Không'], ['Female therapist', 'Male therapist', 'Private room', 'None']))
  if (!area && gps) missing.push(AREA_Q(gps))
  const styleWord = svc?.variant ? grab(t, svc.variant.known) : null
  const queryParts = [svcKnown ? svc!.label : svc?.label === 'làm đẹp' ? 'tiệm làm đẹp' : 'spa thư giãn', styleWord ?? '', special ?? '']
  const assumptions: string[] = []
  if (!budget) assumptions.push('Mức giá tầm trung')
  if (!time) assumptions.push('Đi trong hôm nay')
  return { known, count, enough: !!svcKnown && count >= 3, missing, queryParts, area: area && area !== 'gần bạn' ? area : undefined, assumptions,
    lead: { vi: svcKnown ? `Để chọn đúng chỗ ${svc!.label} cho bạn:` : 'Để chọn đúng chỗ thư giãn cho bạn:', en: 'To pick the right place for you:' } }
}

export function slotView(domain: ConsultDomain, text: string, gps: boolean): SlotView {
  const t = prep(text)
  switch (domain) {
    case 'food': return foodView(t, gps)
    case 'shopping': return shoppingView(t)
    case 'travel': return travelView(t)
    case 'entertainment': return entView(t, gps)
    case 'spa': return spaView(t, gps)
  }
}

// ── Turn-type rules (conversation state) ───────────────────────────────────────────────────────

const PLAN_RE = /\b(?:len (?:ke hoach|lich trinh|lich|plan)|lap ke hoach|ke hoach chi tiet|lich trinh chi tiet|ok chot|chot|dat (?:mon|ban|phong|ve|lich|cho)?\s*(?:do|nay)?\s*luon|book luon|huong dan (?:dat|mua|book|di)|make a plan|plan it|go with (?:it|that))\b/
const MORE_RE = /\b(?:xem them|goi y them|them (?:vai|mot vai|mot so|may)?\s*(?:cho|quan|lua chon|goi y|mau|tiem|noi)|con (?:cho|quan|mau|tiem|khach san|chuyen|spa|cai|noi|dia diem|lua chon)?\s*(?:nao|gi)?\s*(?:khac|nua)|con (?:cho|quan|mau|tiem|khach san|chuyen|spa|cai|noi|dia diem)\s*nao\s*(?:khong|ko)|lua chon khac|show more|more options|any others?)\b/
const COMPARE_RE = /\b(?:(?:cai|cho|quan|noi|mau|chuyen|khach san|tiem|ben|con) nao (?:(?:tot|ngon|re|dang|hop|on|dep|dang tien|nen chon)\s*)?hon|nen chon (?:cai|cho|quan|mau|ben|chuyen) nao|so sanh|hay (?:cho|cai|mau|chuyen|quan|tiem|ben|noi|khach san|con) kia|which is better|compare)\b/
const NEGATIVE_RE = /\b(?:khong|ko|k|hong|chang|cha)\s+(?:thich|muon|hop|ung|can|phu hop|ok|on lam)\b|\b(?:xa|mac|dat|on|on ao|dong|nho|nang|som|tre|muon|cham|cu|xau|chat|hep|nong|lanh|kho|dat do|ban|toi|to|cao|thap)\s+qua\b|\bqua\s+(?:xa|mac|dat|on|dong|nho|nang|som|tre)\b|\b(?:di|co|thu|an|xem|mua|den)\s+roi\b|\b(?:cho|quan|tiem|mau|cai|noi|khach san|chuyen|spa) khac\b|\bkhac di\b|\b(?:too (?:far|expensive|noisy|busy)|don'?t like|not (?:this|that|these))\b/
const REFINE_RE = /^(?:muon|can|thich|uu tien|chi|phai|nen|lay)\b|\b\w+ hon\b|\b(?:sau|truoc) \d{1,2}\s?h\b|\bduoi \d|\bthoi\s*$/
const DEICTIC_RE = /\b(?:cho|quan|tiem|khach san|noi|cai|mau|chuyen|spa|mon|ben|nha hang) (?:do|nay|dau tien|thu (?:hai|2|nhat))\b|\b(?:it|that one|this one)\b/
const QUESTION_RE = /\?|\b(?:khong|ko|hong|chua|bao lau|bao nhieu|may|gi|sao|nao|o dau|the nao|khi nao|nhu the nao|nhieu khong)\b/

const BUTTON_MORE = new Set(['xem them', 'goi y them', 'con cho nao khac', 'show more', 'more'])
const BUTTON_PLAN = new Set(['len ke hoach chi tiet', 'len ke hoach', 'ok chot', 'chot', 'plan it', 'make a detailed plan'])

const GENERIC_NAME_PREFIX = /^(?:karaoke|quan|nha hang|spa|khach san|tiem|salon|cafe|ca phe|hotel|resort|homestay|chuyen bay|hang|cua hang|shop|bar|pub|rap|cgv|trung tam|tiem nail|nail|barber|op|vietjet|vietnam airlines|bamboo)\s+/

/** Bold names in an assistant reply ("**Mình chọn: Karaoke MEI**" → "Karaoke MEI"). */
export function boldNames(assistantText: string): string[] {
  const out: string[] = []
  for (const m of assistantText.matchAll(/\*\*([^*\n]{2,80})\*\*/g)) {
    let n = m[1].replace(/^\s*(?:mình chọn|lựa chọn chính|chọn chính|top pick|my pick|gợi ý|pick)\s*[:：-]\s*/i, '').replace(/[:：]\s*$/, '').trim()
    if (!n || /^(?:lưu ý|mẹo|tóm lại|note|tip|vì sao|why)$/i.test(n)) continue
    n = n.slice(0, 60)
    if (!out.includes(n)) out.push(n)
  }
  return out.slice(0, 8)
}
function namesIn(t: Txt, names: string[]): string[] {
  const hit: string[] = []
  for (const name of names) {
    const nf = prep(name).f.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!nf) continue
    const core = nf.replace(GENERIC_NAME_PREFIX, '').trim()
    const hay = t.f.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')
    if (hay.includes(nf) || (core.length >= 3 && new RegExp(`\\b${core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay))) hit.push(name)
  }
  return hit
}

// ── The router ─────────────────────────────────────────────────────────────────────────────────

function toAsk(view: SlotView, lang: string, domains: ConsultDomain[]): ConsultDecision['ask'] | undefined {
  const en = lang === 'en'
  const qs: AskQuestion[] = view.missing.slice(0, 3).map(m => ({ id: m.id, q: en ? m.en : m.vi, options: (en ? m.oEn : m.o).slice(0, 4) }))
  if (qs.length < 2) return undefined
  let lead = en ? view.lead.en : view.lead.vi
  if (domains.length > 1) lead = en ? 'To plan the whole outing:' : 'Để lên trọn buổi cho bạn:'
  return { lead, questions: qs }
}
const joinQuery = (parts: string[]) => parts.map(p => p.trim()).filter(Boolean).filter((p, i, a) => a.indexOf(p) === i).join(' ').replace(/\s+/g, ' ').slice(0, 120)

const REJECT_MOD: Array<[RegExp, string]> = [
  [/\bxa qua\b|\bqua xa\b|\btoo far\b/, 'gần hơn'], [/\b(?:mac|dat|dat do) qua\b|\bqua (?:mac|dat)\b|\btoo expensive\b/, 'giá rẻ'],
  [/\b(?:on|on ao|dong) qua\b|\bqua (?:on|dong)\b/, 'yên tĩnh'], [/\bnang qua\b/, 'nhẹ'], [/\bnho qua\b/, 'rộng rãi'], [/\bcu qua\b/, 'mới'],
]
function rejectModifier(t: Txt): string {
  for (const [re, v] of REJECT_MOD) if (re.test(t.f)) return v
  const want = grab(t, /\b(?:muon|thich|can|uu tien)\s+([a-z0-9 ]{2,30}?)(?:\s+hon)?(?:[,.!?]|$)/, 1)
  if (want) return want.replace(/\s+hơn$/, '')
  const near = grab(t, /\bgan [a-z0-9 ]{2,20}?(?=\s+thoi|[,.!?]|$)/)
  if (near) return near
  const after = grab(t, /\b(?:sau|truoc) \d{1,2}\s?h\b/)
  return after ?? ''
}

interface Msg { role: string; content: unknown }
interface Thread { domains: ConsultDomain[]; start: number }
interface TurnOut { result: RouteResult; thread: Thread }

/** Routes the user turn at `ui` given the consultation `thread` it continues. */
function routeTurn(turns: Msg[], ui: number, thread: Thread, ctx: RouteCtx): TurnOut {
  const lang = ctx.lang === 'en' ? 'en' : 'vi'
  const userText = stripMarkers(textOf(turns[ui].content)).trim()
  let prevAssistant = ''
  for (let i = ui - 1; i >= 0; i--) if (turns[i].role === 'assistant') { prevAssistant = textOf(turns[i].content); break }
  const t = prep(userText)
  const fq = t.f.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  // Replay TRAVEL-3/SHOP-3: a follow-up / compare / more turn carried `known: {}`, so the state block lost the
  // route, date and people the user already gave and the model asked for them again. An in-thread turn
  // always carries what the thread's user turns stated.
  function threadKnown(): Record<string, string> {
    if (!thread.domains.length) return {}
    const parts: string[] = []
    for (let i = Math.max(0, thread.start); i <= ui; i++) if (turns[i].role === 'user') parts.push(stripMarkers(textOf(turns[i].content)))
    return slotView(thread.domains[0], parts.join(' . '), ctx.hasGps).known
  }
  const keep = (d: Partial<ConsultDecision> & { turn: ConsultTurn }, confidence: RouteConfidence = 'rule'): TurnOut =>
    ({ result: { decision: { domains: [], assumptions: [], ...d, known: d.known && Object.keys(d.known).length ? d.known : d.turn === 'chat' ? {} : threadKnown() }, confidence }, thread })
  const start = (d: Partial<ConsultDecision> & { turn: ConsultTurn; domains: ConsultDomain[] }, confidence: RouteConfidence = 'rule'): TurnOut =>
    ({ result: { decision: { known: {}, assumptions: [], ...d }, confidence }, thread: d.domains.length ? { domains: d.domains, start: ui } : thread })

  if (!fq) return keep({ turn: 'chat' })

  const threadText = (from: number) => {
    const parts: string[] = []
    for (let i = Math.max(0, from); i <= ui; i++) if (turns[i].role === 'user') parts.push(stripMarkers(textOf(turns[i].content)))
    return parts.join(' . ')
  }
  const cur = detectAreas(userText)
  // The picks under discussion: the NEAREST reply that named any (replay SHOP-3: a follow-up answer with no
  // bold name made the next "X hay chỗ kia?" read as a brand-new request and ASK again).
  // Merged over the thread's last 3 replies, newest first (replay FOOD-3: a follow-up answer bolded
  // "gọi quán trực tiếp", which hid the picks and made "A hay B?" a new request).
  let names = boldNames(prevAssistant)
  for (let i = ui - 1, seen = 0; i >= Math.max(0, thread.start) && seen < 3; i--) {
    if (turns[i].role !== 'assistant') continue
    seen++
    for (const n of boldNames(textOf(turns[i].content))) if (!names.includes(n)) names.push(n)
  }
  names = names.slice(0, 16)
  const inThread = thread.domains.length > 0

  const pickFrom = (domains: ConsultDomain[], text: string, turn: 'pick' | 'reject', extra: Partial<ConsultDecision> = {}): RouteResult => {
    const view = slotView(domains[0], text, ctx.hasGps)
    const mod = turn === 'reject' ? rejectModifier(t) : ''
    return { decision: { domains, turn, known: view.known, assumptions: turn === 'pick' ? view.assumptions : [], query: joinQuery([...view.queryParts, mod]), ...(view.area ? { area: view.area } : {}), ...extra }, confidence: 'rule' }
  }

  // 1. Exact button texts (before the ask-answer rule: "xem thêm" after an ask is still "more").
  if (BUTTON_MORE.has(fq)) return keep({ domains: thread.domains, turn: 'more' }, inThread ? 'rule' : 'unsure')
  if (BUTTON_PLAN.has(fq)) return keep({ domains: thread.domains, turn: 'plan', known: inThread ? slotView(thread.domains[0], threadText(thread.start), ctx.hasGps).known : {} }, inThread ? 'rule' : 'unsure')

  // 2. The previous Tappy turn asked → this is the answer: pick (never ask twice).
  if (wasAskReply(prevAssistant)) {
    const fresh = cur.domains.length > 0 && !thread.domains.some(d => cur.domains.includes(d)) && cur.hits.some(h => h.w >= 3)
    if (fresh) return { result: pickFrom(cur.domains, userText, 'pick'), thread: { domains: cur.domains, start: ui } }
    if (!inThread) return keep({ turn: 'pick', domains: cur.domains }, 'unsure')
    return { result: pickFrom(thread.domains, threadText(thread.start), 'pick'), thread }
  }

  // 3. Turns about picks already shown.
  if (names.length && inThread) {
    const domains = thread.domains
    const refs = namesIn(t, names)
    const newArea = cur.domains.length > 0 && !cur.domains.some(d => domains.includes(d)) && cur.hits.some(h => h.w >= 3)
    const isQ = QUESTION_RE.test(t.f)
    const deictic = DEICTIC_RE.test(t.f)
    const negative = NEGATIVE_RE.test(t.f)
    if (PLAN_RE.test(t.f)) return keep({ domains, turn: 'plan', known: slotView(domains[0], threadText(thread.start), ctx.hasGps).known, ...(refs.length ? { refers: refs } : {}) })
    if (MORE_RE.test(t.f)) return keep({ domains, turn: 'more' })
    // "A hay B?" in a thread is a comparison even when a side is not a name shown before.
    const pair = /^(.{3,80}?)\s+hay(?:\s+là)?\s+(.{3,80}?)\s*(?:hơn)?\s*\??$/i.exec(userText.trim())
    if (refs.length >= 2 || (refs.length === 1 && /\bhay\b/.test(t.f)) || COMPARE_RE.test(t.f) || (pair && !newArea)) {
      const pairRefs = pair ? [pair[1].trim(), pair[2].trim()].filter(x => !/^(?:chỗ|cái|quán|mẫu|chuyến)\s+(?:kia|đó|này)$/i.test(x)) : []
      const refers = refs.length >= 2 ? refs : refs.length === 1 ? [refs[0], ...names.filter(n => n !== refs[0]).slice(0, 1)] : pairRefs.length ? pairRefs : names.slice(0, 2)
      return keep({ domains, turn: 'compare', refers })
    }
    if ((refs.length || deictic) && isQ && !negative) return keep({ domains, turn: 'followup', refers: refs.length ? refs : names.slice(0, 1) })
    if (negative) return { result: pickFrom(domains, threadText(thread.start), 'reject', { rejectReason: userText.slice(0, 160) }), thread }
    if (refs.length) return keep({ domains, turn: 'followup', refers: refs })
    if (!newArea && REFINE_RE.test(t.f)) return { result: pickFrom(domains, threadText(thread.start), 'reject', { rejectReason: userText.slice(0, 160) }), thread }
    if (!newArea && !cur.domains.length) {
      // About the picks, but no rule places it: a question → followup; anything else → the brain.
      if (isQ || deictic) return keep({ domains, turn: 'followup', refers: names.slice(0, 1) })
      return keep({ domains, turn: 'reject', rejectReason: userText.slice(0, 160) }, 'unsure')
    }
  }

  // 4. A new request.
  if (!cur.domains.length) {
    if (GREETING.test(fq) || OUT_OF_SCOPE.test(t.f)) return keep({ turn: 'chat' })
    return keep({ turn: 'chat' }, 'unsure')
  }
  const domains = cur.domains
  const conf: RouteConfidence = cur.conflict ? 'unsure' : 'rule'
  if (KNOWLEDGE.test(t.f)) return start({ domains, turn: 'chat', known: slotView(domains[0], userText, ctx.hasGps).known }, conf)
  const view = slotView(domains[0], userText, ctx.hasGps)
  const ask = view.enough ? undefined : toAsk(view, lang, domains)
  if (!ask) return start({ domains, turn: 'pick', known: view.known, assumptions: view.assumptions, query: joinQuery(view.queryParts), ...(view.area ? { area: view.area } : {}) }, conf)
  return start({ domains, turn: 'ask', known: view.known, ask, ...(view.area ? { area: view.area } : {}) }, conf)
}

/**
 * Routes the LAST user turn deterministically (0 LLM, 0 search). The conversation is replayed
 * forward over its last few turns so a follow-up knows which consultation it belongs to.
 * `confidence: 'unsure'` → the rules could not read the intent; the caller asks the LLM brain.
 */
export function routeConsult(messages: Array<{ role: string; content: unknown }>, ctx: RouteCtx): RouteResult {
  const turns = messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-16)
  let thread: Thread = { domains: [], start: -1 }
  let last: RouteResult | null = null
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].role !== 'user') continue
    const out = routeTurn(turns, i, thread, ctx)
    thread = out.thread
    last = out.result
  }
  return last ?? { decision: { domains: [], turn: 'chat', known: {}, assumptions: [] }, confidence: 'rule' }
}
