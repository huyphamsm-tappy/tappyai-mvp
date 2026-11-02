// ── Phase 8 M6 — deferred tool schemas: a small core every round, the rest by capability (TAPPY_AGENT=2, web) ────────────────────
//
// Measured before M6 (docs/phase8/M6-TOOL-REGISTRY-AUDIT.md): every model round carried 15 full tool schemas (≈ 12.1k characters,
// ≈ 47 % of the fixed per-round prefix) although a turn uses one or two tools. Now:
//
//   · CORE tools carry their full schema every round: web_search, read_page, search_places (and the control action ask_user, added by
//     the runtime).
//   · DEFERRED tools get their full schema only when this TURN looks like it needs them: a capability hint matches the user's message
//     (or their previous one), or the task used the tool on its previous turn. Deterministic, no model call.
//   · Every other deferred tool stays reachable in the SAME step through one core tool, `use_tool`, whose description lists each one as
//     a capability line with a compact signature DERIVED from the tool's own schema (no second schema is written anywhere).
//
// The set is chosen once per turn and kept for all its rounds: the tool list is part of the provider's cached prompt prefix, and a list
// that changed between rounds would lose that cache.
//
// Security: `use_tool` is never executed as such. The runtime resolves it BEFORE the loop's input guard (loop.ts `resolveCall`) into
// the real tool: the name must be a deferred tool of this turn's tool map (never a side-effect or control tool, never a core tool,
// never something the route did not offer this turn), and the arguments must pass that tool's own Zod schema. The resolved call then
// takes the normal path — input guard, budgets, de-duplication, Serper scope, timeout, output guard, the `9:`/`a:` frames — under its
// own name, so cards (M5), evidence guards (M4) and the trace see exactly what a direct call produces. Anything else returns a
// structured `tool_unavailable` / `invalid_arguments` result; nothing is executed or invented.

import { createHash } from 'node:crypto'
import { tool } from 'ai'
import { z } from 'zod'
import { SIDE_EFFECT_TOOLS } from '../agentTools'
import { CONTROL_TOOLS } from './controlTools'

export const USE_TOOL = 'use_tool'

export type ToolTier = 'core' | 'deferred'
export type SecurityClass = 'read' | 'side_effect_proposal'

/** Metadata only. The implementation and the schema stay where the tool is defined (route / agent tools / runtime). */
export interface ToolMeta {
  name: string
  tier: ToolTier
  category: 'research' | 'local' | 'shopping' | 'travel' | 'info' | 'entertainment' | 'action'
  security: SecurityClass
  /** One line for the capability list (Vietnamese, the user-facing language of the model's instructions). */
  capability: string
  /** Folded substrings (no diacritics, lower case) that make this tool's full schema worth sending on a turn. */
  hints: readonly string[]
}

export const TOOL_REGISTRY: readonly ToolMeta[] = [
  { name: 'web_search', tier: 'core', category: 'research', security: 'read', capability: 'tìm trên web, mở trang', hints: [] },
  { name: 'read_page', tier: 'core', category: 'research', security: 'read', capability: 'đọc trang đã xuất hiện trong tra cứu', hints: [] },
  { name: 'search_places', tier: 'core', category: 'local', security: 'read', capability: 'quán, địa điểm, dịch vụ quanh người dùng', hints: [] },
  { name: 'search_products', tier: 'deferred', category: 'shopping', security: 'read', capability: 'sản phẩm, giá bán, shop (Shopee/Tiki/Lazada, cửa hàng)', hints: ['nen mua', 'muon mua', 'mua o dau', 'mua gi', 'mua cai', 'mua may', 'mua cu', 'gia ban', 'san pham', 'shop', 'shopee', 'lazada', 'tiki', 'laptop', 'macbook', 'iphone', 'dien thoai', 'tai nghe', 'may tinh', 'ipad', 'samsung', 'may cu', 'second hand', 'buy', 'price of', 'product'] },
  { name: 'get_hotel_prices', tier: 'deferred', category: 'travel', security: 'read', capability: 'khách sạn, homestay, resort và giá phòng', hints: ['khach san', 'homestay', 'resort', 'phong nghi', 'luu tru', 'o dau qua dem', 'hotel', 'villa', 'nghi dem'] },
  { name: 'get_flight_prices', tier: 'deferred', category: 'travel', security: 'read', capability: 'vé máy bay, chuyến bay, giá vé bay', hints: ['ve may bay', 'chuyen bay', 'bay ra', 'bay vao', 'bay tu', 'flight', 'hang bay', 'vietjet', 'vietnam airlines', 'bamboo'] },
  { name: 'get_transport_options', tier: 'deferred', category: 'travel', security: 'read', capability: 'xe khách, tàu hỏa, taxi / Grab giữa hai nơi', hints: ['xe khach', 'tau hoa', 'tau lua', 'di chuyen', 'grab', 'taxi', 'xe bus', 'xe buyt', 'limousine', 'bao xa', 'mat bao lau', 'xe giuong nam'] },
  { name: 'get_trip_data', tier: 'deferred', category: 'travel', security: 'read', capability: 'gói dữ liệu kế hoạch du lịch (khách sạn + điểm tham quan + quán đặc sản) ở một điểm đến', hints: ['du lich', 'lich trinh', 'ke hoach', 'chuyen di', 'ngay dem', 'trip', 'itinerary', 'phuot', 'nghi duong'] },
  { name: 'get_weather', tier: 'deferred', category: 'info', security: 'read', capability: 'thời tiết, dự báo', hints: ['thoi tiet', 'co mua', 'troi mua', 'mua khong', 'mua to', 'mua phun', 'nang nong', 'troi nang', 'troi lanh', 'nhiet do', 'du bao', 'weather', 'forecast', 'rain'] },
  { name: 'get_gold_price', tier: 'deferred', category: 'info', security: 'read', capability: 'giá vàng hôm nay', hints: ['gia vang', 'vang sjc', 'vang 9999', 'vang nhan', 'gold'] },
  { name: 'get_news', tier: 'deferred', category: 'info', security: 'read', capability: 'tin tức mới nhất', hints: ['tin tuc', 'tin moi', 'thoi su', 'bao chi', 'news', 'su kien gi', 'hom nay co gi', 'dang xay ra', 'happening'] },
  { name: 'get_now_showing', tier: 'deferred', category: 'entertainment', security: 'read', capability: 'phim đang chiếu rạp hôm nay', hints: ['phim', ' rap ', 'rap phim', 'chieu rap', 'cgv', 'lotte', 'galaxy', 'bhd', 'movie', 'cinema'] },
  { name: 'get_movie_showtimes', tier: 'deferred', category: 'entertainment', security: 'read', capability: 'lịch chiếu một bộ phim', hints: ['suat chieu', 'lich chieu', 'may gio chieu', 'showtime'] },
  { name: 'request_action', tier: 'deferred', category: 'action', security: 'side_effect_proposal', capability: 'đề xuất một việc cần người dùng xác nhận (lưu, theo dõi giá, nhắc)', hints: ['luu lai', 'luu giup', 'theo doi gia', 'bao khi', 'nhac toi', 'nhac minh', 'dat lich', 'save', 'remind', 'track price', 'watch price'] },
]
const META = new Map(TOOL_REGISTRY.map(m => [m.name, m]))
export const metaOf = (name: string): ToolMeta | undefined => META.get(name)

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

type AnyTool = { description?: string; parameters?: unknown; execute?: unknown }

// ── signature cache (derived from the canonical schema, keyed by its version) ──────────────────────────────────────────────────

/**
 * A deterministic fingerprint of a Zod schema: every field, its type, optionality, enum values, bounds and description, recursively.
 * Read from the schema itself (no vendor SDK outside the provider layer — architecture rule no-vendor-sdk-imports).
 */
function fingerprint(s: unknown, depth = 0): unknown {
  if (!s || typeof s !== 'object' || depth > 8) return null
  const def = (s as { _def?: Record<string, unknown> })._def
  if (!def) return null
  const out: Record<string, unknown> = { t: def.typeName, d: def.description ?? null }
  if (def.typeName === 'ZodObject') {
    const shape = typeof def.shape === 'function' ? (def.shape as () => Record<string, unknown>)() : (s as { shape?: Record<string, unknown> }).shape ?? {}
    out.f = Object.keys(shape).sort().map(k => [k, fingerprint(shape[k], depth + 1)])
  }
  if (def.typeName === 'ZodEnum') out.v = def.values
  if (Array.isArray(def.checks)) out.c = (def.checks as Array<{ kind?: string; value?: unknown }>).map(c => [c.kind, c.value ?? null])
  for (const k of ['innerType', 'schema', 'type', 'valueType', 'keyType']) if (def[k]) out[k] = fingerprint(def[k], depth + 1)
  if (Array.isArray(def.options)) out.o = (def.options as unknown[]).map(o => fingerprint(o, depth + 1))
  return out
}

/** The version of a tool's schema: a hash of its description and its schema's fingerprint (a changed field = a new version). */
export function schemaVersion(t: AnyTool): string {
  let js = ''
  try { js = JSON.stringify(fingerprint(t.parameters)) } catch { js = '' }
  return createHash('sha256').update(`${t.description ?? ''}\u0000${js}`).digest('hex').slice(0, 12)
}

/** Process-wide, keyed by tool name AND schema version: a changed schema is a different key (never a stale signature). No user data. */
const SIGNATURE_CACHE = new Map<string, string>()
export function __signatureCacheSize(): number { return SIGNATURE_CACHE.size }
export function __resetSignatureCache(): void { SIGNATURE_CACHE.clear() }

/** "name(a, b?: x|y)" from the tool's own Zod object (the `why` field is the runtime's, not the tool's). */
export function compactSignature(name: string, t: AnyTool): string {
  const key = `${name}@${schemaVersion(t)}`
  const hit = SIGNATURE_CACHE.get(key)
  if (hit) return hit
  const shape = (t.parameters as { shape?: Record<string, z.ZodTypeAny> } | undefined)?.shape ?? {}
  const parts = Object.entries(shape).filter(([k]) => k !== 'why').map(([k, v]) => {
    let opt = false
    let s: z.ZodTypeAny = v
    for (let d = 0; d < 4; d++) {
      const def = (s as { _def?: { typeName?: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny } })._def
      if (def?.typeName === 'ZodOptional' || def?.typeName === 'ZodDefault' || def?.typeName === 'ZodNullable') { opt = true; s = def.innerType as z.ZodTypeAny; continue }
      if (def?.typeName === 'ZodEffects') { s = def.schema as z.ZodTypeAny; continue }
      break
    }
    const tn = (s as { _def?: { typeName?: string; values?: readonly string[] } })._def
    const type = tn?.typeName === 'ZodEnum' ? (tn.values ?? []).slice(0, 5).join('|') : tn?.typeName === 'ZodNumber' ? 'số' : tn?.typeName === 'ZodBoolean' ? 'true|false' : tn?.typeName === 'ZodArray' ? '[…]' : ''
    return `${k}${opt ? '?' : ''}${type ? `: ${type}` : ''}`
  })
  const sig = `${name}(${parts.join(', ')})`
  SIGNATURE_CACHE.set(key, sig)
  return sig
}

// ── per-turn selection ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ToolSelection {
  /** Tools whose full schema goes to the model this turn (core present + preselected deferred). */
  exposed: string[]
  /** Deferred tools reachable through use_tool this turn (not exposed). */
  catalog: string[]
  /** Why each deferred tool was preselected. */
  preselected: Array<{ name: string; reason: 'hint' | 'task' }>
}

/**
 * Which schemas this turn carries. `texts` = the user's latest message and the one before (a follow-up names no subject); `recentTools`
 * = the tools the task used on its previous turn. A tool absent from `tools` (the route did not offer it this turn) is neither exposed
 * nor listed. Unknown tools (no metadata) are exposed as before — never silently hidden.
 */
export function selectTools(tools: Record<string, AnyTool>, o: { texts: readonly string[]; recentTools?: readonly string[]; all?: boolean }): ToolSelection {
  const hay = ` ${fold(o.texts.join(' \n '))} `
  const recent = new Set(o.recentTools ?? [])
  const exposed: string[] = []
  const catalog: string[] = []
  const preselected: ToolSelection['preselected'] = []
  for (const name of Object.keys(tools)) {
    if (SIDE_EFFECT_TOOLS.has(name) || CONTROL_TOOLS.has(name) || name === USE_TOOL) continue
    const m = META.get(name)
    // TAPPY_ANSWER_V4: every retrieval tool is offered and the MODEL decides from the meaning of the message, in any language — no word-list
    // hints deciding what it may see. The list is the same on every turn, so the cached prompt prefix is stable too.
    if (!m || m.tier === 'core' || o.all) { exposed.push(name); continue }
    if (m.hints.some(h => hay.includes(h))) { exposed.push(name); preselected.push({ name, reason: 'hint' }); continue }
    if (recent.has(name)) { exposed.push(name); preselected.push({ name, reason: 'task' }); continue }
    catalog.push(name)
  }
  return { exposed, catalog, preselected }
}

/** The single core tool that reaches every deferred tool not exposed this turn (null when there is none). */
export function proxyToolSchema(tools: Record<string, AnyTool>, catalog: readonly string[], lang: string) {
  if (!catalog.length) return null
  const lines = catalog.map(n => `- ${compactSignature(n, tools[n])}: ${META.get(n)?.capability ?? n}`).join('\n')
  const description = lang === 'en'
    ? `Use a tool that is not listed above. Pick it by name and pass its arguments as "args" (same fields as its signature). Available:\n${lines}`
    : `Dùng một công cụ KHÔNG có trong danh sách ở trên: chọn đúng tên và đưa tham số vào "args" (đúng các trường trong chữ ký). Có:\n${lines}`
  return tool({
    description,
    parameters: z.object({
      // A plain string, not an enum: the RUNTIME decides (resolveUseTool) and answers a wrong name with a structured result. An enum let
      // the SDK reject the whole model step before the runtime saw it (M7 eval: Luna proxied an already-exposed tool → forced final answer).
      tool: z.string().describe('tên công cụ'),
      args: z.record(z.unknown()).optional().describe('tham số của công cụ đó'),
      why: z.string().max(160).optional().describe('Lý do ngắn (≤12 từ). Không hiển thị cho người dùng.'),
    }),
  })
}

// ── resolution (runtime-authoritative) ─────────────────────────────────────────────────────────────────────────────────────────

export type Resolution = { toolName: string; args: Record<string, unknown> } | { refused: string; result: Record<string, unknown> }

/**
 * Turns a `use_tool` call into the real call, or refuses it with a structured result. Only deferred tools of THIS turn's catalog (or
 * already exposed deferred tools, called through the proxy by mistake) resolve; arguments must pass the tool's own schema.
 */
export function resolveUseTool(args: Record<string, unknown>, tools: Record<string, AnyTool>, sel: ToolSelection, lang: string): Resolution {
  const name = typeof args.tool === 'string' ? args.tool : ''
  // Reachable = every tool this turn offers: the catalog, and the tools already exposed (core / preselected) — proxying an exposed tool
  // is the same call Luna could make directly, so it resolves to it instead of costing a round.
  const reachable = new Set([...sel.catalog, ...sel.exposed])
  const t = tools[name]
  if (!name || !reachable.has(name) || !t || typeof t.execute !== 'function' || SIDE_EFFECT_TOOLS.has(name) || CONTROL_TOOLS.has(name) || name === USE_TOOL) {
    return { refused: 'tool_unavailable', result: { error: 'tool_unavailable', tool: name || null, note: lang === 'en' ? 'This tool is not available this turn. Do not invent its result — use another tool, answer with what you have, or say it could not be checked.' : 'Công cụ này không dùng được lượt này. Không tự bịa kết quả — dùng công cụ khác, trả lời từ dữ liệu đã có, hoặc nói rõ chưa kiểm tra được.' } }
  }
  const raw = (args.args && typeof args.args === 'object' && !Array.isArray(args.args)) ? args.args as Record<string, unknown> : {}
  const schema = t.parameters as { safeParse?: (v: unknown) => { success: boolean; data?: unknown; error?: { issues?: Array<{ path: Array<string | number>; message: string }> } } } | undefined
  if (schema?.safeParse) {
    const p = schema.safeParse(raw)
    if (!p.success) {
      return { refused: 'invalid_arguments', result: { error: 'invalid_arguments', tool: name, signature: compactSignature(name, t), issues: (p.error?.issues ?? []).slice(0, 5).map(i => `${i.path.join('.') || '(args)'}: ${i.message}`) } }
    }
    const data = (p.data ?? {}) as Record<string, unknown>
    const { why: _why, ...clean } = data
    void _why
    return { toolName: name, args: clean }
  }
  return { toolName: name, args: raw }
}
