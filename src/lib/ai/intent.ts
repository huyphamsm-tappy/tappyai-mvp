export function normalizeVN(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

export function classifyIntent(text: string): 'chitchat' | 'tool' {
  const t = normalizeVN(text.toLowerCase().trim())
  if (t.length === 0 || t.length > 40) return 'tool'
  const chitchat = /^(chao|hi|hello|alo|xin chao|cam on|thank|thanks|ok|oke|okie|uh|u|um|tam biet|bye|haha|hehe|hihi|ban la ai|ban ten gi|tappyai la gi|test)/i
  return chitchat.test(t) ? 'chitchat' : 'tool'
}

const COMPLEX_KW = /\b(restaurant|spa|hotel|nha hang|khach san|quan an|cafe|dat cho|goi y|tim kiem|san pham|mua|gia|review|danh gia|ban do|chi duong|lich trinh|tour|may bay|dat phong|booking|order|delivery|thoi tiet|tin tuc|vang|xe|taxi|shop|cua hang|tiem|quan|menu|dich vu|khu vuc|thanh pho|tinh|distric|street|road|duong|pho)\b/i

export function isSimpleQuery(text: string, isFirstMsg: boolean): boolean {
  return text.trim().length < 80 && !COMPLEX_KW.test(normalizeVN(text)) && isFirstMsg
}

// Bug (2026-07-29): the previous heuristic treated ANY non-ASCII codepoint
// that wasn't a recognized Asian script as "must be Vietnamese". Phone/desktop
// autocorrect routinely inserts non-ASCII punctuation into otherwise-English
// text — curly quotes ’ ‘ “ ”, en/em dashes – —, ellipsis …, non-breaking
// space — and incidental accented loanwords (café, naïve, façade) are
// ordinary English. All of these silently flipped an English message to 'vi',
// which suppressed the language-override block in promptBuilder.ts and let
// the (Vietnamese-language) base prompt answer in Vietnamese despite the user
// writing in English. Fix: only codepoints that are DISTINCTIVELY Vietnamese
// (đ/Đ, ă/â/ê/ô/ơ/ư and the full Vietnamese tone-mark block) count as a
// Vietnamese signal; everything else that isn't a recognized script falls
// through to 'en', matching the "pure Latin script, no Vietnamese marks" case.
function isVietnameseSignal(cp: number): boolean {
  if (cp === 0x0110 || cp === 0x0111) return true // Đ đ
  if (cp === 0x0102 || cp === 0x0103) return true // Ă ă
  if (cp === 0x00C2 || cp === 0x00E2) return true // Â â
  if (cp === 0x00CA || cp === 0x00EA) return true // Ê ê
  if (cp === 0x00D4 || cp === 0x00F4) return true // Ô ô
  if (cp === 0x01A0 || cp === 0x01A1) return true // Ơ ơ
  if (cp === 0x01AF || cp === 0x01B0) return true // Ư ư
  // Latin Extended Additional (U+1EA0-1EF9): every toned Vietnamese vowel
  // combination (ấ ầ ẩ ẫ ậ ắ ằ ẳ ẵ ặ ế ề ể ễ ệ ố ồ ổ ỗ ộ ớ ờ ở ỡ ợ ứ ừ ử ữ ự
  // ỳ ỵ ỷ ỹ, etc.) — not used by any other language in this app's scope.
  if (cp >= 0x1EA0 && cp <= 0x1EF9) return true
  return false
}

export function detectLang(text: string): string {
  // Encoding-safe: never short-circuits mid-loop for scripts that must scan to
  // completion (Chinese text with fullwidth punctuation still resolves to 'zh').
  let hasCJK = false
  let hasViSignal = false
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp <= 0x7F) continue
    if (cp >= 0x3040 && cp <= 0x30FF) return 'ja'       // kana (exclusive to Japanese)
    if (cp >= 0xAC00 && cp <= 0xD7AF) return 'ko'       // hangul
    // CJK Unified + fullwidth block (fullwidth punct common in Chinese text)
    if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0xFF00 && cp <= 0xFFEF)) { hasCJK = true; continue }
    if (cp >= 0x0600 && cp <= 0x06FF) return 'ar'       // Arabic
    if (cp >= 0x0E00 && cp <= 0x0E7F) return 'th'       // Thai
    if (isVietnameseSignal(cp)) { hasViSignal = true; continue }
    // any other non-ASCII (smart punctuation, incidental Latin diacritics
    // from loanwords/other Latin-script languages) — not a language signal
  }
  if (hasCJK) return 'zh'
  if (hasViSignal) return 'vi'
  return 'en'
}

// Language names this app can explicitly instruct the model to answer in —
// must stay in sync with LANG_NAMES in promptBuilder.ts and LANG_BCP47 in
// lib/tts/voiceSelection.ts (same code set: vi/en/ja/ko/zh/ar/th).
type ExplicitLang = 'vi' | 'en' | 'ja' | 'ko' | 'zh' | 'ar' | 'th'

// English and diacritic-stripped-Vietnamese (matched against normalizeVN()
// output) names for each language, used to recognize an explicit request.
const LANG_NAME_EN: Record<ExplicitLang, string> = {
  vi: 'vietnamese', en: 'english', ja: 'japanese', ko: 'korean',
  zh: '(?:chinese|mandarin)', ar: 'arabic', th: 'thai',
}
const LANG_NAME_VI: Record<ExplicitLang, string> = {
  vi: 'tieng\\s*viet', en: 'tieng\\s*anh', ja: 'tieng\\s*nhat', ko: 'tieng\\s*han',
  zh: 'tieng\\s*trung', ar: 'tieng\\s*a\\s*rap', th: 'tieng\\s*thai',
}

/**
 * Detects an EXPLICIT instruction to answer in a given language — e.g.
 * "Answer in English", "Trả lời bằng tiếng Việt", "Please respond in
 * Japanese". Per spec, this must override the mirror-the-message default.
 * Returns null when the message carries no such instruction (the normal
 * case), so the caller falls back to detectLang(). Single call site
 * (src/app/api/chat/route.ts) — not duplicated per AI capability.
 */
export function detectExplicitLangRequest(text: string): ExplicitLang | null {
  const norm = normalizeVN(text.toLowerCase())
  for (const code of Object.keys(LANG_NAME_EN) as ExplicitLang[]) {
    const en = LANG_NAME_EN[code]
    const vi = LANG_NAME_VI[code]
    const re = new RegExp(
      `\\b(?:answer|respond|reply|speak)\\b[^.!?\\n]{0,20}\\b${en}\\b` +
      `|\\b(?:in|switch to)\\s+${en}\\b(?:\\s+please)?\\b` +
      `|\\b(?:tra\\s*loi|noi|dung)\\b[^.!?\\n]{0,15}\\b${vi}\\b`,
      'i'
    )
    if (re.test(norm)) return code
  }
  return null
}

export function detectForcedTool(text: string): 'search_places' | 'get_news' | 'search_products' | 'web_search' | 'get_weather' | 'get_gold_price' | 'get_flight_prices' | 'get_hotel_prices' | 'get_transport_options' | 'save_price_watch' | null {
  const t = normalizeVN(text.toLowerCase().trim())
  if (/theo doi gia|bao minh khi gia|alert gia|gia xuong|theo doi san pham|khi gia duoi|khi gia ve|when price|price alert/.test(t)) return 'save_price_watch'
  if (/ve may bay|chuyen bay|bay tu|bay den|hang khong|gia ve bay|dat ve bay|vietjet|bamboo airways|pacific airlines|vietnam airlines/.test(t)) return 'get_flight_prices'
  if (/gia phong|gia khach san|dat phong|booking\.com|\bagoda\b|(khach san|hotel|resort).*gia|gia.*(khach san|hotel|resort)/.test(t)) return 'get_hotel_prices'
  if (/xe khach|ve xe (khach|do)|limousine|tau hoa|tau lua|duong sat|\btaxi\b|\bgrab\b|xanh sm|\bxe om\b|di chuyen (tu|den|toi|trong|quanh)|gia ve xe|tu .* den .* (bao nhieu|het|gia|bang gi)/.test(t)) return 'get_transport_options'
  if (/nha hang|quan an|an gi|an ngon|cafe|ca phe|coffee|\bspa\b|massage|khach san|\bhotel\b|resort|\bbar\b|\bpub\b|\bgym\b|fitness|rap chieu|cinema|xem phim|benh vien|hospital|clinic|pharmacy|nha thuoc|\batm\b|ngan hang|\bbank\b|dia diem|o dau|gan day|gan toi|\btiem\b|tham quan|thang canh|diem du lich|danh lam|bao tang|khu du lich/.test(t)) return 'search_places'
  if (/tin tuc|tin moi|bao chi|thoi su|tin nong|tin the gioi/.test(t)) return 'get_news'
  if (/\bmua\b|san pham|shopee|tiki|lazada|dat hang|order hang/.test(t)) return 'search_products'
  if (/gia vang|vang sjc|vang 9999|vang mieng|vang nhan|gia vang the gioi|xau\s*\/?\s*usd/.test(t)) return 'get_gold_price'
  if (/thoi tiet|du bao|nhiet do|troi mua|troi nang|troi co lanh|may co|nang khong|mua khong/.test(t)) return 'get_weather'
  if (/ty gia|hoi suat|gia xang|gia dau|ket qua|\bti so\b|diem so|ai la|tong thong|thu tuong|chu tich|vn-index|chung khoan|xo so|lich am|ngay bao nhieu|\?|nghia la|nhu the nao|khi nao|vi sao|tai sao|moi nhat|cap nhat|hien nay|hien tai/.test(t)) return 'web_search'
  return null
}

export function detectPlanningIntent(text: string): 'trip' | 'evening' | null {
  const t = normalizeVN(text.toLowerCase())

  // Evening: "tối nay" + multi-activity OR explicit plan request
  const hasToiNay = t.includes('toi nay')
  const hasEvening = t.includes('buoi toi') || t.includes('chieu toi')
  const hasMultiActivity =
    (t.includes('spa') || t.includes('massage') || t.includes('xem phim') || t.includes('phim') || t.includes('karaoke') || t.includes('bar') || t.includes('nhau')) &&
    (t.includes('an') || t.includes('cafe') || t.includes('ca phe'))
  const hasPlanKeyword = t.includes('lich trinh') || t.includes('ke hoach') || t.includes('lap ke') || t.includes('goi y lich')
  if ((hasToiNay || hasEvening) && (hasMultiActivity || hasPlanKeyword)) return 'evening'

  // Trip: destination + (days/nights pattern OR budget pattern OR trip keyword)
  const hasDays = /\d+\s*(ngay|dem|night|day)/.test(t)
  const hasBudget = t.includes('budget') || t.includes('ngan sach') || /\d+\s*(trieu|tr\b|million)/.test(t)
  const hasDestination = /(da nang|danang|phu quoc|phuquoc|nha trang|hoi an|hoian|da lat|dalat|vung tau|ha long|halong|sapa|sa pa|ninh binh|hue|ha noi|hanoi|ho chi minh|saigon|can tho|mui ne|con dao|ly son|quy nhon|phan thiet|thai lan|thailand|singapore|nhat ban|japan|han quoc|korea|bali|malaysia|paris|tokyo|osaka|seoul)/.test(t)
  const hasTripKw = t.includes('trip') || t.includes('du lich') || t.includes('di choi') || t.includes('chuyen di') || hasPlanKeyword

  if (hasDays && (hasDestination || hasBudget || hasTripKw)) return 'trip'
  if (hasTripKw && hasDestination) return 'trip'

  return null
}

export function detectLocationIntent(text: string): 'offline' | 'online' | 'unknown' {
  const t = normalizeVN(text.toLowerCase().trim())
  // Online signals
  const onlineRe = /\bonline\b|ship\b|\border\b|giao\s*hang|free\s*ship|voucher|flash\s*sale|\bshopee\b|\blazada\b|\btiki\b|\bsendo\b|mua\s*tren|dat\s*hang\s*online|giao\s*tan\s*noi|\bcod\b|mua\s*online/
  // Offline signals: district names, streets, nearby, physical store
  const offlineRe = /\bq\.\s*\d+\b|\bq\.\s*[a-z]+|\bquan\s+\d+\b|\bquan\s+(binh|phu|go|tan|nha|hoc|can|cu|thu|ba|cau|dong|hai|hoan|tay|thanh)\b|\bphuong\s+\w+|\bhuyen\s+\w+|\bduong\s+[a-z]|\bpho\s+[a-z]|\bgan\s+(day|nha|minh)\b|\bkhu\s+vuc\b|\bo\s+dau\b|\bcho\s+nao\b|\bcua\s*hang\b|\btiem\b|\bchi\s*nhanh\b|\bsieu\s*thi\b|\btrung\s*tam\s*thuong\s*mai\b|\bmall\b|\bplaza\b|\bden\s+(mua|xem)\b|\bghe\s+(qua|toi|vao)\b/
  if (offlineRe.test(t)) return 'offline'
  if (onlineRe.test(t)) return 'online'
  return 'unknown'
}

export function isShoppingQuery(text: string): boolean {
  const t = normalizeVN(text.toLowerCase())
  return /\b(ao|giay|dep|tui\b|dien thoai|laptop|may tinh|tablet|my pham|son moi|nuoc hoa|dong ho|trang suc|kinh mat|balo|sandal|sneaker|boot|hoodie|jacket|legging|vay|dam|quan\s*jean|quan\s*short|do\s*the\s*thao|thoi\s*trang|phu\s*kien|tui\s*xach|vi\s*da|hang\s*hieu)\b/.test(t)
}
