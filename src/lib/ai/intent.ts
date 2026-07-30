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

// Bug #1 (2026-07-29): the original heuristic treated ANY non-ASCII codepoint
// that wasn't a recognized Asian script as "must be Vietnamese" — autocorrect's
// curly quotes/dashes/ellipsis and incidental loanwords (café, naïve) silently
// flipped English messages to 'vi'. Bug #2 (2026-07-30): the first fix for
// bug #1 over-corrected the other way — it flagged Vietnamese on the mere
// PRESENCE of a Vietnamese-exclusive accented letter ANYWHERE in the message,
// so an English sentence correctly naming a Vietnamese place/dish ("Phú Quốc
// itinerary...", "eat Phở") flipped to Vietnamese from that one word alone.
// Fix for both: judge by the PROPORTION of accented words (see
// VI_WORD_RATIO_THRESHOLD below), not presence/absence of any single one.
// Any accented Latin letter — Latin-1 Supplement, Latin Extended-A/B, and
// Latin Extended Additional (the last covers every toned Vietnamese vowel:
// ấ ầ ẩ ẫ ậ ắ ằ ẳ ẵ ặ ế ề ể ễ ệ ố ồ ổ ỗ ộ ớ ờ ở ỡ ợ ứ ừ ử ữ ự ỳ ỵ ỷ ỹ). Deliberately
// broad (not just Vietnamese-exclusive letters) because the ratio check below
// — not exclusivity — is what tells a Vietnamese sentence apart from an
// English one that merely contains an accented loanword or proper noun.
function isAccentedLatin(cp: number): boolean {
  if (cp >= 0x00C0 && cp <= 0x00FF && cp !== 0x00D7 && cp !== 0x00F7) return true // Latin-1 Supplement letters
  if (cp >= 0x0100 && cp <= 0x024F) return true // Latin Extended-A/B (Đ đ Ă ă Ơ ơ Ư ư...)
  if (cp >= 0x1E00 && cp <= 0x1EFF) return true // Latin Extended Additional (Vietnamese tone marks)
  return false
}

const HAS_LETTER = /\p{L}/u
const STARTS_UPPERCASE = /^\p{Lu}/u

// Share of LOWERCASE accented words above which a message reads as Vietnamese.
// Lowercase matters: Vietnamese proper nouns a user names inside an English
// sentence are capitalized (Phú Quốc, Đà Nẵng, Phở), whereas ordinary
// Vietnamese vocabulary mid-sentence is not (bún, ngon, ở, đây). Counting only
// lowercase accented words is what separates "Đà Nẵng hotels" (English, asking
// about a Vietnamese city) from "quán ăn ngon ở đây" (actual Vietnamese).
const VI_WORD_RATIO_THRESHOLD = 0.4

// Diacritic-stripped Vietnamese function words used as a SECOND signal, so a
// short Vietnamese sentence whose words happen to carry few tone marks ("Cho
// tôi xem menu" — 1 accented word in 4) is still recognized. Deliberately
// EXCLUDES: (a) anything that collides with an English word (a, an, the, in,
// to, go, no, so, may, hay, ban, la), and (b) any syllable that appears in
// Vietnamese place names, which are exactly what English queries contain —
// noi/ha (Hà Nội), da/nang (Đà Nẵng), phu/quoc (Phú Quốc), minh (Hồ Chí Minh),
// can/tho (Cần Thơ), lam (Lâm Đồng), hon (Hòn Thơm), nhat (Nhật), quan
// (Quận 1), gia (Gia Lai), hoi/an (Hội An), pho (Phở). One such collision
// would flip an English sentence straight back to Vietnamese — the bug this
// whole function exists to prevent.
const VI_FUNCTION_WORDS = new Set([
  'toi', 'tui', 'tao', 'muon', 'thich', 'biet', 'giup', 'xem', 'cho', 'gi',
  'nao', 'dau', 'khong', 'duoc', 'roi', 'nhe', 'vay', 'nay', 'kia', 'voi',
  'cung', 'nhieu', 'rat', 'sao', 'uong', 'kiem', 'phai', 'chac', 'nua', 'luon',
])

// Two production incidents shaped this function, in opposite directions:
//   2026-07-29 — ANY non-ASCII codepoint that wasn't a recognized Asian script
//     counted as Vietnamese, so autocorrect's curly quotes/dashes/ellipsis and
//     loanwords (café, naïve) flipped English messages to 'vi'.
//   2026-07-30 — the fix for that flagged Vietnamese on the PRESENCE of any
//     Vietnamese-exclusive letter anywhere in the message, so an English
//     sentence correctly naming a Vietnamese place or dish ("Phú Quốc
//     itinerary, 4 days, 2 people, 8M budget", "i wanna go to eat Phở")
//     flipped to Vietnamese off that single word.
// Both stem from treating one character as proof of a language. This version
// weighs the message as a whole instead: lowercase-accented-word share, plus
// Vietnamese function words, with an all-accented short-message shortcut.
// KNOWN LIMITATION (unchanged by either fix): Vietnamese typed with no
// diacritics at all ("cho toi xem menu") carries no signal here and reads as
// English — accepted, since the same input is genuinely ambiguous.
export function detectLang(text: string): string {
  // Encoding-safe: never short-circuits mid-loop for scripts that must scan to
  // completion (Chinese text with fullwidth punctuation still resolves to 'zh').
  let hasCJK = false
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp <= 0x7F) continue
    if (cp >= 0x3040 && cp <= 0x30FF) return 'ja'       // kana (exclusive to Japanese)
    if (cp >= 0xAC00 && cp <= 0xD7AF) return 'ko'       // hangul
    // CJK Unified + fullwidth block (fullwidth punct common in Chinese text)
    if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0xFF00 && cp <= 0xFFEF)) { hasCJK = true; continue }
    if (cp >= 0x0600 && cp <= 0x06FF) return 'ar'       // Arabic
    if (cp >= 0x0E00 && cp <= 0x0E7F) return 'th'       // Thai
  }
  if (hasCJK) return 'zh'

  const words = text.split(/\s+/).filter(w => HAS_LETTER.test(w))
  if (words.length === 0) return 'en'

  let accentedWords = 0
  let lowercaseAccentedWords = 0
  let viFunctionWords = 0
  for (const w of words) {
    let accented = false
    for (const ch of w) {
      if (isAccentedLatin(ch.codePointAt(0) ?? 0)) { accented = true; break }
    }
    if (accented) {
      accentedWords++
      if (!STARTS_UPPERCASE.test(w)) lowercaseAccentedWords++
    }
    const bare = normalizeVN(w.toLowerCase()).replace(/[^a-z]/g, '')
    if (bare && VI_FUNCTION_WORDS.has(bare)) viFunctionWords++
  }

  // Every word accented — a bare Vietnamese phrase or place name on its own
  // ("Đâu?", "Đà Nẵng"), with no English word to anchor it the other way.
  if (accentedWords === words.length) return 'vi'
  // Real Vietnamese vocabulary plus Vietnamese grammar words, even when tone
  // marks are sparse.
  if (lowercaseAccentedWords >= 1 && viFunctionWords >= 2) return 'vi'
  return lowercaseAccentedWords / words.length >= VI_WORD_RATIO_THRESHOLD ? 'vi' : 'en'
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
