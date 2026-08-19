import { createHash, randomUUID } from 'node:crypto'

/**
 * Server-side consultative state for one conversation (Task 3C).
 *
 * WHY THIS EXISTS: `/api/chat` is stateless — clients replay only `{role, content}`
 * text, so tool results die with the request that produced them. Measured
 * consequence (Task 3B): on refinement and rejection turns the model has no
 * grounded candidates left, so it either interrogates the user or invents
 * places and prices. Prose in the history is not evidence; this is.
 *
 * DELIBERATELY NOT A MEMORY SYSTEM. It holds only what the CURRENT decision
 * needs, expires in a day, and stores no raw conversation text.
 */

/** A requirement the user stated. Recommendations must satisfy it. */
export interface HardConstraint {
  /** Machine key, e.g. 'ram_gb', 'storage_gb', 'budget_vnd', 'condition'. */
  key: string
  op: '>=' | '<=' | '=' | 'in'
  value: string | number
  /** The user's own words, so a reply can quote the requirement back. */
  statedAs: string
  turn: number
}

/** Something that should influence ranking but must never exclude an option. */
export interface SoftPreference {
  key: string
  /** 1 = mentioned once, higher = repeated or emphasised. */
  weight: number
  statedAs: string
  turn: number
}

/**
 * One option under consideration, with the provenance needed to defend every
 * claim made about it. `facts` holds ONLY values a tool actually returned —
 * there is no field the model may fill in.
 */
export interface Candidate {
  candidateId: string
  name: string
  type: 'place' | 'product' | 'hotel' | 'deal'
  /** Tool that produced it, e.g. 'search_places'. Never a model guess. */
  source: string
  retrievedAt: number
  facts: Record<string, string | number>
  url?: string
}

export interface ConversationState {
  conversationId: string
  /** Hash of the owner identity. Never the raw user id. */
  ownerScope: string
  createdAt: number
  updatedAt: number
  expiresAt: number
  version: number

  goal?: string
  hardConstraints: HardConstraint[]
  softPreferences: SoftPreference[]
  useCase?: string
  location?: string
  timeContext?: string
  /** Candidate names/ids the user turned down, with a reason when one is known. */
  rejections: Array<{ ref: string; reason?: string; turn: number }>
  candidates: Candidate[]
  /** What the last search actually asked for — lets the next turn decide if it is stale. */
  lastSearchContext?: { query: string; tool: string; at: number }
  /** Mirrors detectDecisionStage for the turn this state was last written on. */
  decisionStage?: string | null
  /**
   * How the most recent search ended. 'empty' (the provider answered, with
   * nothing) and 'failed' (the provider did not answer) are deliberately
   * separate: the first justifies "I couldn't find anything matching", the
   * second only justifies "I couldn't check right now".
   */
  lastSearchOutcome?: 'ok' | 'empty' | 'failed'
  /**
   * Candidate names the PREVIOUS assistant reply actually named to the user.
   *
   * The source of truth for "these" in "I don't like these": only what was
   * shown can be rejected. Recorded from the finished reply text, so it cannot
   * include an option the user never saw.
   */
  presentedCandidates?: string[]
  /**
   * Canonical ids the MOST RECENT reply named — the scope of "these" / "quán đó".
   *
   * Same identity as `presentedCandidates`, different question.
   * `presentedCandidates` accumulates ("has the user ever seen this?") and
   * drives the unseen count; this one is per-reply ("what is the user talking
   * about right now?") and drives rejection. Using the accumulated list for
   * rejection would turn "I don't like that one" into rejecting every option
   * shown all conversation.
   */
  lastPresentedCandidates?: string[]
  turn: number
}

/**
 * Does `ref` denote this candidate?
 *
 * `ref` is a canonical candidateId for anything recorded since reuse turns
 * started updating the record. Display name is still accepted as a fallback so
 * conversations already in the store keep working, and because a rejection the
 * model phrases in prose ("previous suggestions") has no id to offer. Name
 * matching alone was never sufficient: two listings can share a title, and the
 * ranking then excluded both.
 */
export function candidateMatchesRef(c: Candidate, ref: string): boolean {
  const needle = ref.trim().toLowerCase()
  if (!needle) return false
  return c.candidateId.trim().toLowerCase() === needle || c.name.trim().toLowerCase() === needle
}

/** Split a stored rejection ref ("a, b") into its individual tokens. */
export function refTokens(ref: string): string[] {
  return ref.split(',').map(t => t.trim()).filter(Boolean)
}

/** Is this candidate covered by any rejection recorded so far? */
export function isRejected(c: Candidate, state: Pick<ConversationState, 'rejections'>): boolean {
  return state.rejections.some(r => refTokens(r.ref).some(tok => candidateMatchesRef(c, tok)))
}

/** Has the user actually been shown this candidate? */
export function isPresented(c: Candidate, state: Pick<ConversationState, 'presentedCandidates'>): boolean {
  return (state.presentedCandidates ?? []).some(ref => candidateMatchesRef(c, ref))
}

export const STATE_TTL_SECONDS = 60 * 60 * 24 // 24h, refreshed on every write
export const MAX_CANDIDATES = 12
export const MAX_CONSTRAINTS = 24
/** Refuse to persist anything larger; a runaway state must not become a payload. */
export const MAX_STATE_BYTES = 64 * 1024

const KEY_PREFIX = 'tappy:convstate:'

/**
 * Owner identity, derived SERVER-SIDE only.
 *
 * A conversationId is a lookup key, never proof of ownership: anyone who learns
 * one must still fail to load the state. Both the authenticated id and the
 * anonymous session id are hashed so the store never holds a raw user id.
 */
export function ownerScopeFor(opts: {
  userId?: string | null
  anonId?: string | null
}): string {
  const raw = opts.userId ? `u:${opts.userId}` : opts.anonId ? `a:${opts.anonId}` : null
  if (!raw) return ''
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

export function newConversationId(): string {
  return randomUUID()
}

export function createState(conversationId: string, ownerScope: string, now = Date.now()): ConversationState {
  return {
    conversationId,
    ownerScope,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + STATE_TTL_SECONDS * 1000,
    version: 1,
    hardConstraints: [],
    softPreferences: [],
    rejections: [],
    candidates: [],
    turn: 0,
  }
}

/** A conversationId we did not mint must never reach the store as a key. */
export function isValidConversationId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/** Structural check before trusting anything read back out of the store. */
export function isWellFormed(v: unknown): v is ConversationState {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<ConversationState>
  return (
    isValidConversationId(s.conversationId) &&
    typeof s.ownerScope === 'string' &&
    typeof s.expiresAt === 'number' &&
    Array.isArray(s.hardConstraints) &&
    Array.isArray(s.softPreferences) &&
    Array.isArray(s.rejections) &&
    Array.isArray(s.candidates)
  )
}

export function isExpired(state: ConversationState, now = Date.now()): boolean {
  return state.expiresAt <= now
}

/** Keep the newest entries and stay under the caps, so state cannot grow without bound. */
export function clampState(state: ConversationState): ConversationState {
  return {
    ...state,
    hardConstraints: state.hardConstraints.slice(-MAX_CONSTRAINTS),
    softPreferences: state.softPreferences.slice(-MAX_CONSTRAINTS),
    candidates: state.candidates.slice(-MAX_CANDIDATES),
    rejections: state.rejections.slice(-MAX_CONSTRAINTS),
  }
}

// ---------------------------------------------------------------------------
// Store. Upstash over REST, same lazy-import + degrade-to-null shape as
// scam-shield's redisCache. Accepts BOTH env namings: this project provisions
// Vercel KV (`KV_REST_API_*`), scam-shield reads `UPSTASH_REDIS_REST_*`, and
// they are the same service.
// ---------------------------------------------------------------------------

interface StoreClient {
  get(key: string): Promise<unknown>
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>
  del(key: string): Promise<unknown>
}

let client: StoreClient | null = null
let clientTried = false

export async function getStore(): Promise<StoreClient | null> {
  if (clientTried) return client
  clientTried = true
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    const { Redis } = await import('@upstash/redis')
    client = new Redis({ url, token }) as unknown as StoreClient
    return client
  } catch {
    return null
  }
}

/** Test seam — lets the suite drive a fake or an outage without env juggling. */
export function __setStoreForTests(c: StoreClient | null) {
  client = c
  clientTried = true
}

/**
 * Load state for `conversationId`, but ONLY if `ownerScope` matches.
 *
 * Every failure — unknown id, wrong owner, expired, malformed, store down —
 * returns null and is indistinguishable to the caller, so a probe cannot use
 * the response to learn whether a conversation exists.
 */
export async function loadState(
  conversationId: string,
  ownerScope: string,
  now = Date.now(),
): Promise<ConversationState | null> {
  if (!isValidConversationId(conversationId) || !ownerScope) return null
  const store = await getStore()
  if (!store) return null
  try {
    const raw = await store.get(KEY_PREFIX + conversationId)
    if (raw == null) return null
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!isWellFormed(parsed)) return null
    if (parsed.ownerScope !== ownerScope) return null // cross-owner: behave as not-found
    if (isExpired(parsed, now)) return null
    return parsed
  } catch {
    return null // unreachable store or unparseable value must never break the turn
  }
}

/** Persist state. Returns false when it was not stored (no store, or too large). */
export async function saveState(state: ConversationState, now = Date.now()): Promise<boolean> {
  const store = await getStore()
  if (!store) return false
  const next = clampState({ ...state, updatedAt: now, expiresAt: now + STATE_TTL_SECONDS * 1000 })
  const body = JSON.stringify(next)
  if (Buffer.byteLength(body, 'utf8') > MAX_STATE_BYTES) return false
  try {
    await store.set(KEY_PREFIX + next.conversationId, body, { ex: STATE_TTL_SECONDS })
    return true
  } catch {
    return false
  }
}
