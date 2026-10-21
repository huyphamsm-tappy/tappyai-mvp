// ── C2 · latency policies for the agent loop (Phase 2/3). EVERY lever has its own flag and is OFF by default ─────────────────────────────────
//
// Measured on prototype C (benchmark 18/10, 100 turns, traces matched to results by content): a model round costs ~2 s + ~10 ms per output token,
// 2.49 rounds per turn; questions needing fresh data used tools in 49 of 50 turns (3.60 rounds on average), questions needing none in 3 of 44
// (1.18 rounds); only 20 of 145 tool rounds called more than one tool. Winning did not depend on the extra rounds (C won 65 % of turns that took
// ≤ 20 s and 66 % of those > 30 s). The levers below cut rounds; none of them lowers reasoning globally, none streams private
// reasoning or raw tool payloads, and none touches a guard, the quota, the pending-action confirmation or the clarify credit.
//
//   C2_TOOL_GATE=1           a question that is plainly stable knowledge / writing / explanation (and carries no sign of needing fresh, local, price,
//                            booking or page data) is answered in ONE round with no tool schema offered. Unsure → tools stay (conservative).
//   C2_ROUND_CAP=1           after the first tool round the next round is the FINAL one (no tools), unless a logged exception applies: the round's
//                            lookups all failed / came back empty (`evidence_missing`, one more tool round), or the turn is a plan (up to 3 tool rounds).
//                            A soft time budget (C2_SOFT_BUDGET_MS, default 20 000; plans 45 000) also makes the next round final.
//   C2_BATCH_NOTE=1          a non-final round is told to put every independent lookup into the SAME round (parallel calls / several queries).
//   C2_TOOL_ROUND_EFFORT=x   the reasoning effort of tool-offering rounds only (none|low|medium|high); the answer round keeps its own effort.
//   C2_LENGTH_RECOVERY=1     an answer cut by the output limit gets ONE bounded continuation; still cut → an explicit "may be incomplete" line and the
//                            turn is flagged incomplete (never counted as a normal success). A round that spent all its output on reasoning and wrote
//                            nothing is re-run once with a larger output budget instead of being forced final.
//   C2_REASONING_HEADROOM_TOKENS=n   (adapter) max_output_tokens = answer budget + n when reasoning is on (reasoning tokens count inside that limit).
//   C2_PROGRESS=1            P1: status frames (`8:` annotations, never answer text) at turn start and when each kind of lookup starts.

const flag = (k: string): boolean => (process.env[k] ?? '').trim() === '1'
export const c2ToolGateOn = (): boolean => flag('C2_TOOL_GATE')
export const c2RoundCapOn = (): boolean => flag('C2_ROUND_CAP')
export const c2BatchNoteOn = (): boolean => flag('C2_BATCH_NOTE')
export const c2LengthRecoveryOn = (): boolean => flag('C2_LENGTH_RECOVERY')
export const c2ProgressOn = (): boolean => flag('C2_PROGRESS')
/** P2 layer 3: the runtime streams the final answer's released lines into the data stream (the route still decides what the user sees). */
export const c2StreamDataStreamOn = (): boolean => flag('C2_STREAM_DATASTREAM')
export function c2ToolRoundEffort(): 'none' | 'low' | 'medium' | 'high' | null {
  const v = (process.env.C2_TOOL_ROUND_EFFORT ?? '').trim().toLowerCase()
  return v === 'none' || v === 'low' || v === 'medium' || v === 'high' ? v : null
}
export function c2SoftBudgetMs(plan: boolean): number {
  const n = Number((process.env.C2_SOFT_BUDGET_MS ?? '').trim())
  const base = Number.isFinite(n) && n > 0 ? n : 20_000
  return plan ? Math.max(base, 45_000) : base
}

const fold = (s: string): string => ` ${s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9?]+/g, ' ').replace(/\s+/g, ' ').trim()} `

/**
 * Signs that the answer depends on data that changes, on a place, a price, a booking, a page or the news: tools must stay available.
 * Benchmark A2 (19/10): news / incident / trending words were missing — "vụ cháy … mới xảy ra sao rồi … tóm tắt" and "phim Việt nào đang hot trên
 * Netflix" were answered with no lookup.
 */
const NEEDS_DATA = /\s(?:hom nay|bay gio|hien nay|hien tai|moi nhat|gan day|tuan nay|tuan sau|thang nay|nam nay|toi nay|sang nay|chieu nay|ngay mai|cuoi tuan|dip le|tet nay|today|tonight|tomorrow|now|right now|latest|current|currently|this week|next week|this year|recent|recently|20[0-9]{2}|ty gia|gia|gia ca|bao nhieu tien|chi phi|phi|price|prices|cost|costs|rate|fee|thoi tiet|weather|nhiet do|mua khong|tin tuc|tin moi|news|xay ra|vua roi|moi day|vu chay|chay no|hoa hoan|tai nan|su co|dong dat|con bao|bao so|lu lut|ngap lut|thien tai|dang hot|hot nhat|trending|thinh hanh|viral|netflix|youtube|tiktok|xep hang|dang chieu|ra mat|happened|breaking|ket qua|ty so|score|lich thi dau|lich chieu|suat chieu|gio mo cua|mo cua|dong cua|open|opening|closed|o dau|gan day|quanh day|gan nha|near|nearby|around here|dia chi|address|duong di|chi duong|directions|mua o|mua dau|noi ban|ban o|dat ban|dat phong|dat ve|book|booking|ve may bay|ve tau|ve xe|ve xem|ticket|tickets|khach san|hotel|resort|homestay|chuyen bay|flight|tau hoa|xe khach|bus|grab|quan an|quan nao|quan [0-9]+|ngon|an gi|uong gi|nha hang|restaurant|cafe|ca phe|shop|cua hang|sieu thi|deal|khuyen mai|sale|giam gia|voucher|so sanh gia|review|danh gia|top|nen mua|link|website|trang web|http|www|lai suat|chung khoan|co phieu|vang|bitcoin|crypto|xang|dien|nuoc|luong|cong viec tuyen|tuyen dung|lich trinh|du lich|di choi|trip|travel|visa|thu tuc|ho so|giay to|quy dinh|luat moi|nghi dinh|thong tu|mua|nen chon|chon mua|ngan sach|budget|buy|purchase|[0-9]+ ?(?:k|tr|trieu|nghin|ngan|dong|vnd|usd|d)|trieu|nghin|dong|vnd|usd|laptop|macbook|dien thoai|iphone|ipad|samsung|xiaomi|may tinh|tai nghe|tivi|tu lanh|may giat|xe may|o to)\s/
/**
 * Signs of a stable-knowledge, explanation, how-to or writing request. "viết" (write) only with what follows a writing request: folded, a bare "viet"
 * is also "Việt" (Vietnamese) — "phim Việt", "người Việt" are not writing requests (benchmark A2, 19/10).
 */
const STABLE_TASK = /\s(?:giai thich|vi du|la gi|la ai|ai la|tai sao|vi sao|nhu the nao|the nao|lam sao|lam the nao|cach|huong dan|viet (?:giup|ho|cho|mot|lai|bai|email|thu|doan|cau|loi|caption|status|van|truyen|tho|code|noi dung)|dich|tom tat|soan|y nghia|nghia la|khac nhau|phan biet|so sanh|loi khuyen|meo|tu van|nen lam gi|co nen|hoc|on thi|bai tap|giai bai|cong thuc|code|python|javascript|typescript|sql|lap trinh|thuat toan|explain|example|examples|what is|what are|who is|who was|why|how do|how does|how to|how can|write|rewrite|translate|summarize|summary|tips|advice|should i|difference|meaning|define|definition|teach|learn|study|exam|homework|algorithm)\s/

export interface ToolGateDecision { gate: 'no_tools' | 'tools'; reason: string }
/**
 * C2_TOOL_GATE: should this turn offer tools at all? Read from the user's words only (no model call). `no_tools` only when the latest message shows
 * a stable-knowledge / writing sign AND no sign of needing fresh, local, price, shopping, booking or page data — in it OR in the earlier user
 * messages of the conversation (a short follow-up like "chủ yếu để code" belongs to the task it answers: "mua MacBook … 25 triệu"). A turn that
 * answers a pending task question keeps the tools too. Anything else — including every message in a script the folding cannot read (e.g. Chinese,
 * Korean, Japanese, Thai) — keeps the tools (conservative: a wrong `no_tools` costs quality, a wrong `tools` only costs time).
 */
export function toolGate(userText: string, ctx: { earlierUserTexts?: readonly string[]; pendingQuestion?: boolean } = {}): ToolGateDecision {
  const raw = (userText ?? '').trim()
  if (!raw) return { gate: 'tools', reason: 'empty' }
  if (ctx.pendingQuestion) return { gate: 'tools', reason: 'answers_pending_question' }
  if ((ctx.earlierUserTexts ?? []).some(t => /https?:\/\/|www\./i.test(t ?? '') || NEEDS_DATA.test(fold(t ?? '')))) return { gate: 'tools', reason: 'conversation_needs_data' }
  if (/https?:\/\/|www\./i.test(raw)) return { gate: 'tools', reason: 'url_in_message' }
  const f = fold(raw)
  const letters = f.replace(/[^a-z]/g, '').length
  if (letters < Math.min(12, raw.replace(/\s/g, '').length * 0.5)) return { gate: 'tools', reason: 'script_not_folded' }
  if (NEEDS_DATA.test(f)) return { gate: 'tools', reason: 'needs_data_sign' }
  if (STABLE_TASK.test(f)) return { gate: 'no_tools', reason: 'stable_task' }
  return { gate: 'tools', reason: 'no_stable_sign' }
}

/** Signs of a multi-part plan (itinerary, schedule, N-day trip): such a turn may run up to 3 lookup rounds under C2_ROUND_CAP. */
const PLAN_SIGN = /\s(?:lich trinh|ke hoach|len plan|plan|itinerary|schedule|tour|[0-9]+ ?(?:ngay|dem|days?|nights?)|[0-9]+n ?[0-9]+d|[0-9]+d ?[0-9]+n|mot tuan|1 tuan|a week|cuoi tuan nay di|di dau)\s/
export function planTurn(userText: string): boolean {
  return PLAN_SIGN.test(fold(userText ?? ''))
}

export interface RoundDecision { final: boolean; reason: string }
/**
 * C2_ROUND_CAP: must the NEXT model round be the final, tool-less one? `toolRounds` = rounds that already ran lookups this turn;
 * `lastRoundStates` = the tool states (SUCCESS / EMPTY / ERROR / TIMEOUT / UNAVAILABLE …) of the most recent lookup round.
 */
export function roundDecision(s: { toolRounds: number; lastRoundStates: readonly string[]; plan: boolean; elapsedMs: number; softBudgetMs: number }): RoundDecision {
  if (s.toolRounds === 0) return { final: false, reason: 'no_lookup_yet' }
  if (s.elapsedMs >= s.softBudgetMs) return { final: true, reason: 'soft_time_budget' }
  const limit = s.plan ? 3 : 1
  if (s.toolRounds < limit) return { final: false, reason: s.plan ? 'plan_task' : 'within_cap' }
  const nothingUsable = s.lastRoundStates.length > 0 && s.lastRoundStates.every(st => st !== 'SUCCESS')
  if (nothingUsable && s.toolRounds < limit + 1) return { final: false, reason: 'evidence_missing' }
  return { final: true, reason: 'round_cap' }
}

export function batchNote(lang: string): string {
  return lang === 'en'
    ? '\n\nIf you need several independent lookups, request ALL of them in this same step (several tool calls at once, or one web_search with several queries) — not one per step.'
    : '\n\nNếu cần tra nhiều điều độc lập, hãy gọi TẤT CẢ trong cùng bước này (nhiều lệnh gọi cùng lúc, hoặc một web_search với nhiều queries) — không gọi lần lượt từng bước.'
}
export function continuationPrompt(lang: string): string {
  return lang === 'en'
    ? 'Your previous answer was cut off by the length limit. Continue EXACTLY where it stopped — do not repeat anything already written, do not start over, add no new claims you have not already supported, and finish briefly.'
    : 'Câu trả lời trước bị cắt vì giới hạn độ dài. Viết TIẾP ĐÚNG từ chỗ dừng — không lặp lại phần đã viết, không viết lại từ đầu, không thêm nhận định chưa có căn cứ, và kết thúc gọn.'
}
export function incompleteNote(lang: string): string {
  return lang === 'en' ? '\n\n_(This answer may be incomplete — it hit the length limit. Ask me to continue if you need the rest.)_' : '\n\n_(Câu trả lời có thể chưa đầy đủ vì chạm giới hạn độ dài. Bạn nhắn “tiếp tục” nếu cần phần còn lại.)_'
}

/** Joins a cut answer and its continuation; drops an overlap if the continuation repeats the tail it was given. */
export function joinContinuation(head: string, tail: string): string {
  const t = tail.replace(/^\s+/, '')
  if (!t) return head
  for (let n = Math.min(200, head.length, t.length); n >= 12; n--) if (head.endsWith(t.slice(0, n))) return head + t.slice(n)
  const sep = /[\s\n]$/.test(head) || /^[,.;:!?)\]]/.test(t) ? '' : /[.!?…:]$/.test(head.trim()) ? '\n\n' : ' '
  return head + sep + t
}

// ── P1 status lines (`tappy.progress.v1` annotations). Fixed copy per KIND of lookup: never the user's words, never a query, never tool data. ──
const TOOL_LABEL: Record<string, { vi: string; en: string }> = {
  search_places: { vi: 'Đang tìm địa điểm…', en: 'Searching places…' },
  web_search: { vi: 'Đang tìm trên web…', en: 'Searching the web…' },
  read_page: { vi: 'Đang đọc nguồn…', en: 'Reading a source…' },
  get_news: { vi: 'Đang xem tin mới…', en: 'Checking the news…' },
  get_weather: { vi: 'Đang xem thời tiết…', en: 'Checking the weather…' },
  get_gold_price: { vi: 'Đang xem giá vàng…', en: 'Checking gold prices…' },
  search_products: { vi: 'Đang so giá sản phẩm…', en: 'Comparing product prices…' },
  get_transport_options: { vi: 'Đang xem phương tiện đi lại…', en: 'Checking transport options…' },
  get_trip_data: { vi: 'Đang gom thông tin chuyến đi…', en: 'Gathering trip information…' },
  get_flight_prices: { vi: 'Đang xem giá vé máy bay…', en: 'Checking flight prices…' },
  get_hotel_prices: { vi: 'Đang xem giá khách sạn…', en: 'Checking hotel prices…' },
}
export function progressLabelForTool(tool: string, lang: string): string {
  const l = TOOL_LABEL[tool]
  return l ? (lang === 'en' ? l.en : l.vi) : lang === 'en' ? 'Looking things up…' : 'Đang tra cứu…'
}
export function thinkingLabel(lang: string): string { return lang === 'en' ? 'Tappy is thinking…' : 'Tappy đang suy nghĩ…' }
export function writingLabel(lang: string): string { return lang === 'en' ? 'Writing the answer…' : 'Đang viết câu trả lời…' }
