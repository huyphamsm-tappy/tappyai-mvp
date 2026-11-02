// R14 / Q7 (owner 29/09): the consultation state lives on the SERVER, keyed by the client's `chatSessionId`,
// so web and Android follow the same mechanism and no client carries evidence ids.
//
// Contract (docs/uat/ANDROID-REQUESTS.md §2, R14):
//   - body field `chatSessionId`: a UUID (36 chars, hex + hyphens), created by the client when a NEW chat
//     opens, sent unchanged on EVERY turn (turn 1 and guests included), reused when a chat is reopened;
//   - the state is stored under sha256(owner + session): another person's id is a different key, so it
//     reads as a new session — nobody can read someone else's state;
//   - no owner (no user, not even anonymous) → nothing is stored; a malformed id → ignored (no error);
//   - kept 30 days; the shared KV store when configured, else a per-process map (dev, tests, replay).

import { createHash } from 'node:crypto'
import { isDistributedStoreConfigured, namespacedKey } from '@/lib/security/distributedRateLimit'
import { grantableUrl, linkFreeName } from '@/lib/ai/security/urlGrants'

export const CHAT_SESSION_TTL_SEC = 30 * 24 * 3600
const TIMEOUT_MS = 800
const MAX_BYTES = 64_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The request body's `chatSessionId`, normalised to lower case — or null when absent / malformed. */
export function readChatSessionId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const v = (body as { chatSessionId?: unknown }).chatSessionId
  if (typeof v !== 'string') return null
  const id = v.trim().toLowerCase()
  return UUID.test(id) ? id : null
}

/** What the server remembers about one consultation. Everything is optional; old rows stay readable. */
/**
 * The flight the conversation is about (agent follow-ups reuse it instead of re-planning). No approved source returns fares,
 * times or status, so `lastVerifiedAt` stays null; `sources` are the booking hand-offs already given (platform names).
 */
export interface FlightContext {
  origin: string
  destination: string
  departDate?: string
  returnDate?: string
  passengers?: number
  sources?: string[]
  lastVerifiedAt?: string | null
  at: string
}

export interface ChatSessionState {
  v: 1
  /** The consultation's area(s) and what the user has said (router slots), merged over the turns. */
  domains?: string[]
  known?: Record<string, string>
  /** The pick the latest reply stated ("**Mình chọn: X**"). */
  pick?: string | null
  /** Every venue / product name a reply presented (newest last, capped). */
  shown?: string[]
  /** The place cards above the fold of the latest reply, in the order the user saw them (an ordinal follow-up counts these). */
  cards?: string[]
  /**
   * L2 prototype (closeout round 4): the ENTITY behind `pick` when the name the client was shown differs from it (the luxury display
   * rename). `pick` stays the shown name (what the user read); this keeps the original name and, when a stored row matches it, its
   * place_id, so a follow-up ("khách sạn đó") still resolves to the same row. Absent / null = `pick` is the entity name itself.
   */
  pickEntity?: { name: string; placeId?: string } | null
  /** L2 prototype: the original names behind `shown` that a display rename changed (newest last, capped) -- "xem thêm" excludes them too. */
  shownOriginal?: string[]
  /**
   * L2 prototype (round 5): the original names behind `cards`, in the same order, when a display rename changed them -- the agent's
   * follow-up matches its card rows ("quán đầu tiên") by these. Absent = `cards` are the entity names.
   */
  cardsOriginal?: string[]
  /** The decision-evidence row (last place search + shopping evidence) — what `decisionEvidenceId` carried. */
  evidence?: Record<string, unknown> | null
  /** The last real place search's RANKED candidates (compact rows) — "xem thêm" / "bác" continue from them. */
  candidates?: { args: { query: string; type?: string; location?: string }; rows: Array<Record<string, unknown>>; /** When the rows were retrieved (freshness of carried evidence). */ at?: string } | null
  /** The last real hotel search (args + compact hotel rows) — a travel "xem thêm" / "bác" continues from them. */
  stay?: { args: { location: string; checkIn?: string; checkOut?: string }; rows: Array<Record<string, unknown>> } | null
  /** The last real product search (query + ranked rows, trimmed) — a shopping "xem thêm" / "bác" continues from them. */
  products?: { query: string; rows: Array<Record<string, unknown>> } | null
  /** TAPPY_AGENT: a side-effecting action the agent requested, waiting for the user's confirmation on the next turn. */
  pendingAction?: { id: string; tool: string; args: Record<string, unknown>; argsHash: string; summary: string; at: string; expiresAt: string } | null
  /** TAPPY_AGENT: ids of confirmed actions already executed (idempotency across turns, newest last). */
  executedActions?: string[]
  /** TAPPY_AGENT follow-up context: the flight / film / trip plan this conversation is about (from executed tool calls). */
  flight?: FlightContext | null
  movie?: { title: string; date?: string; city?: string; at: string } | null
  plan?: { destination: string; at: string } | null
  /** TAPPY_AGENT: places the user turned down in this consultation (newest last). */
  rejected?: string[]
  /**
   * P0-3: the URLs this server granted (a tool's link field) AND showed in a reply — the only URLs a later turn may publish again without
   * a new grant. The client's copy of a reply is never a grant. Re-checked by `grantableUrl` on load; newest last, capped.
   */
  urlGrants?: Array<{ url: string; field: string; at: string }>
  /**
   * Phase 8 M2 (TAPPY_AGENT=2 only): the agent's persistent TASK (src/lib/ai/agent/runtime/task.ts) and short summaries of earlier tasks.
   * Stored opaque here and VALIDATED on load by the runtime (schema, conversation id, staleness) — never trusted as read.
   */
  task?: Record<string, unknown> | null
  taskHistory?: Array<Record<string, unknown>>
  updatedAt?: string
}

/** Row fields kept for a later "xem thêm" / "bác": what ranking, the guards and the cards read. */
const CANDIDATE_KEEP = ['name', 'place_id', 'address', 'phone', 'google_rating', 'rating_value', 'rating_count', 'rating', 'user_ratings_total', 'review_count',
  'price_range_text', 'price_range', 'price_level', 'price', 'distance_km', 'open_now', 'opening_hours', 'place_types', 'cuisine', 'attributes',
  'has_delivery', 'has_order', 'maps_link', 'booking_links', 'website_uri', 'latitude', 'longitude', 'lat', 'lng', 'photo_url', 'thumbnail', 'cid']

export function compactCandidates(rows: readonly unknown[]): Array<Record<string, unknown>> {
  return rows.slice(0, 20).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object').map(r => {
    const out: Record<string, unknown> = {}
    for (const k of CANDIDATE_KEEP) if (r[k] !== undefined && r[k] !== null && r[k] !== '') out[k] = r[k]
    return out
  })
}

/** Product rows for a later "xem thêm" / "bác": at most 12, no field longer than 600 characters (images, blobs). */
export function compactProducts(rows: readonly unknown[]): Array<Record<string, unknown>> {
  return rows.slice(0, 12).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object').map(r => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('_')) continue
      if (typeof v === 'string' && v.length > 600) continue
      if (v !== null && typeof v === 'object' && JSON.stringify(v).length > 1500) continue
      out[k] = v
    }
    return out
  })
}

/** The storage key: owner and session hashed together — never the raw ids. */
export function chatSessionKey(ownerId: string, sessionId: string, env: NodeJS.ProcessEnv = process.env): string {
  const h = createHash('sha256').update(`${ownerId}\u0000${sessionId}`).digest('hex')
  return namespacedKey(`chatstate:v1:${h}`, env)
}

// ── storage ─────────────────────────────────────────────────────────────────────────────────────────────

const local = new Map<string, { value: string; exp: number }>()

async function kv(cmd: string[], env: NodeJS.ProcessEnv): Promise<unknown> {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${url}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd), signal: ctrl.signal })
    if (!res.ok) throw new Error(`chat state HTTP ${res.status}`)
    const body = (await res.json()) as { result?: unknown; error?: string }
    if (!body || typeof body !== 'object' || body.error) throw new Error('chat state store error')
    return body.result
  } finally {
    clearTimeout(timer)
  }
}

/** The stored state, or null (none, no owner, bad id, store down). Never throws, never logs ids. */
export async function loadChatSessionState(ownerId: string | null | undefined, sessionId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): Promise<ChatSessionState | null> {
  if (!ownerId || !sessionId) return null
  const key = chatSessionKey(ownerId, sessionId, env)
  try {
    let raw: unknown
    if (isDistributedStoreConfigured(env)) raw = await kv(['GET', key], env)
    else {
      const hit = local.get(key)
      raw = hit && hit.exp > Date.now() ? hit.value : null
    }
    if (typeof raw !== 'string' || !raw) return null
    const parsed = JSON.parse(raw) as ChatSessionState
    return parsed && parsed.v === 1 ? cleanStoredState(parsed) : null
  } catch {
    return null
  }
}

/** Writes the state (TTL 30 days). Never throws; an oversized state drops its evidence first. */
export async function saveChatSessionState(ownerId: string | null | undefined, sessionId: string | null | undefined, state: ChatSessionState, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (!ownerId || !sessionId) return false
  const key = chatSessionKey(ownerId, sessionId, env)
  let value = JSON.stringify({ ...state, v: 1, updatedAt: new Date().toISOString() })
  if (value.length > MAX_BYTES) value = JSON.stringify({ ...state, v: 1, evidence: null, updatedAt: new Date().toISOString() })
  if (value.length > MAX_BYTES) value = JSON.stringify({ ...state, v: 1, evidence: null, candidates: null, stay: null, products: null, updatedAt: new Date().toISOString() })
  if (value.length > MAX_BYTES) return false
  try {
    if (isDistributedStoreConfigured(env)) await kv(['SET', key, value, 'EX', String(CHAT_SESSION_TTL_SEC)], env)
    else local.set(key, { value, exp: Date.now() + CHAT_SESSION_TTL_SEC * 1000 })
    return true
  } catch {
    return false
  }
}

const names = (xs: readonly unknown[] | undefined): string[] => [...new Set((xs ?? []).map(linkFreeName).filter((s): s is string => !!s))]

/**
 * Gate 2 L4 (PROPOSAL): the cards above the fold are a POSITIONAL list -- "quán thứ hai" and the agent's card facts (cardEvidence,
 * position = index) count them -- so they are never de-duplicated by name: two different cards may share a shown name (two branches of
 * one chain; two brands renamed alike). The originals are cleaned pair by pair with them, so index i is the same card in both lists:
 * a pair whose shown name is empty once link-free is dropped from BOTH; a missing / empty original falls back to the shown name;
 * originals of another length are ignored (never paired by guess). `cardsOriginal` only when some pair differs.
 */
const CARD_LIST_MAX = 12
export function cardList(shown: readonly unknown[] | undefined, original?: readonly unknown[] | undefined): { cards: string[]; cardsOriginal?: string[] } {
  const orig = original && original.length === (shown ?? []).length ? original : undefined
  const cards: string[] = []
  const originals: string[] = []
  ;(shown ?? []).forEach((raw, i) => {
    const s = linkFreeName(raw)
    if (!s || cards.length >= CARD_LIST_MAX) return
    cards.push(s)
    originals.push((orig ? linkFreeName(orig[i]) : null) ?? s)
  })
  return originals.some((o, i) => o !== cards[i]) ? { cards, cardsOriginal: originals } : { cards }
}

/** L2 prototype: a stored entity reference as it may reach a prompt -- a link-free name and a place_id-shaped id, nothing else. */
function cleanEntity(e: unknown): { name: string; placeId?: string } | null {
  if (!e || typeof e !== 'object') return null
  const name = linkFreeName((e as { name?: unknown }).name)
  if (!name) return null
  const id = (e as { placeId?: unknown }).placeId
  return typeof id === 'string' && /^[\w:-]{1,128}$/.test(id) ? { name, placeId: id } : { name }
}

/** Fold a name for matching (accents, case, punctuation) -- the same fold the follow-up row matchers use (consultTravel.ts foldName). */
const foldEntity = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** L2 prototype: the place_id of the stored row whose name is this entity name (exact fold), if any. */
function placeIdFor(name: string, rows: ReadonlyArray<Record<string, unknown>> | undefined): string | undefined {
  const k = foldEntity(name)
  const row = (rows ?? []).find(r => typeof r.name === 'string' && foldEntity(r.name) === k)
  return typeof row?.place_id === 'string' ? row.place_id : undefined
}
const PICK_RE = /\*\*Mình chọn:\s*([^*\n]+?)\*\*/

/**
 * P0-3: a state as it may reach a prompt. Names (`pick`, `shown`, `cards`, `rejected`) carry no URL — a row written before this rule
 * (a "**Mình chọn: [x](url)**" whose link the egress had removed from the stream) is cleaned when it is read, not only when written;
 * grant records that no longer pass `grantableUrl` are dropped.
 */
export function cleanStoredState(s: ChatSessionState): ChatSessionState {
  const pick = s.pick == null ? s.pick : linkFreeName(s.pick)
  return {
    ...s,
    ...(s.pick !== undefined ? { pick } : {}),
    ...(s.shown ? { shown: names(s.shown) } : {}),
    // Gate 2 L4 (PROPOSAL): the two card lists are cleaned as pairs (cardList); a stored state from before the fix whose originals have
    // another length keeps its cards and loses the originals (D-L4-2: no facts rather than another card's facts).
    ...(s.cards ? (() => { const c = cardList(s.cards, s.cardsOriginal); return { cards: c.cards, cardsOriginal: c.cardsOriginal } })() : s.cardsOriginal ? { cardsOriginal: names(s.cardsOriginal) } : {}),
    ...(s.pickEntity ? { pickEntity: cleanEntity(s.pickEntity) } : {}),
    ...(s.shownOriginal ? { shownOriginal: names(s.shownOriginal) } : {}),
    ...(s.rejected ? { rejected: names(s.rejected) } : {}),
    ...(s.urlGrants ? { urlGrants: s.urlGrants.filter(g => g && typeof g.url === 'string' && !!grantableUrl(g.url)) } : {}),
  }
}

/** The next state from this turn: slots merged, the stated pick, shown names appended (capped at 24). */
export function nextChatSessionState(prev: ChatSessionState | null, turn: {
  domains?: readonly string[]
  known?: Record<string, string>
  replyText?: string
  presentedNames?: readonly string[]
  cardOrder?: readonly string[]
  pendingAction?: ChatSessionState['pendingAction']
  rejected?: readonly string[]
  executedActions?: readonly string[]
  agentState?: { flight?: ChatSessionState['flight']; movie?: ChatSessionState['movie']; plan?: ChatSessionState['plan'] }
  evidence?: Record<string, unknown> | null
  candidates?: ChatSessionState['candidates']
  stay?: ChatSessionState['stay']
  products?: ChatSessionState['products']
  /** Phase 8 M2: undefined = keep the stored task untouched (legacy / TAPPY_AGENT=1 turns never write it). */
  task?: ChatSessionState['task']
  taskHistory?: ChatSessionState['taskHistory']
  /** P0-3: the URLs this turn granted and showed (streamEnrichment `grantedUrls`). */
  urlGrants?: ReadonlyArray<{ url: string; field: string }>
  /**
   * L2 prototype: the reply and names BEFORE a display rename (luxury), passed only when the client was shown renamed text. `replyText` /
   * `presentedNames` are then the shown versions; these keep the entity names. `entityRows` = this turn's stored rows (place_id lookup).
   */
  originalReplyText?: string
  originalPresentedNames?: readonly string[]
  originalCardOrder?: readonly string[]
  entityRows?: ReadonlyArray<Record<string, unknown>>
}): ChatSessionState {
  // P0-3: the stored pick is a NAME — a link inside the pick sentence ("**Mình chọn: [x](url)**") is reduced to its label, so a URL the
  // egress removed from the stream is not stored and cannot reach a later prompt.
  const pickRaw = turn.replyText ? PICK_RE.exec(turn.replyText)?.[1]?.trim() ?? null : null
  const pick = pickRaw ? linkFreeName(pickRaw) : null
  const shown = names(prev?.shown)
  for (const n of names([...(turn.presentedNames ?? []), ...(pick ? [pick] : [])])) if (!shown.includes(n)) shown.push(n)
  // L2 prototype: the entity behind a renamed pick, and the original names behind renamed shown names. A turn with a pick and no rename
  // clears pickEntity (the pick IS the entity name); a turn without a pick keeps the previous pick and its entity together.
  const origPickRaw = turn.originalReplyText ? PICK_RE.exec(turn.originalReplyText)?.[1]?.trim() ?? null : null
  const origPick = origPickRaw ? linkFreeName(origPickRaw) : null
  const pickEntity = pick
    ? (origPick && origPick !== pick ? cleanEntity({ name: origPick, placeId: placeIdFor(origPick, turn.entityRows) }) : null)
    : prev?.pickEntity ?? null
  const shownOriginal = names(prev?.shownOriginal)
  const shownNow = new Set(names([...(turn.presentedNames ?? []), ...(pick ? [pick] : [])]))
  for (const n of names([...(turn.originalPresentedNames ?? []), ...(origPick ? [origPick] : [])])) if (!shownNow.has(n) && !shownOriginal.includes(n)) shownOriginal.push(n)
  const at = new Date().toISOString()
  const grants = [...(prev?.urlGrants ?? []), ...(turn.urlGrants ?? []).map(g => ({ url: g.url, field: g.field, at }))]
    .filter(g => !!grantableUrl(g.url))
  const urlGrants = [...new Map(grants.map(g => [g.url, g])).values()].slice(-80)
  // Gate 2 L4 (PROPOSAL): this turn's cards and their originals, as one positional pair list (cardList).
  const turnCards = turn.cardOrder?.length ? cardList(turn.cardOrder, turn.originalCardOrder) : null
  return {
    v: 1,
    domains: turn.domains?.length ? [...turn.domains] : prev?.domains,
    known: { ...(prev?.known ?? {}), ...(turn.known ?? {}) },
    pick: pick ?? prev?.pick ?? null,
    shown: shown.slice(-24),
    cards: turnCards ? turnCards.cards : prev?.cards,
    ...(pickEntity ? { pickEntity } : {}),
    ...(shownOriginal.length ? { shownOriginal: shownOriginal.slice(-24) } : {}),
    // L2 (round 5): new cards replace the old ones together with their originals; a turn without cards keeps both.
    ...(turnCards
      ? (turnCards.cardsOriginal ? { cardsOriginal: turnCards.cardsOriginal } : {})
      : prev?.cardsOriginal ? { cardsOriginal: prev.cardsOriginal } : {}),
    ...(turn.pendingAction !== undefined ? { pendingAction: turn.pendingAction } : prev?.pendingAction ? { pendingAction: prev.pendingAction } : {}),
    ...(turn.agentState?.flight || prev?.flight ? { flight: turn.agentState?.flight ?? prev?.flight } : {}),
    ...(turn.agentState?.movie || prev?.movie ? { movie: turn.agentState?.movie ?? prev?.movie } : {}),
    ...(turn.agentState?.plan || prev?.plan ? { plan: turn.agentState?.plan ?? prev?.plan } : {}),
    ...((turn.executedActions?.length || prev?.executedActions?.length) ? { executedActions: [...new Set([...(prev?.executedActions ?? []), ...(turn.executedActions ?? [])])].slice(-50) } : {}),
    ...((turn.rejected?.length || prev?.rejected?.length) ? { rejected: names([...(prev?.rejected ?? []), ...(turn.rejected ?? [])]).slice(-12) } : {}),
    ...(urlGrants.length ? { urlGrants } : {}),
    evidence: turn.evidence === undefined ? prev?.evidence ?? null : turn.evidence,
    candidates: turn.candidates === undefined ? prev?.candidates ?? null : turn.candidates,
    stay: turn.stay === undefined ? prev?.stay ?? null : turn.stay,
    products: turn.products === undefined ? prev?.products ?? null : turn.products,
    ...(turn.task !== undefined ? { task: turn.task } : prev?.task !== undefined ? { task: prev.task } : {}),
    ...(turn.taskHistory !== undefined ? { taskHistory: turn.taskHistory } : prev?.taskHistory !== undefined ? { taskHistory: prev.taskHistory } : {}),
  }
}

/** Test-only: clears the per-process store. */
export function __resetChatSessionStore(): void { local.clear() }
