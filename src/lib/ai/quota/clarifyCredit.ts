import { createHash } from 'node:crypto'
import {
  distributedCountInWindow, distributedRateLimit, isDistributedStoreConfigured,
} from '@/lib/security/distributedRateLimit'
import type { AiQuotaIdentity } from './aiQuestionQuota'

// ── CONSULT_V3 turn contract (owner 17/10/2026): the user's DIRECT answer to Tappy's own question is not charged ────────────────
//
// Owner: "Tappy hỏi lại vì thiếu thông tin chứ không phải chúng ta lấy tiền của user." A turn that ends with a question to the user
// (a closing decision question, a request for a missing detail) gives the user ONE free answer to that question.
//
// SERVER-MANAGED, NEVER CLIENT-CLAIMED:
//   · ISSUE — after a turn is sent, the server hashes the closing question of the text IT SENT and records the hash under the quota
//     identity it verified (30 min).
//   · TAKE  — on the next turn, the closing question of the previous assistant message in the client's history is hashed the same way.
//     The turn is free only when (1) that hash was issued to THIS identity and is unexpired, (2) it was never taken before (a one-shot
//     "used" key), (3) the user's message is a direct answer: one of the offered options (a button), an "other" answer ("Nơi khác: Cần
//     Thơ"), or a short text with no question and no new request mixed in. A forged assistant message names a question the server never
//     issued → charged. A store that cannot answer → charged (the safe direction, like the quota itself).
//   · CHAIN CAP — a turn that was itself free issues NO credit: every paid question buys at most one free answer, so free turns can never
//     outnumber paid ones (otherwise "answer Tappy's closing question briefly" would be unlimited free chat, since V3 ends most replies
//     with a question).

export const CLARIFY_TTL_MS = 30 * 60 * 1000
const MAX_DIRECT_ANSWER_WORDS = 12

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const MARKERS = /\[(FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/\1\]/g
const OPTION = /^\s*(?:\d{1,2}[.)]|[-•])\s+(.+?)\s*$/
const norm = (s: string) => fold(s.replace(/\*\*/g, '')).replace(/[^a-z0-9?]+/g, ' ').trim()

export interface ClosingQuestion { question: string; options: string[] }

/** The question a reply ends with (its numbered options below it, if any), or null. Markers and trailing blank lines are ignored. */
export function closingQuestion(reply: string): ClosingQuestion | null {
  const lines = reply.replace(MARKERS, '').replace(/\s+$/, '').split('\n')
  let i = lines.length - 1
  const options: string[] = []
  while (i >= 0 && OPTION.test(lines[i])) { options.unshift(OPTION.exec(lines[i])![1].replace(/\*\*/g, '').trim()); i-- }
  while (i >= 0 && !lines[i].trim()) i--
  if (i < 0) return null
  const last = lines[i].replace(/\*\*/g, '').trim()
  // the question is the last sentence of that line
  const q = last.split(/(?<=[.!…])\s+/).pop() ?? ''
  if (!/[?？]["')\]]*\s*$/.test(q)) return null
  return { question: q, options: options.length >= 2 && options.length <= 6 ? options : [] }
}

/** The stable id of a question: what it asks and what it offers, folded (whitespace, case, diacritics and bold do not matter). */
export function questionHash(q: ClosingQuestion): string {
  return createHash('sha256').update(`${norm(q.question)}|${q.options.map(norm).join('|')}`).digest('hex').slice(0, 32)
}

const NEW_REQUEST = /(?:^|\s)(?:cho hoi|tien|luon|them|nua|con nua|voi lai|ma con|and also|also|by the way|btw)(?:\s|$)/
/** True when `userText` answers `q` and nothing else: an offered option (or several joined with " · "), an "other: …" answer, or a short plain reply. */
export function isDirectAnswer(userText: string, q: ClosingQuestion): boolean {
  const t = userText.trim()
  if (!t) return false
  const opts = q.options.map(norm)
  if (opts.length && t.split(/\s*·\s*/).every(part => opts.includes(norm(part)))) return true
  const words = (t.match(/[\p{L}\p{N}]+/gu) ?? []).length
  if (/[?？]/.test(t) || words > MAX_DIRECT_ANSWER_WORDS) return false
  return !NEW_REQUEST.test(` ${fold(t)} `)
}

// ── store: the quota's own shared store (Upstash) or an in-process map when none is configured (local / preview) ─────────────────
const idKey = (id: AiQuotaIdentity) => `${id.kind}:${id.id}`
const issuedKey = (id: AiQuotaIdentity, h: string) => `ai:clar:i:${idKey(id)}:${h}`
const usedKey = (id: AiQuotaIdentity, h: string) => `ai:clar:u:${idKey(id)}:${h}`

const g = globalThis as { __tappyClarifyLocal?: Map<string, number> }
const local: Map<string, number> = (g.__tappyClarifyLocal ??= new Map<string, number>())
/** Test seam: forget every in-process credit. */
export function __resetClarifyCreditLocal(): void { local.clear() }

async function markIssued(key: string, now: number): Promise<boolean> {
  if (!isDistributedStoreConfigured()) { local.set(key, now); return true }
  return (await distributedRateLimit(key, 1000, CLARIFY_TTL_MS)).ok
}
async function isIssued(key: string, now: number): Promise<boolean> {
  if (!isDistributedStoreConfigured()) { const at = local.get(key); return at !== undefined && now - at < CLARIFY_TTL_MS }
  return ((await distributedCountInWindow(key, CLARIFY_TTL_MS)) ?? 0) >= 1
}
/** One-shot: true the first time only. */
async function takeOnce(key: string, now: number): Promise<boolean> {
  if (!isDistributedStoreConfigured()) { if (local.has(key)) return false; local.set(key, now); return true }
  return (await distributedRateLimit(key, 1, CLARIFY_TTL_MS)).ok
}

async function isUsed(key: string, now: number): Promise<boolean> {
  if (!isDistributedStoreConfigured()) return local.has(key)
  const n = await distributedCountInWindow(key, CLARIFY_TTL_MS)
  return n === null || n >= 1 // unknown = used (the safe direction: the caller then keeps its free canned reply)
}

/**
 * READ-ONLY (owner 18/10, "ok" answering Tappy's closing question): would takeClarifyCredit make this turn free right now? Writes nothing,
 * takes nothing — the take happens in the normal spend path. Any doubt (no question, not issued, not direct, used, store error) → false.
 */
export async function peekClarifyCredit(identity: AiQuotaIdentity, priorAssistant: string | null, userText: string, now = Date.now()): Promise<boolean> {
  try {
    const q = priorAssistant ? closingQuestion(priorAssistant) : null
    if (!q || !isDirectAnswer(userText, q)) return false
    const h = questionHash(q)
    if (!(await isIssued(issuedKey(identity, h), now))) return false
    return !(await isUsed(usedKey(identity, h), now))
  } catch {
    return false
  }
}

export type ClarifyDecision =
  | { free: true; hash: string }
  | { free: false; reason: 'no_prior_question' | 'expired_or_unknown' | 'not_direct' | 'already_used' | 'store_error' }

/**
 * Called BEFORE the quota is spent. `priorAssistant` is the assistant message right before the user's message in the client's history
 * (untrusted — only its hash is compared with what the server issued); `userText` is the user's message.
 */
export async function takeClarifyCredit(identity: AiQuotaIdentity, priorAssistant: string | null, userText: string, now = Date.now()): Promise<ClarifyDecision> {
  try {
    const q = priorAssistant ? closingQuestion(priorAssistant) : null
    if (!q) return { free: false, reason: 'no_prior_question' }
    const h = questionHash(q)
    if (!(await isIssued(issuedKey(identity, h), now))) return { free: false, reason: 'expired_or_unknown' }
    if (!isDirectAnswer(userText, q)) return { free: false, reason: 'not_direct' }
    if (!(await takeOnce(usedKey(identity, h), now))) return { free: false, reason: 'already_used' }
    return { free: true, hash: h }
  } catch {
    return { free: false, reason: 'store_error' }
  }
}

/** Called AFTER a CHARGED turn was sent, with the text the user received. A free turn must not call it (chain cap). */
export async function issueClarifyCredit(identity: AiQuotaIdentity, sentReply: string, now = Date.now()): Promise<string | null> {
  try {
    const q = closingQuestion(sentReply)
    if (!q) return null
    const h = questionHash(q)
    return (await markIssued(issuedKey(identity, h), now)) ? h : null
  } catch {
    return null
  }
}
