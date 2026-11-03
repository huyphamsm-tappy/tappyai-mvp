// ── Serper budgets for the bounded agent: per TURN and per TOOL invocation ─────────────────────────────────────────────────
//
// The agent may make at most 3 tool calls per turn (src/lib/ai/agent/loop.ts), and ONE tool can fan out to many provider requests
// inside (a product search measured 11 credits). Two caps, both enforced in serperAdmit:
//   · per turn  — `withSerperTurnBudget(limit, fn)` around the whole agent turn (8 credits; 10 for a travel plan): credits never add up
//                 past it across tools;
//   · per tool  — `withSerperToolBudget(limit, fn)` around one tool invocation (provider fan-out).
// A refused call returns `null` from serperPost, which every tool already treats as "no result". Outside these scopes nothing changes —
// the legacy path is not affected.

import { AsyncLocalStorage } from 'node:async_hooks'

interface Scope { limit: number; spent: number; refused: number; parent: Scope | null; signal?: AbortSignal; halted?: string }
const store = new AsyncLocalStorage<Scope>()

async function within<T>(limit: number, fn: () => Promise<T>): Promise<{ value: T; spent: number; refused: number }> {
  const scope: Scope = { limit, spent: 0, refused: 0, parent: store.getStore() ?? null }
  const value = await store.run(scope, fn)
  return { value, spent: scope.spent, refused: scope.refused }
}

/** One agent tool invocation: its own cap, nested inside the turn's cap. */
export const withSerperToolBudget = within

/**
 * Phase 8 runtime (TAPPY_AGENT=2): a tool invocation's cap PLUS its cancellation signal. When the runtime times a tool out it aborts
 * the signal: serperPost refuses every further request of that invocation and aborts the in-flight fetch, so a timed-out tool stops
 * spending Serper credits. Only the Phase 8 runtime sets a signal; every other caller is unchanged.
 */
export async function withSerperToolScope<T>(limit: number, signal: AbortSignal, fn: () => Promise<T>): Promise<{ value: T; spent: number; refused: number }> {
  const scope: Scope = { limit, spent: 0, refused: 0, parent: store.getStore() ?? null, signal }
  const value = await store.run(scope, fn)
  return { value, spent: scope.spent, refused: scope.refused }
}

/** The nearest cancellation signal of the current scope chain (undefined outside a Phase 8 tool scope). */
export function currentSerperSignal(): AbortSignal | undefined {
  for (let s = store.getStore() ?? null; s; s = s.parent) if (s.signal) return s.signal
  return undefined
}
/** The whole agent turn. */
export const withSerperTurnBudget = within

/**
 * One budget shared by several pieces of work that may run at different times or concurrently (the agent turn's after-loop
 * lookups: card photos + the TikTok review search). Every `run` spends from the same scope, so together they never pass `limit`.
 */
export function sharedSerperBudget(limit: number): { run<T>(fn: () => Promise<T>): Promise<T>; spent(): number } {
  const scope: Scope = { limit, spent: 0, refused: 0, parent: null }
  return { run: fn => store.run(scope, fn), spent: () => scope.spent }
}

/**
 * An ACCOUNT-LEVEL failure (no credits left, bad key, forbidden) is not a property of one request: every further request of this
 * turn would be refused the same way, yet each one is a request the provider receives. The whole scope chain is halted — the
 * parallel requests that have not started yet are never sent. Returns false outside any scope (nothing to halt).
 */
export function haltSerperScope(reason: string): boolean {
  const s = store.getStore() ?? null
  if (!s) return false
  for (let c: Scope | null = s; c; c = c.parent) if (!c.halted) c.halted = reason
  return true
}

/** The reason the current scope chain was halted, if it was. */
export function serperHaltedReason(): string | null {
  for (let s = store.getStore() ?? null; s; s = s.parent) if (s.halted) return s.halted
  return null
}

/**
 * Gives back a reservation for a request that was reserved but NEVER SENT (cancelled between admit and send). A request that was
 * sent is never released — a client timeout or abort does not prove the provider did not receive and bill it.
 */
export function releaseToolBudget(credits: number): void {
  for (let s = store.getStore() ?? null; s; s = s.parent) s.spent = Math.max(0, s.spent - credits)
}

/** Called by serperAdmit before the daily ceiling. false = refuse this call (a cap on this call's scope chain is spent). */
export function admitWithinToolBudget(credits: number): boolean {
  const chain: Scope[] = []
  for (let s = store.getStore() ?? null; s; s = s.parent) chain.push(s)
  if (chain.length === 0) return true
  if (chain.some(s => s.halted)) { chain[0].refused++; return false }
  if (chain.some(s => s.spent + credits > s.limit)) { chain[0].refused++; return false }
  for (const s of chain) s.spent += credits
  return true
}

/** Is any credit scope (agent turn / tool invocation) open here? Not used by the request cap any more (see hasBoundedSerperCreditScope). */
export function hasSerperCreditScope(): boolean { return store.getStore() !== undefined }

/**
 * Is a credit scope with a FINITE limit open here? This is what the request cap reads to tell a bounded-agent request (an agent turn / tool scope with a real
 * cap) from a request nobody scoped. A scope whose limit is Number.MAX_SAFE_INTEGER bounds nothing: serperFlight (tools/common.ts) wraps the leader of EVERY
 * single-flight request in one, so counting it would let any request that goes through serperSearch / serperPlaces pass as "scoped" (found by a test, pre-baseline).
 */
export function hasBoundedSerperCreditScope(): boolean {
  for (let s = store.getStore() ?? null; s; s = s.parent) if (s.limit < Number.MAX_SAFE_INTEGER) return true
  return false
}

/** Credits spent so far in the current turn scope (0 outside one). */
export function turnCreditsSpent(): number {
  let s = store.getStore() ?? null
  while (s?.parent) s = s.parent
  return s?.spent ?? 0
}

/** Credits still available in the current TURN scope (turn limit − spent); Infinity outside a turn scope. */
export function turnCreditsRemaining(): number {
  let s = store.getStore() ?? null
  if (!s) return Number.POSITIVE_INFINITY
  while (s.parent) s = s.parent
  return Math.max(0, s.limit - s.spent)
}

// ── TURN_WEB_TICKET + SEARCH_FALLBACK_GATE (both default OFF, read at call time) ──────────────────────────────────────────────────
//
// ONE web-research ("W") request may be SENT per user turn, shared by every W path (the model's web_search, the pre-search web_search and the
// DuckDuckGo fallback of those). Vertical-own requests (maps, images, shopping, a vertical's own /search, and - since PLAN B, owner 23/10/2026 -
// CCP discovery and the hotel tool's fallback web search) are "V" and do not use it. The ticket does NOT limit V requests.
//
// Meanings (the tests are named with these words):
//   · SENT      = the moment the code CALLS fetch to the provider, after every gate has passed. From then on every outcome — success, empty,
//                 error, timeout, cancel — is "sent".
//   · states    = not_sent (no key / budget or daily-ceiling refusal / cancelled before fetch), sent_success, sent_empty, sent_error (a timeout
//                 included). A state is never inferred from an empty or thrown result alone.
//   · refund    = only for not_sent. If it cannot be proved that nothing was sent, the ticket is NOT given back.
//   · order     = cache → single-flight → only the LEADER takes the ticket, right before fetch. A follower (even from another turn) never takes
//                 one and is never refused for it.
//
// Flag matrix (TURN_WEB_TICKET / SEARCH_FALLBACK_GATE):
//   OFF / OFF  legacy behaviour, unchanged.
//   ON  / OFF  the ticket limits every W request, DuckDuckGo included: a Serper request that was SENT spent the ticket, so DuckDuckGo is
//              refused by the ticket; a Serper request that was NOT sent leaves it, so DuckDuckGo may take it.
//   OFF / ON   no ticket; DuckDuckGo runs only when Serper was not_sent.
//   ON  / ON   both: DuckDuckGo only when Serper was not_sent AND the ticket is free.
// The limit covers only the W requests above — NOT all network access of a conversation turn. Outside a ticket scope nothing is limited.

const flagIsOn = (v: string | undefined): boolean => { const s = (v ?? '').trim().toLowerCase(); return s === '1' || s === 'true' }
export const turnWebTicketOn = (env: Record<string, string | undefined> = process.env): boolean => flagIsOn(env.TURN_WEB_TICKET)
export const searchFallbackGateOn = (env: Record<string, string | undefined> = process.env): boolean => flagIsOn(env.SEARCH_FALLBACK_GATE)

export type WebRequestState = 'not_sent' | 'sent_success' | 'sent_empty' | 'sent_error'
export interface TicketEntry {
  readonly seq: number
  readonly purpose: 'W'
  readonly label: string
  /** 'taken' until the request is sent; then 'sent_error' (the conservative default) until the outcome is known; 'not_sent' once refunded. */
  state: 'taken' | WebRequestState
}
export interface TurnWebTicket {
  readonly limit: number
  used: number
  readonly log: TicketEntry[]
  /** W requests refused because the ticket was spent (nothing was sent for them). */
  readonly denied: Array<{ label: string }>
}

const ticketStore = new AsyncLocalStorage<TurnWebTicket>()
const ticketOf = new WeakMap<TicketEntry, TurnWebTicket>()

/** One ticket per user request. */
export function createTurnWebTicket(limit = 1): TurnWebTicket {
  return { limit, used: 0, log: [], denied: [] }
}

/** Runs `fn` (and every async continuation it starts) with `ticket` as the current turn's ticket. */
export function runWithTurnWebTicket<T>(ticket: TurnWebTicket, fn: () => T): T {
  return ticketStore.run(ticket, fn)
}

export function currentTurnWebTicket(): TurnWebTicket | undefined {
  return ticketStore.getStore()
}

/** Does NOT take anything: 'none' = no ticket scope (unlimited), 'free' = a ticket is left, 'exhausted' = spent. */
export function peekTurnWebTicket(): 'none' | 'free' | 'exhausted' {
  const t = ticketStore.getStore()
  if (!t) return 'none'
  return t.used < t.limit ? 'free' : 'exhausted'
}

/**
 * Checks AND marks in one synchronous step (no await between the two). Returns the entry, 'exhausted' (nothing taken), or null when
 * there is no ticket scope (unlimited). The caller must call this immediately before it calls fetch.
 */
export function takeTurnWebTicket(label: string): TicketEntry | 'exhausted' | null {
  const t = ticketStore.getStore()
  if (!t) return null
  if (t.used >= t.limit) { t.denied.push({ label }); return 'exhausted' }
  t.used++
  const entry: TicketEntry = { seq: t.log.length + 1, purpose: 'W', label, state: 'taken' }
  t.log.push(entry)
  ticketOf.set(entry, t)
  return entry
}

/** The request is being sent NOW (fetch is about to be called). From here the ticket can no longer be refunded. */
export function markTurnWebTicketSent(entry: TicketEntry): void {
  if (entry.state === 'taken') entry.state = 'sent_error'
}

/** A W request refused because the ticket was spent, noted without taking anything (the refusals that happen before a credit is reserved). */
export function noteTurnWebTicketDenied(label: string): void {
  ticketStore.getStore()?.denied.push({ label })
}

const logEntry = (step: string, entry: TicketEntry) => {
  const t = ticketOf.get(entry)
  console.log(JSON.stringify({ type: 'tappyai_web_ticket', step, label: entry.label, state: entry.state, used: t?.used ?? null, limit: t?.limit ?? null }))
}

/** The outcome of a SENT request. Ignored for an entry that was never sent. */
export function settleTurnWebTicket(entry: TicketEntry, state: 'sent_success' | 'sent_empty' | 'sent_error'): void {
  if (entry.state === 'taken' || entry.state === 'not_sent') return
  entry.state = state
  logEntry('settled', entry)
}

/** Gives the ticket back — ONLY for an entry that was taken and never sent (provably not_sent). Anything else is left as it is. */
export function refundTurnWebTicket(entry: TicketEntry): boolean {
  const t = ticketOf.get(entry)
  if (!t || entry.state !== 'taken') return false
  entry.state = 'not_sent'
  t.used = Math.max(0, t.used - 1)
  logEntry('refunded', entry)
  return true
}

/**
 * Wraps each tool's execute() so the ticket is the current one for everything the tool does (nested awaits, Promise.all, timers),
 * wherever the stream calls it from. Same object returned, like the other wrap points in the chat route.
 */
export function wrapToolsWithTurnWebTicket<T extends Record<string, unknown>>(tools: T, ticket: TurnWebTicket): T {
  for (const t of Object.values(tools)) {
    const def = t as { execute?: (...a: unknown[]) => unknown }
    const orig = def?.execute
    if (typeof orig === 'function') def.execute = (...a: unknown[]) => ticketStore.run(ticket, () => orig.apply(def, a))
  }
  return tools
}
