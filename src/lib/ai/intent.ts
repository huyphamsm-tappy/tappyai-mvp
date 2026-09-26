export function normalizeVN(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

// A greeting, a thank-you or a bare acknowledgement — and NOTHING else. The
// trailing group allows only polite particles and punctuation, so the pattern
// describes messages that ARE a greeting rather than messages that merely start
// with one.
//
// It used to be an unanchored prefix match, which quietly routed real requests
// to the no-tool path because "hiện" starts with "hi", "uống" with "u", and
// "ok show me cafes…" with "ok". That is not a cost bug: the chitchat path runs
// with maxSteps:1, so when the model then reached for a tool there was no step
// left to answer in and the user got an EMPTY reply. Measured live 2026-08-10 on
// "hiện tại giá vàng bao nhiêu" and "ok show me cafes in Hanoi" — see
// intent.test.ts. Matched against diacritic-stripped text (normalizeVN).
const CHITCHAT_ONLY =
  /^(xin chao|chao|hello|hi|alo|cam on|thank you|thanks|thank|oke|okie|ok|uh|um|u|tam biet|bye|haha|hehe|hihi|ban la ai|ban ten gi|tappyai la gi|test)(\s+(ban|tappy|tappyai|nhe|nha|nhieu|lam|a|oi|you|there|so much|bye))*\s*[!.,?~…]*$/i

export function classifyIntent(text: string): 'chitchat' | 'tool' {
  const t = normalizeVN(text.toLowerCase().trim())
  // Empty is not chitchat: the route rejects empty payloads, and anything that
  // slips through should keep full capability rather than lose it silently.
  if (t.length === 0 || t.length > 40) return 'tool'
  return CHITCHAT_ONLY.test(t) ? 'chitchat' : 'tool'
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

/**
 * 🚨 NO-DIACRITIC VIETNAMESE IS VIETNAMESE (Consultative V1, 2026-09-18).
 *
 * Measured on the branch: 13 of 14 undiacriticked queries a phone user actually types
 * ("tim quan an toi ngon gan quan 1 cho 2 nguoi", "spa nao tot re o da nang") detected as
 * ENGLISH — the only Vietnamese evidence was accented letters plus the 30-word function list
 * above, and an undiacriticked sentence has neither. This is the CONTENT lexicon: common
 * Vietnamese words, diacritic-folded, that are not English words. `an`, `co`, `do`, `to`,
 * `me`, `so`, `no`, `ok`, `view`, `cafe`, `spa`, `budget`, `chill`, `ban`, `be`, `may`, `con`,
 * `la`, `ma`, `de`, `den`, `hen`, `yen`, `tram`, `sang`, `tour` are deliberately absent — they
 * are English words or loanwords and would score both ways ("Good bun bo spots" is English).
 *
 * Scoring (countViContentWords): capitalised words after the first are proper nouns ("Hội An",
 * "Đà Nẵng", "TP.HCM") and are ignored on both sides of the ratio — a place name is not
 * grammar. The lexicon must carry at least half of the remaining words: "bun bo" inside an
 * English sentence is a dish, "quan bun bo ngon o q1" is a sentence.
 */
const VI_CONTENT_WORDS = new Set([
  'quan', 'ngon', 'gan', 'nguoi', 'tim', 'kiem', 'mua', 'tot', 'dep', 'nao', 'dau', 'day',
  'nay', 'choi', 'xem', 'phim', 'hay', 'vui', 'minh', 'duoi', 'tren', 'trieu', 'nghin',
  'khach', 'san', 'phong', 'dem', 'ngay', 'trua', 'chieu', 'toi', 'khuya', 'tuan', 'thang',
  'bun', 'pho', 'com', 'lau', 'nuong', 'hai', 'oc', 'che', 'tra', 'sua', 'banh', 'mon', 'mi',
  'nha', 'tiem', 'cho', 'duong', 'khu', 'thanh', 'tinh', 'huyen', 'phuong', 'xa',
  'chon', 'tien', 'khac', 'nua', 'roi', 'chua', 'khong', 'ko', 'hok', 'dc', 'duoc',
  'vat', 'gia', 'dinh', 'nhau', 'hoi', 'bao', 'nhieu', 'bnhieu',
  'sinh', 'nhat', 'ky', 'niem', 'tiep', 'sep', 'dong', 'nghiep',
  'dat', 'xe', 'lanh', 'ngoai', 'troi', 'chay', 'thit', 'ca', 'ga', 'bo', 'heo',
  'ruou', 'bia', 've', 'bai', 'bien', 'nui', 'suoi', 'tai', 'nghe', 'di', 'o', 're',
  'yen', 'hen', 'ho',
  'lam', 'giup', 'goi', 'thu', 'thich', 'muon', 'nen', 'cung', 'voi', 'cua',
  'va', 'hoac', 'nhung', 'thi', 'thoi', 'luon', 'qua', 'rat', 'kha',
  'moi', 'cu', 'trung', 'tam', 'gio', 'tu',
])

// The mirror of VI_FUNCTION_WORDS: ENGLISH evidence.
//
// Until now the detector only ever scored Vietnamese-ness, so a short mixed query had no way to
// be pulled back toward English. That is why "Cafe view đẹp Hà Nội?" (a Vietnamese search) and
// "Best bún chả in Hà Nội?" (an English sentence naming a Vietnamese dish) were inseparable:
// measured on the ratio alone the ENGLISH one actually scores HIGHER (0.67 vs 0.50). No
// threshold or numerator change can split them — only the English words can.
//
// Built with the same collision rule documented above: a token counts as English evidence only
// if it is NOT also a legitimate Vietnamese word after normalizeVN. Excluded for exactly that
// reason — can (cần/căn), me (mẹ), my (mỹ), the (thế), i (í), and the in/to/go/no/so/may/hay/
// ban/la set already named above. Kept deliberately small: these are unambiguous English
// question/request words, not a general dictionary.
const EN_FUNCTION_WORDS = new Set([
  'best', 'where', 'try', 'near', 'recommend', 'good', 'find', 'what', 'help',
  'with', 'your', 'from', 'about', 'please', 'need', 'want', 'looking', 'some',
  'which', 'how', 'suggest', 'show', 'any', 'around', 'there', 'here',
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
/**
 * Diacritic-folded content-word evidence for undiacriticked Vietnamese.
 * `vi` = words found in the lexicon; `pool` = the words judged (proper nouns excluded).
 * Vietnamese when `vi >= floor`, `vi > enFunctionWords` and `vi` is at least half of `pool`.
 */
function countViContentWords(words: readonly string[]): { vi: number; pool: number } {
  let vi = 0
  let pool = 0
  words.forEach((w, i) => {
    // A capital letter after the first word is a proper noun: "Hội An walking tour".
    if (i > 0 && /^[A-ZÀ-Ỹ]/.test(w)) return
    const bare = normalizeVN(w.toLowerCase()).replace(/[^a-z0-9]/g, '')
    if (!bare) return
    pool++
    if (VI_CONTENT_WORDS.has(bare) || VI_FUNCTION_WORDS.has(bare)) vi++
    // District shorthand a phone user writes: q1, q3, q10.
    else if (/^q\d{1,2}$/.test(bare)) vi++
  })
  return { vi, pool }
}

function isUndiacriticizedVi(
  words: readonly string[], enFunctionWords: number, floor: number,
): boolean {
  const { vi, pool } = countViContentWords(words)
  return vi >= floor && vi > enFunctionWords && vi * 2 >= pool
}

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
  let enFunctionWords = 0
  const accentedFlags = words.map(w => {
    for (const ch of w) {
      if (isAccentedLatin(ch.codePointAt(0) ?? 0)) return true
    }
    return false
  })

  /**
   * 🚨 THE FIRST WORD OF A SENTENCE IS CAPITALISED BY ORTHOGRAPHY, NOT BECAUSE IT
   * IS A PROPER NOUN — and treating it as one is what answered a Vietnamese
   * query in English.
   *
   * Measured: `detectLang('Quán cafe view đẹp')` returned 'en'. `Quán` is an
   * ordinary Vietnamese noun (shop/eatery), accented, and capitalised only
   * because it opens the sentence. The uppercase filter dropped it from the
   * Vietnamese evidence, leaving `đẹp` alone against the two undiacriticked
   * loanwords Vietnamese speakers actually write — `cafe` and `view`. Score
   * 1/3 = 0.333, below the 0.4 threshold, so the answer came back in English.
   *
   * Counting it needs two guards, because the uppercase filter is doing real work
   * the rest of the time — a place name must never turn an English sentence
   * Vietnamese ("Phú Quốc is nice", "Best bún chả in Hà Nội?"):
   *
   *   1. NOT FOLLOWED BY ANOTHER CAPITALISED WORD. "Đà Nẵng is beautiful" opens
   *      with a two-word proper noun; "Quán cafe …" does not. A capitalised word
   *      followed by a lowercase one is a sentence opening, not a name.
   *   2. THE MESSAGE CARRIES OTHER VIETNAMESE EVIDENCE. Without this a lone
   *      loanword would decide on its own — "Café recommendations?" is English
   *      and has to stay English.
   *
   * This only ever ADDS to the numerator; the denominator is untouched, so no
   * sentence that already resolved to Vietnamese can be pulled the other way.
   */
  const sentenceInitialIsVietnamese =
    words.length > 1 &&
    accentedFlags[0] &&
    STARTS_UPPERCASE.test(words[0]) &&
    !STARTS_UPPERCASE.test(words[1]) &&
    accentedFlags.slice(1).some(Boolean)

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const accented = accentedFlags[i]
    if (accented) {
      accentedWords++
      if (!STARTS_UPPERCASE.test(w) || (i === 0 && sentenceInitialIsVietnamese)) lowercaseAccentedWords++
    }
    const bare = normalizeVN(w.toLowerCase()).replace(/[^a-z]/g, '')
    if (bare && VI_FUNCTION_WORDS.has(bare)) viFunctionWords++
    if (bare && EN_FUNCTION_WORDS.has(bare)) enFunctionWords++
  }

  // Every word accented — a bare Vietnamese phrase or place name on its own
  // ("Đâu?", "Đà Nẵng"), with no English word to anchor it the other way.
  if (accentedWords === words.length) return 'vi'
  // Real Vietnamese vocabulary plus Vietnamese grammar words, even when tone
  // marks are sparse.
  if (lowercaseAccentedWords >= 1 && viFunctionWords >= 2) return 'vi'
  // Undiacriticked Vietnamese: content words that are not English, outnumbering the English
  // function words and carrying at least half the sentence. Two is the floor so "quan nay"
  // alone does not decide a mixed sentence.
  if (isUndiacriticizedVi(words, enFunctionWords, 2)) return 'vi'
  // An unambiguous English question/request word settles it. Reached only after the rules
  // above, so a sentence with real Vietnamese grammar still wins first.
  if (enFunctionWords > 0) return 'en'
  // The ratio judges only the LOWERCASE words, on both sides of the division.
  //
  // The numerator already ignored capitalised tokens — deliberately, so a place name cannot make
  // an English sentence Vietnamese. But they stayed in the DENOMINATOR, so an accented proper
  // noun scored AGAINST Vietnamese. A long sentence absorbs that; a five-word search query does
  // not. Production answered "Cafe view đẹp Hà Nội?" in English on 1/5 = 0.200, because `Cafe`
  // and `view` are undiacriticked loanwords in ordinary Vietnamese use and `Hà`/`Nội` diluted
  // what remained. Judging the lowercase words alone gives 1/2 = 0.500.
  const scoredWords = words.filter(w => !STARTS_UPPERCASE.test(w)).length
  if (scoredWords === 0) return 'en'
  return lowercaseAccentedWords / scoredWords >= VI_WORD_RATIO_THRESHOLD ? 'vi' : 'en'
}

/**
 * The language the message is CLEARLY in, or null when the text does not settle it.
 *
 * `detectLang` always returns something, because it has to — every turn needs a language. That
 * makes it unsuitable for deciding whether to trust the text over the user's locale: its answer
 * for "Tim quan bun bo ngon o TPHCM" is `en`, and acting on that answers a Vietnamese user in
 * English. Diacritic-free Vietnamese is ordinary typing, not an English sentence.
 *
 * So this reuses the same signals and reports only what they establish beyond doubt:
 *   · a non-Latin script — nothing else writes in kana, hangul, Thai or Arabic;
 *   · Vietnamese by tone marks, or by real Vietnamese grammar words alongside at least one;
 *   · English by TWO or more English function words, so one stray loanword cannot flip a turn.
 * Anything else returns null, and the caller falls back to the product locale.
 *
 * Deliberately no new inputs: no profile fields, no history, no account data. Only this message.
 */
export function detectLangConfident(text: string): string | null {
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp <= 0x7F) continue
    if (cp >= 0x3040 && cp <= 0x30FF) return 'ja'
    if (cp >= 0xAC00 && cp <= 0xD7AF) return 'ko'
    if (cp >= 0x4E00 && cp <= 0x9FFF) return 'zh'
    if (cp >= 0x0600 && cp <= 0x06FF) return 'ar'
    if (cp >= 0x0E00 && cp <= 0x0E7F) return 'th'
  }

  const words = text.split(/\s+/).filter(w => HAS_LETTER.test(w))
  if (words.length === 0) return null

  let accentedWords = 0
  let lowercaseAccentedWords = 0
  let viFunctionWords = 0
  let enFunctionWords = 0
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
    if (bare && EN_FUNCTION_WORDS.has(bare)) enFunctionWords++
  }

  // Vietnamese, on the same evidence detectLang already trusts most.
  if (accentedWords > 0 && accentedWords === words.length) return 'vi'
  if (lowercaseAccentedWords >= 1 && viFunctionWords >= 2) return 'vi'
  // Undiacriticked Vietnamese, confidently: three or more content words and more of them than
  // English function words — "cho toi 3 quan bun bo ngon o q1" is not a doubt.
  if (isUndiacriticizedVi(words, enFunctionWords, 3)) return 'vi'
  // English needs TWO function words. One ("best", "the") appears constantly inside Vietnamese
  // sentences about products, and a single loanword must not decide the turn.
  if (enFunctionWords >= 2 && lowercaseAccentedWords === 0) return 'en'
  return null
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
  // Phase D (2026-09-20): a named cinema ("rạp CGV Vincom Đồng Khởi"), karaoke, a water park, an
  // aquarium or a play venue is a VENUE — it takes the place tool, not `web_search` (measured live
  // run 19: the cinema question fell through to the trailing "?" rule and got no card).
  if (/nha hang|quan an|an gi|an ngon|cafe|ca phe|coffee|\bspa\b|massage|khach san|\bhotel\b|resort|\bbar\b|\bpub\b|\bgym\b|fitness|rap chieu|rap phim|rap (?:cgv|lotte|galaxy|bhd|cinestar|mega)|\bcgv\b|lotte cinema|galaxy cinema|bhd star|cinestar|chieu phim|cinema|xem phim|(?<!loa |dan |micro |mic |may |bo )karaoke|cong vien nuoc|water ?park|thuy cung|aquarium|khu vui choi|bowling|\bbida\b|billiards?|escape room|truot bang|ice rink|nha hat|benh vien|hospital|clinic|pharmacy|nha thuoc|\batm\b|ngan hang|\bbank\b|dia diem|o dau|gan day|gan toi|\btiem\b|tham quan|thang canh|diem du lich|danh lam|bao tang|khu du lich/.test(t)) return 'search_places'
  // E3: a fact question about a venue the user NAMED ("CellphoneS Nguyễn Trãi mở cửa mấy giờ?") is a place lookup.
  if (namedVenueIn(text) !== null && /mo cua|dong cua|may gio|gio mo|gio dong|dia chi|so dien thoai|\bo dau\b|co .{0,20}khong|gia ve|con mo/.test(t)) return 'search_places'
  if (/tin tuc|tin moi|bao chi|thoi su|tin nong|tin the gioi/.test(t)) return 'get_news'
  // "mua" = buy — but after normalizeVN "nhảy múa" (dance) is also "nhay mua",
  // and it used to route an evening-out request to shopping. A negative
  // lookbehind on "nhay " keeps the verb and drops the dance.
  if (/(?<!nhay )\bmua\b|san pham|shopee|tiki|lazada|dat hang|order hang/.test(t)) return 'search_products'
  if (/gia vang|vang sjc|vang 9999|vang mieng|vang nhan|gia vang the gioi|xau\s*\/?\s*usd/.test(t)) return 'get_gold_price'
  if (/thoi tiet|du bao|nhiet do|troi mua|troi nang|troi co lanh|may co|nang khong|mua khong/.test(t)) return 'get_weather'
  if (/ty gia|hoi suat|gia xang|gia dau|ket qua|\bti so\b|diem so|ai la|tong thong|thu tuong|chu tich|vn-index|chung khoan|xo so|lich am|ngay bao nhieu|\?|nghia la|nhu the nao|khi nao|vi sao|tai sao|moi nhat|cap nhat|hien nay|hien tai/.test(t)) return 'web_search'
  return null
}

/**
 * Is this a TRAVEL turn (flight / hotel / route / trip)? — the trigger for the
 * fail-closed travel guard (P0). Deliberately BROADER than detectForcedTool's
 * per-tool patterns: it must catch a bare route like "đi từ HCM đi Nha Trang"
 * that names no tool keyword, because that is exactly the phrasing that led the
 * model to invent a fare. Over-detecting is SAFE — the guard only ever removes an
 * UNGROUNDED dynamic fact, so a non-travel turn with no fabricated price is
 * untouched; the only cost of a false positive is that the turn buffers.
 */
export function detectTravelIntent(text: string): boolean {
  const t = normalizeVN(text.toLowerCase().trim())
  if (/ve may bay|chuyen bay|bay tu|bay den|hang khong|\bmay bay\b|vietjet|bamboo|pacific airlines|vietnam airlines|gia phong|gia ve|khach san|resort|dat phong|homestay|nha nghi|du lich|flight|airfare|\bhotel\b|xe khach|tau hoa|tau lua|duong sat|ve xe|ve tau|di chuyen (tu|den|toi)/.test(t)) return true
  // A route: "(đi) từ X đi/đến/tới/ra/sang Y", or English "from X to Y".
  if (/\btu\b .+ \b(di|den|toi|ra|sang|ve)\b .+/.test(t)) return true
  if (/\bfrom\b .+ \bto\b .+/.test(t)) return true
  return false
}

// ── Where in a decision is the user? (C2) ────────────────────────────────────
//
// The existing signals answer "which tool?". This one answers "which STAGE?" —
// the difference between a cold-start request, a tweak to the answer just given,
// a straight choice between named options, and a plain acknowledgement.
//
// Deterministic regex on purpose: consultative behaviour must not add an LLM
// classification round trip (Cost Optimization is finalized and must not
// regress). Precision is favoured over recall — a missed signal falls back to
// exactly today's behaviour, whereas a FALSE refinement tells the model to carry
// forward a task the user has moved on from, which is worse than shipping
// nothing.

export type DecisionStage =
  | 'refinement'
  | 'comparison'
  | 'confirmation'
  | 'decision'
  | 'rejection'
  | null

/** A bare acknowledgement and NOTHING else — same whole-message technique as
 *  CHITCHAT_ONLY, so "ok cho mình xem quán quận 1" is not swallowed. */
const CONFIRMATION_ONLY =
  /^(ok|oke|okie|okay|duoc|duoc roi|uh|um|u|ung|vang|da|yes|yep|yeah|sure|fine|great|perfect|nice|sounds good|got it|understood)(\s+(roi|nhe|nha|ban|luon|thanks|thank you|then))*\s*[!.,?~…]*$/i

/** An explicit either/or choice, or an explicit "compare these" instruction.
 *  Vietnamese "hay" doubles as "or" AND "interesting", and English "or" is
 *  everywhere, so both need a companion marker rather than standing alone. */
const COMPARISON =
  /\bso sanh\b|\bcompare\b|which (one )?is better|which should i|nen (chon|mua|di|dat|lay)\b[^?]*\bhay\b|\bvs\.?\b|\bversus\b|^[^?]{1,60}\bhay\b[^?]{1,60}\?$|\bor\b[^?]{1,40}\?[^?]*$/i

/** A change to the constraints of the task already in play. */
const REFINEMENT_MARKER = new RegExp([
  // Vietnamese comparatives ("rẻ hơn", "gần biển hơn") and swaps
  '\\bhon\\b',
  'doi sang|chuyen sang|thay bang|thay boi',
  '(quan|cho|khach san|nha hang|cai|mon|noi) khac',
  // English comparatives and swaps
  '\\b(cheaper|closer|nearer|better|bigger|smaller|quieter|nicer|fancier|safer|shorter|longer|earlier|later|warmer|cooler|lighter|central)\\b',
  '\\b(more|less)\\s+\\w+',
  'change to|switch to|instead|any other|another one|anything else|something else|any better',
].join('|'), 'i')

/** A bare constraint phrase — refinement expressed by adding a limit rather than
 *  a comparative ("Gần biển.", "Dưới 2 triệu", "under 2 million"). Anchored to
 *  the START so it only matches messages that ARE a constraint. */
const REFINEMENT_CONSTRAINT_LEAD =
  /^(gan|xa|duoi|tren|trong vong|khoang|co |khong co |near|close to|next to|under|below|over|above|within|with |without )/i

/** Longest message still plausibly a tweak rather than a fresh request. A real
 *  refinement is short by nature ("rẻ hơn", "closer to the beach"). */
const MAX_REFINEMENT_LENGTH = 60

/**
 * "You pick for me." The user is not naming two options to compare (that is [COMPARISON]) — they
 * are handing the decision over, which is the one turn where a list is always the wrong answer.
 *
 * Measured gap: "bạn chọn máy nào?" and "which one would you choose?" both scored `null` under
 * C2, so the turn that most needs a committed recommendation was the one running with no stage
 * guidance at all.
 */
const DECISION_REQUEST = new RegExp([
  'ban (chon|thich|khuyen|nghieng)',
  '(chon|lay|mua) (cai|may|quan|cho|phuong an|loai) nao',
  'theo ban( thi)? nen',
  '(tu van|chon|goi y) giup',
  'neu la ban',
  'which (one )?would you (choose|pick|go with|recommend)',
  'what would you (choose|pick|go with|recommend)',
  'which (one )?do you recommend',
  'your (pick|choice)',
  'you (choose|pick|decide)',
  '\\bpick one\\b|\\brecommend one\\b|\\bjust pick\\b',
  'if you were me',
].join('|'), 'i')

/**
 * The previous suggestions were rejected as a set. Distinct from a refinement: a refinement says
 * what to change, a rejection only says the direction was wrong — so the reply has to find out
 * WHY before spending another search.
 */
const REJECTION = new RegExp([
  'khong (thich|ung|hop|thay hay|khoai)',
  'chan qua|khong on|deu khong',
  'khong cai nao',
  "don'?t like|do not like|not a fan",
  'none of (these|them|those)',
  'not what i (want|need|had in mind)',
  'neither|not really feeling',
].join('|'), 'i')

/**
 * A constraint or priority added to the task already in play, phrased as a statement rather than
 * a comparative — "tầm 25 triệu", "chủ yếu code", "pin phải tốt", "around 25 million".
 *
 * C2 only caught comparatives ("rẻ hơn") and a short list of prepositional leads, so every turn
 * of a realistic multi-turn consultation fell through to no stage. Same refinement semantics:
 * keep the task, apply the new condition.
 */
const CONSTRAINT_ADDITION = new RegExp([
  // Budget / rough amount, usually the second thing a buyer says.
  '^(tam|khoang|ngan sach|gia|duoi|tren)\\b',
  '^(around|about|budget|under|below|up to|max)\\b',
  // Purpose / usage.
  '^(chu yeu|chinh la|de |dung de |uu tien)\\b',
  '^(mostly|mainly|primarily|for )\\b',
  // A stated must-have: "pin phải tốt", "màn phải to", "must be quiet".
  '\\bphai (tot|cao|moi|ben|manh|nhanh|re|lon|nho|rong|sach|yen)\\b',
  '\\b(must|has to|needs to) (be|have)\\b',
  // Who is coming / what the occasion is — changes the answer as much as a budget does.
  '\\b(dan theo|di voi|di cung|cung voi|co them|dat cho|cho ca nha)\\b',
  // 🚨 PARTY SIZE, the plainest form of the same thing. "Cho 2 nguoi" after
  // "Massage thu gian o Quan 1" scored no stage at all, so the refinement block
  // never rendered and the reply re-opened the request from scratch, asking again
  // for the district it had already been told. The group above already covers
  // "di cung" and "cho ca nha"; it simply never covered the bare count.
  '\\b(cho|di|dat|book) \\d+ (nguoi|khach)\\b',
  '^\\d+ (nguoi|khach)\\b',
  '\\bfor \\d+ (people|persons|guests|adults|pax)\\b',
  "\\b(bringing|with my|for my|i'?ll have)\\b",
].join('|'), 'i')

/**
 * "Cho mình thêm vài quán khác" — the user wants MORE options, not different requirements.
 *
 * Distinct from refinement, which these phrases used to fall under: a refinement changes what
 * qualifies and can invalidate the held set, whereas this asks for the next slice of a set we
 * usually already have. Treating them the same is what made "thêm quán khác" trigger a fresh
 * search plus a fresh batch of photos when unshown candidates were already sitting in state.
 *
 * Deliberately narrow — it must not swallow "quán khác rẻ hơn", which really is a refinement, so
 * any comparative in the message disqualifies it.
 */
const MORE_OPTIONS = new RegExp([
  'them (vai |may |mot |2 |3 )?(quan|cho|noi|khach san|nha hang|mon|lua chon|option|may)',
  'con (quan|cho|noi|cai|lua chon|option)s? nao (khac|nua)',
  '(quan|cho|noi|cai|lua chon)s? (nao )?khac (khong|nua)',
  'show me more|more options|other options|any others|what else|anything else',
  'give me (a few )?more',
].join('|'), 'i')

/** A comparative means the ask CHANGES the criteria — that is refinement, not "more of these". */
const COMPARATIVE_MARKER = /\bhon\b|\b(cheaper|closer|quieter|better|nicer|bigger|smaller|nearer)\b/i

export function detectMoreOptions(text: string): boolean {
  const t = normalizeVN(text.toLowerCase())
  if (COMPARATIVE_MARKER.test(t)) return false
  return MORE_OPTIONS.test(t)
}

export function detectDecisionStage(
  text: string,
  opts: { hasPriorAssistantTurn: boolean },
): DecisionStage {
  const raw = (text ?? '').trim()
  if (!raw) return null
  const t = normalizeVN(raw.toLowerCase())

  // "You pick" before comparison: both can carry "nào"/"which", but handing the decision over is
  // the stronger signal and needs the committing reply, not the even-handed one. Gated on a prior
  // assistant turn — with nothing on the table there is nothing to choose between, and it is a
  // cold-start request instead.
  if (opts.hasPriorAssistantTurn && DECISION_REQUEST.test(t)) return 'decision'

  // Comparison: valid as a cold start ("Nên mua iPhone hay Samsung?") and its markers are the
  // most specific of the remaining ones.
  if (COMPARISON.test(t)) return 'comparison'

  // Rejection before refinement: "không thích mấy cái này" also trips the refinement marker via
  // "cái khác", but "these were wrong" is not the same instruction as "make it cheaper" and must
  // not be answered the same way.
  if (opts.hasPriorAssistantTurn && REJECTION.test(t)) return 'rejection'

  // A pure acknowledgement. Checked before refinement so "ok" is not read as a
  // constraint, but AFTER the whole-message anchor rejects "ok, cheaper" —
  // that one is a refinement carrying an acknowledgement, and the constraint is
  // what matters.
  if (CONFIRMATION_ONLY.test(t)) return 'confirmation'

  // Refinement needs something to refine. Without a prior assistant turn the
  // same words are a cold-start request and must be treated as one.
  if (opts.hasPriorAssistantTurn && t.length <= MAX_REFINEMENT_LENGTH) {
    if (
      REFINEMENT_MARKER.test(t) ||
      REFINEMENT_CONSTRAINT_LEAD.test(t) ||
      CONSTRAINT_ADDITION.test(t)
    ) return 'refinement'
  }

  return null
}

/**
 * EXPLICIT planning language, Vietnamese and English. Any of these is the user
 * asking for a PLAN — not for a list — and is what activates the planning
 * workflow (`buildPlanningBlock`, the `planning` model role, `maxSteps 8`).
 *
 * 🚨 MEASURED GAP (2026-09-14). The detector fired only on "tối nay + activity"
 * and "destination + N ngày" shapes, so "lập kế hoạch đi chơi cuối tuần",
 * "giúp tôi sắp xếp tối nay đi đâu làm gì", "tối ưu trong 5 triệu" and every
 * English phrasing ("plan an evening out in Saigon") returned null — and a
 * short one of those then read as a "simple" query and ran on the FAST model.
 * The phrases below are the ones a person uses to ask for a plan; each is
 * anchored on a word boundary against diacritic-stripped text (normalizeVN).
 */
const PLAN_REQUEST_RE = /\b(lap|len)\s+(ke\s*hoach|plan)\b|\bplan\s+(cho|for|an?|the|my|our|a)\b|\bhelp me plan\b|\bplan (an?\s+)?(evening|night|day|weekend|trip|date)\b|\bsap xep\b.{0,30}\b(di dau|lam gi|toi nay|cuoi tuan|ngay mai|buoi)\b|\bdi dau lam gi\b|\btoi uu\b.{0,20}\b(trieu|tr|k|budget|ngan sach)\b|\bgoi y lich\b/

/**
 * The activities a plan request names, in the vocabulary of `search_places`'s
 * `type` parameter — so the planning block can say exactly which searches to
 * run and the model never has to guess a tool per activity. "ăn chơi nhảy múa"
 * → restaurant + bar; "ăn tối rồi xem phim" → restaurant + cinema. Order is the
 * order the words appear in, which is usually the order of the evening.
 *
 * Deliberately a lexicon, not a model call: it decides WHICH tools run, and
 * that decision must be the same on every platform and cost nothing.
 */
export type PlanActivity = 'restaurant' | 'cafe' | 'bar' | 'cinema' | 'spa' | 'attraction' | 'hotel'

const PLAN_ACTIVITY_RE: ReadonlyArray<[RegExp, PlanActivity]> = [
  [/\ban\b|\ban uong\b|\ban toi\b|\ban trua\b|\bnha hang\b|\bquan an\b|\bbua toi\b|\bdinner\b|\blunch\b|\beat\b|\bfood\b|\bhai san\b|\bnhau\b|\bbuffet\b/, 'restaurant'],
  [/\bcafe\b|\bca phe\b|\bcoffee\b|\btra sua\b|\bdessert\b/, 'cafe'],
  [/\bbar\b|\bpub\b|\bclub\b|\bnhay mua\b|\bnightlife\b|\bnight out\b|\bdancing\b|\bdance\b|\bbia\b|\bbeer\b|\bcocktail\b|\blounge\b|\bkaraoke\b|\bnhay\b/, 'bar'],
  [/\bxem phim\b|\bphim\b|\brap\b|\bcinema\b|\bmovie\b/, 'cinema'],
  [/\bspa\b|\bmassage\b|\blam dep\b|\bnail\b/, 'spa'],
  [/\btham quan\b|\bdi choi\b|\bvui choi\b|\bcheck in\b|\bdanh lam\b|\bbao tang\b|\bthang canh\b|\bsightseeing\b|\bthings to do\b|\bactivities\b|\bhoat dong\b/, 'attraction'],
  [/\bkhach san\b|\bhotel\b|\bresort\b|\bhomestay\b|\bo dau\b.{0,10}\bdem\b|\bstay\b/, 'hotel'],
]

export function detectPlanActivities(text: string): PlanActivity[] {
  const t = normalizeVN(text.toLowerCase())
  const found: Array<[number, PlanActivity]> = []
  for (const [re, activity] of PLAN_ACTIVITY_RE) {
    const m = re.exec(t)
    if (m) found.push([m.index, activity])
  }
  // "ăn chơi" is one idiom for going out, not "eat + sightsee": when it is the
  // only attraction cue, the outing is dinner + wherever the other words point.
  const attractionOnlyFromAnChoi = found.some(([, a]) => a === 'attraction') && !/\btham quan\b|\bvui choi\b|\bcheck in\b|\bdanh lam\b|\bbao tang\b|\bthang canh\b|\bsightseeing\b|\bthings to do\b|\bactivities\b|\bhoat dong\b/.test(t)
  return found
    .sort((a, b) => a[0] - b[0])
    .map(([, a]) => a)
    .filter(a => !(a === 'attraction' && attractionOnlyFromAnChoi))
}

const EVENING_RE = /\btoi nay\b|\bbuoi toi\b|\bchieu toi\b|\bdem nay\b|\btonight\b|\bthis evening\b|\bevening\b|\bnight out\b|\ba night\b|\bdate night\b/
const MULTI_DAY_RE = /\d+\s*(ngay|dem|night|day)s?\b|\bcuoi tuan\b|\bweekend\b|\bdu lich\b|\btrip\b|\bchuyen di\b|\btour\b/

/**
 * The bare NOUNS. "kế hoạch" / "lịch trình" / "itinerary" count as a plan
 * keyword only next to a time or destination cue (the rules below), never on
 * their own: "kế hoạch của Vingroup năm nay là gì" is a question about a
 * company, and the audit of 2026-09-14 caught the bare noun routing it into
 * planning mode. A REQUEST form (`PLAN_REQUEST_RE`) stands on its own.
 */
const PLAN_NOUN_RE = /\bke hoach\b|\blich trinh\b|\bitinerary\b/

const TRIP_DESTINATIONS = 'da nang|danang|phu quoc|phuquoc|nha trang|hoi an|hoian|da lat|dalat|vung tau|ha long|halong|sapa|sa pa|ninh binh|hue|ha noi|hanoi|ho chi minh|saigon|sai gon|can tho|mui ne|con dao|ly son|quy nhon|phan thiet|thai lan|thailand|singapore|nhat ban|japan|han quoc|korea|bali|malaysia|paris|tokyo|osaka|seoul'
const TRIP_DESTINATION_RE = new RegExp(`(${TRIP_DESTINATIONS})`)
/** A go-verb immediately before a destination: "đi Đà Lạt", "lên Đà Lạt", "ra Hà Nội", "qua Thái Lan". */
const GO_TO_DESTINATION_RE = new RegExp(`\\b(?:di|len|xuong|ra|vao|qua|den|toi|ve)\\s+(?:choi\\s+)?(?:o\\s+)?(?:${TRIP_DESTINATIONS})\\b`)
/** A when for a trip: weekend, next week, a named month/holiday, or a depart/return phrase. */
const TRIP_WHEN_RE = /\bcuoi tuan\b|\bweekend\b|\btuan (?:nay|sau|toi)\b|\bthang (?:nay|sau|toi|\d{1,2})\b|\ble\b|\btet\b|\bnghi le\b|\bmai di\b|\bngay mai\b|\bsang mai\b|\bcuoi thang\b|\bdau thang\b|\bnext week\b|\bthis week\b/
const TRANSPORT_ASK_RE = /\bxe khach\b|\bve xe\b|\bve may bay\b|\bchuyen bay\b|\bve tau\b|\btau hoa\b|\bgia ve\b|\bnha xe\b|\bbus\b|\bflight\b|\bticket\b/

export interface TripLength { days: number; nights: number; /** the phrase it was read from */ from: string }

/** Rough centre of each destination the trip detector knows, for the transport default. */
const DESTINATION_COORDS: ReadonlyArray<[re: RegExp, label: string, lat: number, lng: number]> = [
  [/da nang|danang/, 'Đà Nẵng', 16.05, 108.20], [/phu quoc|phuquoc/, 'Phú Quốc', 10.23, 103.96],
  [/nha trang/, 'Nha Trang', 12.24, 109.19], [/hoi an|hoian/, 'Hội An', 15.88, 108.34],
  [/da lat|dalat/, 'Đà Lạt', 11.94, 108.44], [/vung tau/, 'Vũng Tàu', 10.35, 107.08],
  [/ha long|halong/, 'Hạ Long', 20.95, 107.07], [/sapa|sa pa/, 'Sa Pa', 22.34, 103.84],
  [/ninh binh/, 'Ninh Bình', 20.25, 105.97], [/\bhue\b/, 'Huế', 16.46, 107.59],
  [/ha noi|hanoi/, 'Hà Nội', 21.03, 105.85], [/ho chi minh|saigon|sai gon/, 'TP HCM', 10.78, 106.70],
  [/can tho/, 'Cần Thơ', 10.03, 105.78], [/mui ne/, 'Mũi Né', 10.93, 108.29],
  [/con dao/, 'Côn Đảo', 8.68, 106.61], [/ly son/, 'Lý Sơn', 15.38, 109.11],
  [/quy nhon/, 'Quy Nhơn', 13.78, 109.22], [/phan thiet/, 'Phan Thiết', 10.93, 108.10],
]
const ABROAD_RE = /thai lan|thailand|singapore|nhat ban|japan|han quoc|korea|bali|malaysia|paris|tokyo|osaka|seoul/

export interface TransportDefault { mode: 'máy bay' | 'xe khách / ô tô' | 'tàu cao tốc'; destination: string; distanceKm: number | null }

/**
 * The transport a plan assumes, decided from distance so the model never has to ask "máy bay
 * hay xe khách?" (Phase 7 group 4: it asked on T1 turns 1 AND 2 with the rule in the prompt;
 * a stated default is what it followed on turn 3). ≥ 400 km or abroad → plane; an island →
 * fast boat or plane; otherwise road. Null when the destination is unknown to this table.
 */
export function defaultTransportFor(text: string, origin: { lat: number; lng: number } | null | undefined): TransportDefault | null {
  const t = normalizeVN(String(text ?? '').toLowerCase())
  if (ABROAD_RE.test(t)) return { mode: 'máy bay', destination: 'nước ngoài', distanceKm: null }
  const hit = DESTINATION_COORDS.find(([re]) => re.test(t))
  if (!hit) return null
  const [, label, lat, lng] = hit
  if (!origin) return { mode: 'máy bay', destination: label, distanceKm: null }
  const R = 6371
  const dLat = (lat - origin.lat) * Math.PI / 180
  const dLng = (lng - origin.lng) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(origin.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  const km = Math.round(2 * R * Math.asin(Math.sqrt(a)))
  if (/Phú Quốc|Côn Đảo/.test(label)) return { mode: km >= 250 ? 'máy bay' : 'tàu cao tốc', destination: label, distanceKm: km }
  if (/Lý Sơn/.test(label)) return { mode: 'tàu cao tốc', destination: label, distanceKm: km }
  return { mode: km >= 400 ? 'máy bay' : 'xe khách / ô tô', destination: label, distanceKm: km }
}

/**
 * The trip's length as the user said it. "3 ngày 2 đêm" is literal; "mai đi mốt về" is TWO days
 * (one night), "sáng đi chiều về" / "đi về trong ngày" is one day. Phase 7 group 4 (golden T1
 * turn 2): the model read "mai đi mốt về" as three days and kept planning three — the length is
 * decided here so the planning block can state it and the model cannot mis-count it.
 */
export function detectTripLength(text: string): TripLength | null {
  const t = normalizeVN(String(text ?? '').toLowerCase())
  let m = t.match(/\b(\d{1,2})\s*(?:ngay|days?)\b(?:\s*(\d{1,2})\s*(?:dem|nights?)\b)?/)
  if (m) {
    const days = Number(m[1])
    if (days >= 1 && days <= 30) return { days, nights: m[2] ? Number(m[2]) : Math.max(0, days - 1), from: m[0].trim() }
  }
  m = t.match(/\b(\d{1,2})\s*(?:dem|nights?)\b/)
  if (m) {
    const nights = Number(m[1])
    if (nights >= 1 && nights <= 30) return { days: nights + 1, nights, from: m[0].trim() }
  }
  if (/\bmai di\b.{0,12}\bmot ve\b|\bdi mai\b.{0,8}\bve mot\b/.test(t)) return { days: 2, nights: 1, from: 'mai đi mốt về' }
  if (/\bsang di\b.{0,12}\b(?:chieu|toi) ve\b|\bdi ve trong ngay\b|\bve trong ngay\b|\bday trip\b|\bsame day\b/.test(t)) return { days: 1, nights: 0, from: 'đi về trong ngày' }
  return null
}

/**
 * Whether this turn is a REFINEMENT of the plan the thread is already building, as opposed to a
 * new subject. The planning block is re-issued for a refinement ("mai đi mốt về, budget 20
 * triệu", "gần biển") so the plan is actually delivered — group 4 measured the block dropping
 * out on every follow-up, which is why the model kept asking instead of planning. A refinement
 * is short and names no other tool subject (a product, the news, gold, a ticket).
 */
const OTHER_SUBJECT_RE = /\bmua\b|\bgia vang\b|\btin tuc\b|\bthoi tiet\b|\bty gia\b|\bdien thoai\b|\blaptop\b|\bmacbook\b|\biphone\b|\bxe may\b|\bo to\b|\bve xe\b|\bve may bay\b|\bcong thuc\b|\bdich\b|\btom tat\b/
export function isPlanningRefinement(lastText: string): boolean {
  const t = normalizeVN(String(lastText ?? '').toLowerCase()).trim()
  if (t.length === 0 || t.length > 160) return false
  if (OTHER_SUBJECT_RE.test(t)) return false
  return true
}

export function detectPlanningIntent(text: string): 'trip' | 'evening' | null {
  const t = normalizeVN(text.toLowerCase())

  const hasPlanRequest = PLAN_REQUEST_RE.test(t)
  const hasPlanKeyword = hasPlanRequest || PLAN_NOUN_RE.test(t)
  const isEvening = EVENING_RE.test(t)

  // Evening: "tối nay" + multi-activity OR explicit plan request
  const hasMultiActivity =
    (t.includes('spa') || t.includes('massage') || t.includes('xem phim') || t.includes('phim') || t.includes('karaoke') || t.includes('bar') || t.includes('nhau') || t.includes('nhay mua') || t.includes('club')) &&
    (/\ban\b/.test(t) || t.includes('cafe') || t.includes('ca phe') || t.includes('dinner') || t.includes('eat'))
  if (isEvening && (hasMultiActivity || hasPlanKeyword)) return 'evening'

  // Trip: destination + (days/nights pattern OR budget pattern OR trip keyword)
  const hasDays = /\d+\s*(ngay|dem|night|day)/.test(t)
  const hasBudget = t.includes('budget') || t.includes('ngan sach') || /\d+\s*(trieu|tr\b|million)/.test(t)
  const hasDestination = TRIP_DESTINATION_RE.test(t)
  const hasTripKw = t.includes('trip') || t.includes('du lich') || t.includes('di choi') || t.includes('chuyen di') || hasPlanKeyword

  if (hasDays && (hasDestination || hasBudget || hasTripKw)) return 'trip'
  if (hasTripKw && hasDestination) return 'trip'
  // Phase 7 group 4 (golden G4a): "Đi Đà Lạt cuối tuần này" is a trip — a go-verb right before a
  // destination plus a when ("cuối tuần", "tuần sau", "mai đi mốt về"). It used to fall through
  // to a plain place search, which asked two questions and planned nothing. A ticket question
  // ("xe khách đi Đà Lạt cuối tuần") keeps its transport tool: no plan is asked for there.
  if (hasDestination && GO_TO_DESTINATION_RE.test(t) && TRIP_WHEN_RE.test(t) && !TRANSPORT_ASK_RE.test(t)) return 'trip'

  // An explicit plan request with no evening cue and no destination: the two
  // existing plan types are the only ones the clients render, so it maps to the
  // closest one — multi-day / weekend / travel wording → trip; otherwise evening
  // (a single outing: "lập kế hoạch ăn chơi cho 2 người", "help me plan for 2").
  if (hasPlanRequest) return MULTI_DAY_RE.test(t) ? 'trip' : 'evening'

  return null
}

// Phase D (2026-09-20): a cinema the user NAMED is its own place — the search-now directive calls it
// exactly, and the decision frame does not ask for a location it does not need.
/** A cinema the user NAMED ("rạp CGV Vincom Đồng Khởi") — the call is that venue, exactly. */
// A bare "galaxy" / "bhd" is a brand only after "rạp" (Galaxy is also a phone).
const CINEMA_BRAND_RE = /\b(?:rap (galaxy|bhd|cgv|lotte|cinestar)|(cgv|lotte cinema|galaxy cinema|bhd star|cinestar|mega gs))\b/
const VENUE_NAME_STOP = new Set(['chieu', 'phim', 'toi', 'nay', 'mai', 'hom', 'co', 'gia', 've', 'may', 'gio', 'o', 'dau', 'gan', 'nao', 'ngay', 'lich', 'suat', 'bao', 'nhieu', 'khong', 'la', 'thi', 'de', 'cho', 'va', 'xem', 'gi', 'the', 'di', 'den', 'tu'])
/** The named cinema, as a search query (unaccented is fine for Serper), or null when only the kind was named. */
export function namedCinemaQuery(normalizedText: string): string | null {
  const m = CINEMA_BRAND_RE.exec(normalizedText)
  if (!m) return null
  const words = [m[1] ?? m[2]]
  for (const w of normalizedText.slice(m.index + m[0].length).split(/[^a-z0-9]+/).filter(Boolean)) {
    if (VENUE_NAME_STOP.has(w) || words.length >= 5) break
    words.push(w)
  }
  return words.join(' ')
}

/**
 * E3 (2026-09-20, measured FK1 / PK2 / SK1): a question about a venue the user NAMED — "quán Cơm
 * Tấm Ba Ghiền Đặng Văn Ngữ mở đến mấy giờ?", "Sả Spa Quận 1 mở cửa đến mấy giờ?" — is not a
 * request to pick one, and the canned clarify asked "Tầm giá? Mấy người?". The name is read from
 * the ORIGINAL text (case and diacritics intact): two or more capitalised tokens in a row that are
 * not just an area, optionally introduced by a venue noun. Returns the name or null.
 */
const AREA_TOKENS = /^(?:Quận|Q\.?|Phường|P\.?|Huyện|Thành|Phố|TP\.?|Tỉnh|Sài|Gòn|Hà|Nội|Đà|Nẵng|Lạt|Phú|Quốc|Nhuận|Hội|An|Nha|Trang|Vũng|Tàu|Gò|Vấp|Bình|Thạnh|Tân|Thủ|Đức|Cần|Thơ|Huế|Sa|Pa|Hạ|Long|Việt|Nam|HCM|TPHCM|Hồ|Chí|Minh|Đồng|Nai|Biên|Hòa|Chánh|Tây|Ninh|Kiên|Giang|Lâm|Bà|Rịa|Mũi|Né|Phan|Thiết|Quy|Nhơn|Ninh|Cát|Bà|Mộc|Châu|Côn|Đảo|Cà|Mau|Bạc|Liêu|Sóc|Trăng|Vĩnh|Yên|Bái|Lào|Cai|Điện|Biên|Cao|Bằng|Lạng|Sơn|Hải|Phòng|Nam|Định|Thái|Nguyên|Bắc|Hưng|Hà|Nam|Thanh|Hóa|Nghệ|Vinh|Tĩnh|Quảng|Trị|Bình|Định|Tuy|Hòa|Khánh|Đắk|Lắk|Buôn|Ma|Thuột|Gia|Lai|Kon|Tum|Pleiku|Tây|Đô|Mỹ|Tho|Bến|Tre|Trà|Vinh|Long|Xuyên|Rạch|Giá|Hà|Tiên|Mekong|Chợ|Lớn)$/u
const VENUE_NOUN_RE = /^(?:quán|quan|nhà hàng|tiệm|tiem|cafe|cà phê|spa|khách sạn|hotel|resort|rạp|rap|bar|karaoke|cửa hàng|siêu thị|homestay|shop|tiệm|salon|phòng khám)$/iu
/** A venue-type word INSIDE a name ("Sả Spa", "Lotte Cinema", "Highlands Coffee") makes a sentence-initial run a name. */
const VENUE_TYPE_WORD = /^(?:Spa|Cinema|Cine|Hotel|Resort|Karaoke|Cafe|Café|Coffee|Shop|Store|Mart|Plaza|Mall|Restaurant|Bistro|Kitchen|Garden|Lounge|Club|Bar|Pub|Villa|Homestay|Salon|Clinic|Center|Centre|Tower|Studio|Quán|Tiệm)$/iu
export function namedVenueIn(originalText: string): string | null {
  const tokens = originalText.replace(/[?!.,;:()]/g, ' ').split(/\s+/).filter(Boolean)
  let best: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const run: string[] = []
    let j = i
    while (j < tokens.length && /^[\p{Lu}\p{N}][\p{L}\p{N}'’-]*$/u.test(tokens[j]) && !/^\d+$/.test(tokens[j])) { run.push(tokens[j]); j++ }
    if (run.length >= 2) {
      const introduced = i > 0 && VENUE_NOUN_RE.test(tokens[i - 1])
      // Drop area tokens from the END ("Sả Spa Quận 1" → "Sả Spa"); a run that is ONLY an area is not a venue.
      const core = [...run]
      while (core.length > 0 && (AREA_TOKENS.test(core[core.length - 1]) || /^\d+$/.test(core[core.length - 1]))) core.pop()
      const nonArea = core.filter(t => !AREA_TOKENS.test(t))
      // At the very start of a message a capitalised run may just be sentence case ("Tìm quán…",
      // "Resort Phú Quốc"): require the venue noun there, or a brand-shaped token (inner capital).
      const startOk = i > 0 || introduced || core.some(t => /\p{Ll}\p{Lu}/u.test(t)) || core.length >= 3 || core.some(t => VENUE_TYPE_WORD.test(t))
      if (nonArea.length >= (introduced ? 1 : 2) && core.length >= 2 && startOk && core.length > best.length) best = core
      else if (introduced && nonArea.length >= 1 && core.length >= 1 && core.length > best.length) best = core
    }
    if (j > i) i = j - 1
  }
  return best.length > 0 ? best.join(' ') : null
}

// A MOVIE/SHOW something-to-watch cue: the reply is a recommendation from film
// knowledge, not a venue search.
const movieRe = /\bphim\b|\bmovie\b|\bseries\b|phim bo|\banime\b|\bnetflix\b|\bshow\b/
// The user is asking us to SUGGEST what to watch (not to find a place).
const recommendWatchRe = /muon xem|thich xem|xem gi|coi gi|phim gi|xem phim gi|nao hay|\bhay\b|dang xem|nen xem|goi y|de xuat|recommend|co gi hay|xem gi toi nay|nhe nhang|hai huoc|kinh di|tinh cam|hanh dong|vien tuong|tam ly/
// A cinema / showtime / ticket ask — a place search IS appropriate, so this
// DISABLES the recommendation route even when a movie word is present.
const cinemaVenueRe = /\brap\b|rap phim|rap chieu|cinema|\bcgv\b|galaxy|lotte|\bbhd\b|suat chieu|lich chieu|dang chieu|\bve\b|gia ve|dat ve|o dau|gan\s+(day|nha|minh|quan|toi|q\.)|showtime|nearby cinema|where to watch/

/**
 * True when the turn is a MOVIE/SHOW RECOMMENDATION request ("what should I
 * watch"), NOT a cinema / showtime / ticket lookup. Used to keep such a request
 * from being routed to the place search (which answers with cinemas) — the model
 * should recommend titles from general film knowledge instead. A venue/showtime
 * cue (rạp, suất chiếu, vé, "gần Q1", "đang chiếu") always wins, so a mixed
 * "phim nào hay và rạp nào gần tôi" keeps the place tool.
 */
export function detectMovieRecommendationIntent(text: string): boolean {
  const t = normalizeVN(text.toLowerCase())
  if (!movieRe.test(t)) return false
  if (cinemaVenueRe.test(t)) return false
  return recommendWatchRe.test(t)
}

/** Asks WHERE without naming anywhere — a weak signal, never decisive alone. */
const weakWhereRe = /\bo\s+dau\b|\bcho\s+nao\b/

/** The turn is about acquiring a product, so a bare "where" is answerable online. Bare `\bmua\b`
 *  also matches "mùa"/"mưa" once diacritics are stripped; that costs a place question its offline
 *  hint and nothing more, and detectForcedTool already accepts the same ambiguity. */
const purchaseRe = /\bmua\b|\bco ban\b|san pham|dat hang|order hang|\bbuy\b|\bpurchase\b/

/**
 * Item 8 (2026-09-19): the physical-store prompt block ("dùng search_places, KHÔNG search_products")
 * only matters when a PURCHASE is in play — it rode every turn that named a district, including
 * "Tìm quán ăn tối gần Quận 1" (measured F8, E1): 130 tokens steering a choice that did not exist.
 */
export function isPurchaseShaped(text: string): boolean {
  const t = normalizeVN(text.toLowerCase().trim())
  return purchaseRe.test(t) || /\bcua\s*hang\b|\btiem\b|\bshop\b|\bsieu\s*thi\b|\bmall\b|\bplaza\b|\bchi\s*nhanh\b/.test(t)
}

export function detectLocationIntent(text: string): 'offline' | 'online' | 'unknown' {
  const t = normalizeVN(text.toLowerCase().trim())
  // Online signals
  const onlineRe = /\bonline\b|ship\b|\border\b|giao\s*hang|free\s*ship|voucher|flash\s*sale|\bshopee\b|\blazada\b|\btiki\b|\bsendo\b|mua\s*tren|dat\s*hang\s*online|giao\s*tan\s*noi|\bcod\b|mua\s*online/
  // Offline signals: district names, streets, nearby, physical store. Each one names a PLACE, so
  // any single match decides on its own.
  const offlineRe = /\bq\.\s*\d+\b|\bq\.\s*[a-z]+|\bquan\s+\d+\b|\bquan\s+(binh|phu|go|tan|nha|hoc|can|cu|thu|ba|cau|dong|hai|hoan|tay|thanh)\b|\bphuong\s+\w+|\bhuyen\s+\w+|\bduong\s+[a-z]|\bpho\s+[a-z]|\bgan\s+(day|nha|minh)\b|\bkhu\s+vuc\b|\bcua\s*hang\b|\btiem\b|\bchi\s*nhanh\b|\bsieu\s*thi\b|\btrung\s*tam\s*thuong\s*mai\b|\bmall\b|\bplaza\b|\bden\s+(mua|xem)\b|\bghe\s+(qua|toi|vao)\b/
  if (offlineRe.test(t)) return 'offline'
  if (onlineRe.test(t)) return 'online'
  // "ở đâu" / "chỗ nào" ask WHERE — they name no place. A marketplace link answers them as well
  // as a shop address does, so alone they cannot mean "physical store". They used to sit in
  // offlineRe above, and because the route DROPS search_products whenever this returns 'offline',
  // the most ordinary Vietnamese shopping phrasing — "mua X ở đâu" — lost the shopping tool
  // entirely. Measured 2026-08-11 on the stored benchmarks: 12-vi called no tool at all in both
  // runs while its English twin called search_products. They keep their place meaning for
  // everything that is NOT a purchase, which is why the weak check is last: a real location
  // marker or an explicit marketplace above still wins outright.
  if (weakWhereRe.test(t) && !purchaseRe.test(t)) return 'offline'
  return 'unknown'
}

// REMOVED (C2): isShoppingQuery. Its only caller was inside the route's
// `prepareStep` block, which streamText never executed (see the note there), so
// the function had no effect on any request. Deleted with that block rather than
// left as a plausible-looking helper nothing calls.
