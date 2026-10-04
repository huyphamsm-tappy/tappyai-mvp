// ── Bounded agent — the tool surface Luna sees ─────────────────────────────────────────────────────────────────────────────
//
// The production tools stay where they are (route.ts builds them with the turn's collector, budgets, commerce links, ranking and card
// enrichment). This file only:
//   · turns them into SCHEMA-ONLY definitions for the model, each with a `why` field (logged, never shown, never executed);
//   · adds the two agent tools the old pipeline ran as fixed code: `get_now_showing` (searchIntel/filmSearch) and `request_action`
//     (side-effecting actions — they are NEVER executed by the model: code validates, the user confirms, then code executes);
//   · leaves out every side-effecting production tool from the model's reach (save_price_watch is reachable only through request_action).

import { tool } from 'ai'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { webSearch } from '@/lib/ai/tools/common'
import { filmQueries, extractFilmEvidence, filmEvidencePayload, FILM_ENOUGH } from '@/lib/ai/searchIntel/filmSearch'
import { movieQuery, extractMovieFacts, movieFactsPayload, filmPageLinks } from '@/lib/ai/searchIntel/movieShowtimes'

/** Production tools that change something outside the conversation. Never callable by the model directly. */
export const SIDE_EFFECT_TOOLS = new Set(['save_price_watch'])

type AnyTool = { description?: string; parameters?: unknown; execute?: (args: Record<string, unknown>, ctx: { toolCallId: string; messages: unknown[] }) => unknown }

const WHY = z.string().max(160).optional().describe('Lý do ngắn (≤12 từ) vì sao gọi công cụ này. Không hiển thị cho người dùng.')

/** Schema-only copies for the model: same description and parameters, plus `why`; no execute. Side-effect tools are dropped. */
export function toModelSchemas(tools: Record<string, AnyTool>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, t] of Object.entries(tools)) {
    if (!t || SIDE_EFFECT_TOOLS.has(name)) continue
    const params = t.parameters as { extend?: (shape: Record<string, unknown>) => unknown } | undefined
    out[name] = tool({ description: t.description ?? name, parameters: (params?.extend ? params.extend({ why: WHY }) : z.object({ why: WHY })) as z.ZodTypeAny })
  }
  return out
}

/** "Phim gì đang chiếu" as a tool: a dated query, a second only when the first yields too few titles (≤2 web searches inside). */
export function nowShowingTool(lang: string, now: () => Date = () => new Date()) {
  return tool({
    description: 'Danh sách PHIM ĐANG CHIẾU RẠP hôm nay tại Việt Nam (tên phim, nguồn Moveek / cụm rạp). Dùng cho "phim gì hay / đang chiếu / tối nay xem phim gì". Không có suất chiếu, giá vé hay điểm đánh giá.',
    parameters: z.object({ upcoming: z.boolean().optional().describe('true = phim sắp chiếu thay vì đang chiếu'), why: WHY }),
    execute: async ({ upcoming }) => {
      const t = now()
      const [q1, q2] = filmQueries(upcoming ? 'phim sắp chiếu' : 'phim đang chiếu', t)
      let ev = extractFilmEvidence(await webSearch(q1, lang), t)
      if (ev.titles.length < FILM_ENOUGH) {
        const more = extractFilmEvidence(await webSearch(q2, lang), t)
        const seen = new Set(ev.titles.map(x => x.toLowerCase()))
        ev = { ...ev, titles: [...ev.titles, ...more.titles.filter(x => !seen.has(x.toLowerCase()))].slice(0, 14), sources: [...ev.sources, ...more.sources.filter(s => !ev.sources.some(y => y.url === s.url))].slice(0, 3) }
      }
      return { source: 'Google (Serper)', results: ev.sources.map(s => ({ title: s.host, link: s.url })), ...filmEvidencePayload(ev) }
    },
  })
}

/**
 * A side-effecting action waiting for the user's confirmation. `argsHash` binds the approval to the EXACT arguments shown to the user;
 * `id` is the idempotency key; `expiresAt` ends a stale approval (10 minutes).
 */
/**
 * A SPECIFIC film (title, optional date): metadata from the film pages, whether it is showing today, the providers' film-page links. Showtimes per
 * cinema / date and ticket prices are returned as NOT VERIFIED (no current source publishes them — searchIntel/movieShowtimes.ts). ≤2 web searches.
 */
export function movieShowtimesTool(lang: string, now: () => Date = () => new Date()) {
  return tool({
    description: 'Thông tin MỘT PHIM CỤ THỂ đang chiếu rạp: thể loại, thời lượng, độ tuổi, khởi chiếu, điểm hài lòng, có đang chiếu hôm nay không, trang phim của rạp/Moveek. Dùng khi người dùng hỏi về một phim có tên (suất chiếu, rạp, giá vé). Suất theo rạp và giá vé chưa có nguồn — công cụ sẽ nói rõ.',
    parameters: z.object({
      movieTitle: z.string().describe('Tên phim đúng như người dùng/danh sách phim viết'),
      date: z.string().optional().describe('Ngày YYYY-MM-DD (mặc định hôm nay; lấy từ LỊCH trong ngữ cảnh)'),
      city: z.string().optional().describe('Thành phố (mặc định nơi người dùng đang ở)'),
      why: WHY,
    }),
    execute: async ({ movieTitle }) => {
      const t = now()
      const [film, list] = await Promise.all([webSearch(movieQuery(movieTitle), lang), webSearch(filmQueries('phim đang chiếu', t)[0], lang)])
      const nowShowing = extractFilmEvidence(list, t).titles
      const facts = extractMovieFacts(movieTitle, film, nowShowing.length ? nowShowing : null, t)
      return { source: 'Google (Serper)', results: facts.sources.map(s => ({ title: s.host, link: s.url })), ...movieFactsPayload(facts), ...filmPageLinks(movieTitle, film, t) }
    },
  })
}

/**
 * Verification labels on a fare result (Rule: never present an unverified field as fact). A fare counts as verified for the asked date only when
 * a provider row departs on that date; schedule and live status have no source unless a row carries them.
 */
export function labelFlightVerification(result: unknown): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result
  return {
    ...(result as Record<string, unknown>),
    _tappy_verification: {
      fare_for_date: 'not_verified',
      schedule: 'not_verified',
      flight_status: 'not_verified',
      note: 'Giá vé hiện chưa xác minh được từ nguồn dữ liệu đang có. Nói đúng câu này; giờ bay và tình trạng chuyến cũng chưa xác minh. Nút đặt vé chỉ để xem giá theo ngày, không phải bằng chứng giá.',
    },
  }
}

export interface PendingAction { id: string; tool: string; args: Record<string, unknown>; argsHash: string; summary: string; at: string; expiresAt: string }
export const ACTION_TTL_MS = 10 * 60_000

const stableJson = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  return `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`
}
export const actionArgsHash = (tool: string, args: Record<string, unknown>): string => createHash('sha256').update(`${tool}|${stableJson(args)}`).digest('hex')

/**
 * Execution-time revalidation (Rule of Two): the approval is honoured only if the action is still known and executable, the approval has
 * not expired, the stored arguments still pass the tool's own schema, and they are byte-identical (hash) to what the user was shown.
 */
export function revalidatePendingAction(p: PendingAction | null | undefined, tools: Record<string, AnyTool>, now = Date.now()): { ok: true; args: Record<string, unknown> } | { ok: false; reason: 'none' | 'expired' | 'unknown_action' | 'invalid_arguments' | 'args_changed' } {
  if (!p || typeof p !== 'object' || !p.id) return { ok: false, reason: 'none' }
  if (!SIDE_EFFECT_TOOLS.has(p.tool) || !tools[p.tool]?.execute) return { ok: false, reason: 'unknown_action' }
  if (!(Date.parse(p.expiresAt) > now)) return { ok: false, reason: 'expired' }
  const schema = tools[p.tool].parameters as z.ZodTypeAny | undefined
  const parsed = schema?.safeParse ? schema.safeParse(p.args) : { success: true, data: p.args }
  if (!parsed.success) return { ok: false, reason: 'invalid_arguments' }
  if (actionArgsHash(p.tool, parsed.data as Record<string, unknown>) !== p.argsHash) return { ok: false, reason: 'args_changed' }
  return { ok: true, args: parsed.data as Record<string, unknown> }
}

/** In-process idempotency: one execution per action id, even for two concurrent confirmations. The chat-session state keeps it across turns. */
const claimed = new Set<string>()
export function claimActionExecution(id: string, alreadyExecuted: readonly string[] = []): boolean {
  if (!id || claimed.has(id) || alreadyExecuted.includes(id)) return false
  claimed.add(id)
  if (claimed.size > 5000) claimed.delete(claimed.values().next().value as string)
  return true
}

/**
 * Side-effecting actions, REQUESTED by the model, never run by it. The deterministic check here validates the action name and its
 * arguments against the production tool's own schema; a valid request is parked as a pending action the user must confirm on the next
 * turn (route.ts executes it then, through the existing action boundary). No URL, price or claim is created here.
 */
export function requestActionTool(o: { tools: Record<string, AnyTool>; canConfirm: boolean; lang: string; park: (p: PendingAction) => void }) {
  const actions = [...SIDE_EFFECT_TOOLS].filter(n => !!o.tools[n]?.execute)
  return tool({
    description: `Yêu cầu một HÀNH ĐỘNG có tác động (hiện có: ${actions.join(', ') || 'không có'} — theo dõi giá sản phẩm và báo khi giá xuống). Không thực thi ngay: người dùng phải xác nhận ở lượt sau.`,
    parameters: z.object({
      action: z.string().describe(`Tên hành động: ${actions.join(' | ') || 'none'}`),
      args: z.record(z.unknown()).describe('Tham số của hành động, ví dụ save_price_watch: {product_name, target_price (VND), search_query}'),
      why: WHY,
    }),
    execute: async ({ action, args }) => {
      const t = o.tools[action]
      if (!actions.includes(action) || !t?.execute) return { status: 'refused', reason: 'unknown_action' }
      if (!o.canConfirm) return { status: 'refused', reason: o.lang === 'en' ? 'sign-in needed to confirm actions' : 'cần đăng nhập để xác nhận hành động' }
      const schema = t.parameters as z.ZodTypeAny | undefined
      const parsed = schema?.safeParse ? schema.safeParse(args) : { success: true, data: args }
      if (!parsed.success) return { status: 'refused', reason: 'invalid_arguments' }
      const a = parsed.data as Record<string, unknown>
      const summary = action === 'save_price_watch'
        ? (o.lang === 'en' ? `Watch the price of "${String(a.product_name)}" and alert below ${Number(a.target_price).toLocaleString('vi-VN')}đ` : `Theo dõi giá "${String(a.product_name)}", báo khi dưới ${Number(a.target_price).toLocaleString('vi-VN')}đ`)
        : action
      const now = Date.now()
      o.park({ id: randomUUID(), tool: action, args: a, argsHash: actionArgsHash(action, a), summary, at: new Date(now).toISOString(), expiresAt: new Date(now + ACTION_TTL_MS).toISOString() })
      return { status: 'awaiting_user_confirmation', summary, note: o.lang === 'en' ? 'Tell the user what will happen and ask them to confirm. Do not say it is done.' : 'Nói người dùng việc sẽ làm và nhờ xác nhận. Không nói là đã xong.' }
    },
  })
}

/** The outcome of a confirmed / cancelled action, as the agent reads it in its context (never shown verbatim by code). */
export function actionOutcomeText(kind: 'done' | 'failed' | 'cancelled', summary: string, error?: string): string {
  if (kind === 'done') return `Đã thực hiện: ${summary}`
  if (kind === 'failed') return `Không thực hiện được "${summary}": ${String(error ?? '').slice(0, 120)}`
  return `Người dùng đã huỷ: ${summary}`
}

/** "không ngon / đổi chỗ khác / tìm món khác / quán khác" — the user turns down the current suggestion (recorded in app state). */
const REJECT = /(?:kh[oô]ng ngon|đ[oổ]i (?:qu[aá]n|ch[oỗ]|m[oó]n|c[aá]i)|(?:qu[aá]n|ch[oỗ]|m[oó]n|c[aá]i) kh[aá]c|t[iì]m (?:c[aá]i|m[oó]n|qu[aá]n|ch[oỗ]) kh[aá]c|kh[oô]ng th[ií]ch)/i
export function isRejectionTurn(text: string): boolean { return REJECT.test(text) }

// A confirmation must be ONLY a confirmation: "xác nhận nhưng đổi giá 3 triệu" is a new request (the model re-requests, the user confirms again).
const CONFIRM_ONLY = /^(?:x[aá]c nh[aậ]n|đ[oồ]ng [yý]|dong y|ok(?:e|ay)?|c[oó]|l[aà]m đi|lam di|yes|confirm|ch[oố]t|được|duoc|ừ|uh|ờ)(?:\s+(?:nhé|nhe|nha|đi|di|luôn|luon|ạ|a|ok|bạn|ban|giúp mình|giup minh|làm đi|lam di|làm luôn|lam luon))*$/i
const CANCEL = /(?:^|\s)(?:h[uủ]y|huy|kh[oô]ng|th[oô]i|cancel|no|đừng|dung)(?:\s|$)/i
export function confirmationOf(text: string): 'confirm' | 'cancel' | null {
  const t = (text ?? '').toLowerCase().replace(/[!.,?…🙂😊👍✅]+/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (CANCEL.test(t)) return 'cancel'
  return t.length <= 30 && CONFIRM_ONLY.test(t) ? 'confirm' : null
}
