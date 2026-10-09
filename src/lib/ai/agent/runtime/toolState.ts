// ── Phase 8 WS2 final — explicit tool result states + the public-web fallback for a failed product provider (TAPPY_AGENT=2) ───────
//
// A tool failure is NOT evidence. "search timed out" ≠ "no products exist"; "Places failed" ≠ "the business is closed"; "the booking
// provider is unavailable" ≠ "no availability"; "search_products timed out" ≠ "the price is X". Every tool result the model reads carries
// ONE explicit state, so a failure can never be read as a fact:
//
//   SUCCESS      the tool returned data;
//   EMPTY        the tool ran and found nothing (its row lists are empty) — a real "no result", still not proof of absence;
//   TIMEOUT      the provider did not answer in time;
//   ERROR        the provider / tool failed;
//   UNAVAILABLE  the call was not made (budget, quota, permission, refusal) or the provider reported itself unavailable.
//
// The product provider (search_products: Google Shopping fan-out + commerce adapters) is the one measured to time out (WS-P1, 15 s). Its
// failure is answered by a BOUNDED fallback inside the same tool call: one public-web price search that opens the best page (the research
// reader: SSRF-safe fetch, page budget, evidence ledger) — never a retry loop, never past the tool's own time budget. If the fallback
// finds nothing usable either, the state stays a failure and the price is UNKNOWN: the model is told so, and the No-Fabrication Gate
// (noFabricationGate.ts) removes any price the reply states without evidence.

export type ToolState = 'SUCCESS' | 'EMPTY' | 'TIMEOUT' | 'ERROR' | 'UNAVAILABLE'

const ROW_KEYS = ['results', 'places', 'hotels', 'products', 'shopping_results', 'search_results', 'articles', 'events', 'pages']
const UNAVAILABLE_RE = /budget|quota|exhausted|refused|unavailable|disabled|not_offered|not_allowed|permission|rate_limit|tool_unavailable/i

/** The state of a tool result (pure). `outcome` is the loop's execution outcome. */
export function toolStateOf(outcome: 'ok' | 'timeout' | 'error' | string, result: unknown): ToolState {
  if (outcome === 'timeout') return 'TIMEOUT'
  if (outcome === 'error') return 'ERROR'
  if (outcome !== 'ok') return 'UNAVAILABLE'
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'SUCCESS'
  const r = result as Record<string, unknown>
  if (typeof r.tool_state === 'string' && ['SUCCESS', 'EMPTY', 'TIMEOUT', 'ERROR', 'UNAVAILABLE'].includes(r.tool_state)) return r.tool_state as ToolState
  const err = typeof r.error === 'string' ? r.error : typeof r.refused === 'string' ? r.refused : ''
  if (err) return /timeout/i.test(err) ? 'TIMEOUT' : UNAVAILABLE_RE.test(err) ? 'UNAVAILABLE' : 'ERROR'
  if (typeof r.place_search_status === 'string' && /budget|exhaust|quota/i.test(r.place_search_status)) return 'UNAVAILABLE'
  // POST-UAT B4: a product lookup that says it holds no product data (only the marketplaces' SEARCH links) is never SUCCESS.
  if (r.product_data === 'none') return r.provider_status === 'error' ? 'ERROR' : 'EMPTY'
  const lists = ROW_KEYS.filter(k => Array.isArray(r[k]))
  const noRows = lists.length > 0 && lists.every(k => (r[k] as unknown[]).length === 0)
  // A provider that FAILED and returned no rows is an ERROR, never an EMPTY "no result".
  if (noRows && r.provider_status === 'error') return 'ERROR'
  if (noRows) return 'EMPTY'
  return 'SUCCESS'
}

/** What the model reads beside a non-SUCCESS state: the failure is not a fact. */
export function toolStateNote(state: ToolState, lang: string): string | null {
  const en = lang === 'en'
  switch (state) {
    case 'EMPTY': return en ? 'No result for this query — that does not prove it does not exist; do not state anything this lookup did not return.' : 'Không có kết quả cho truy vấn này — không chứng minh là không tồn tại; không nêu điều tra cứu này không trả về.'
    case 'TIMEOUT': case 'ERROR': case 'UNAVAILABLE': return en ? 'This lookup did not return data (a failure is not evidence: not "none", not "closed", not "sold out"). If the fact is still needed, use another source; otherwise say it is not verified — never fill it from memory.' : 'Tra cứu này không trả về dữ liệu (lỗi KHÔNG phải bằng chứng: không có nghĩa là không có, đã đóng hay hết chỗ). Nếu vẫn cần, dùng nguồn khác; không được thì nói chưa xác minh — không điền từ trí nhớ.'
    default: return null
  }
}

/** Adds the explicit state (and its note) to a tool result the model reads. Non-object results are wrapped. */
export function withToolState(result: unknown, state: ToolState, lang: string): unknown {
  const note = toolStateNote(state, lang)
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>
    return { ...r, tool_state: state, ...(note && !r.state_note ? { state_note: note } : {}) }
  }
  return { tool_state: state, value: result, ...(note ? { state_note: note } : {}) }
}

/**
 * POST-UAT B4 — how usable a search_products result is for a product question (metadata beside the unchanged public state):
 *   usable   at least one product row with a title and a price (a priced Shopping row or offer);
 *   partial  product rows, none priced (names / merchant pages only — enough for discovery, not for a current-price answer);
 *   none     no product row at all (marketplace SEARCH links, shop-info snippets and notes are not product data).
 */
export type DataUsability = 'usable' | 'partial' | 'none'
export function productDataUsability(result: unknown): DataUsability {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'none'
  const r = result as Record<string, unknown>
  if (r.product_data === 'none') return 'none'
  const rows = ['shopping_results', 'search_results', 'products'].flatMap(k => Array.isArray(r[k]) ? (r[k] as unknown[]) : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).title === 'string')
  if (!rows.length) return 'none'
  const priced = rows.some(x => typeof x.price_vnd === 'number' || typeof x.price === 'number' || (typeof x.price === 'string' && /\d/.test(x.price)))
  return priced ? 'usable' : 'partial'
}

type Exec = (args: Record<string, unknown>, ctx: { toolCallId: string; messages: unknown[] }) => unknown

/** The product provider's own time inside the tool budget (the fallback needs the rest). */
export const PRODUCT_PROVIDER_TIMEOUT_MS = 8_000

/**
 * search_products with a bounded public-web fallback. On TIMEOUT / ERROR / UNAVAILABLE of the provider: ONE price search (the research
 * web_search, opening the best page) for the same query. The result says what happened, in states, and carries the fallback's evidence.
 */
/** The whole tool's time inside the runtime's per-tool timeout (15 s): the fallback gets what the provider left, minus a margin. */
export const PRODUCT_TOOL_BUDGET_MS = 14_000
const FALLBACK_MIN_MS = 2_500

export function withProductFallback(primary: Exec, webSearch: Exec | null, o: { lang: string; timeoutMs?: number; budgetMs?: number; now?: () => number; onFallback?: (d: { state: ToolState; fallbackState: ToolState | 'none' | 'skipped_deadline'; usability?: DataUsability }) => void }): Exec {
  return async (args, ctx) => {
    const now = o.now ?? Date.now
    const started = now()
    const timeoutMs = o.timeoutMs ?? PRODUCT_PROVIDER_TIMEOUT_MS
    let state: ToolState
    let value: unknown
    try {
      value = await Promise.race([
        Promise.resolve(primary(args, ctx)),
        new Promise((_, rej) => setTimeout(() => rej(new Error('provider_timeout')), timeoutMs)),
      ])
      state = toolStateOf('ok', value)
    } catch (e) {
      state = e instanceof Error && e.message === 'provider_timeout' ? 'TIMEOUT' : 'ERROR'
      value = { error: state === 'TIMEOUT' ? 'provider_timeout' : 'provider_error' }
    }
    const usability: DataUsability = state === 'SUCCESS' ? productDataUsability(value) : 'none'
    // POST-UAT B4: PARTIAL product data (rows, none priced) does not suppress the fallback; usable data and a genuine EMPTY do.
    const needsFallback = state === 'TIMEOUT' || state === 'ERROR' || state === 'UNAVAILABLE' || (state === 'SUCCESS' && usability === 'partial')
    const tagged = (v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>), data_usability: usability } : v
    if (!needsFallback || !webSearch) {
      if (needsFallback) o.onFallback?.({ state, fallbackState: 'none', usability })
      return withToolState(tagged(value), state, o.lang)
    }
    // Bounded by the deadline: the fallback runs only with enough of the tool's budget left, and never past it.
    const left = (o.budgetMs ?? PRODUCT_TOOL_BUDGET_MS) - (now() - started)
    if (left < FALLBACK_MIN_MS) {
      o.onFallback?.({ state, fallbackState: 'skipped_deadline', usability })
      return withToolState(tagged(value), state, o.lang)
    }
    const query = typeof args.query === 'string' ? args.query : ''
    let fb: unknown = null
    let fbState: ToolState = 'ERROR'
    try {
      const searchOnce = async () => await webSearch({ queries: [`${query} giá`], read: 1, focus: `giá ${query}`, kind: 'price' }, ctx)
      fb = await Promise.race([
        searchOnce(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('fallback_timeout')), left)),
      ])
      fbState = toolStateOf('ok', fb)
    } catch (e) { fbState = e instanceof Error && e.message === 'fallback_timeout' ? 'TIMEOUT' : 'ERROR' }
    o.onFallback?.({ state, fallbackState: fbState, usability })
    const en = o.lang === 'en'
    const fallback = { tool: 'web_search', tool_state: fbState, ...(fb && typeof fb === 'object' ? fb as Record<string, unknown> : {}) }
    if (state === 'SUCCESS') {
      // Partial provider rows are kept (real names / pages); the fallback adds the price evidence they lack.
      return withToolState({ ...(value as Record<string, unknown>), data_usability: usability, fallback,
        fallback_note: en ? 'The product rows carry no price; the fallback is a public-web price search. A price neither states is UNKNOWN.' : 'Các dòng sản phẩm không có giá; phần fallback là tra giá trên web công khai. Giá không có ở đâu thì CHƯA XÁC MINH.' }, state, o.lang)
    }
    return {
      tool_state: state,
      provider: 'search_products',
      data_usability: usability,
      state_note: toolStateNote(state, o.lang),
      fallback,
      note: fbState === 'SUCCESS'
        ? (en ? 'The product provider failed; these are public-web results for the same query. Use only what they state (cite pages as [S#]); a price they do not state is UNKNOWN.' : 'Nguồn sản phẩm lỗi; đây là kết quả web công khai cho cùng truy vấn. Chỉ dùng điều chúng ghi (trích trang bằng [S#]); giá không có trong đó là CHƯA XÁC MINH.')
        : (en ? 'Neither the product provider nor the public-web fallback returned data: the current price is NOT verified — say so; do not estimate it from memory.' : 'Cả nguồn sản phẩm lẫn tra cứu web dự phòng đều không có dữ liệu: giá hiện tại CHƯA XÁC MINH — nói rõ; không ước từ trí nhớ.'),
    }
  }
}
