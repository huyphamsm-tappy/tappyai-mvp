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

  // Every word accented — a bare Vietnamese phrase or place name on its own
  // ("Đâu?", "Đà Nẵng"), with no English word to anchor it the other way.
  if (accentedWords === words.length) return 'vi'
  // Real Vietnamese vocabulary plus Vietnamese grammar words, even when tone
  // marks are sparse.
  if (lowercaseAccentedWords >= 1 && viFunctionWords >= 2) return 'vi'
  // An unambiguous English question/request word settles it. Reached only after the two rules
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

/** Asks WHERE without naming anywhere — a weak signal, never decisive alone. */
const weakWhereRe = /\bo\s+dau\b|\bcho\s+nao\b/

/** The turn is about acquiring a product, so a bare "where" is answerable online. Bare `\bmua\b`
 *  also matches "mùa"/"mưa" once diacritics are stripped; that costs a place question its offline
 *  hint and nothing more, and detectForcedTool already accepts the same ambiguity. */
const purchaseRe = /\bmua\b|\bco ban\b|san pham|dat hang|order hang|\bbuy\b|\bpurchase\b/

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
