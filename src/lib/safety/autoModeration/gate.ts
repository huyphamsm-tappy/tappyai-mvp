// The automatic moderation gate: ONE function every route that publishes user text calls BEFORE it stores anything. No human reviewer is assumed: the machine decides, and a doubtful or
// unverifiable case is NOT published (fail closed).
//
//   1. a person who keeps probing the filter is locked out for the rest of the day (daily counter);
//   2. fixed Vietnamese rules (lexicon.ts): a hit blocks at once, no model call;
//   3. one model call (classifier.ts): block when it says block with enough confidence (thresholds below);
//   4. the model unavailable/unreadable: refuse with "unavailable" (the person can retry; nothing is stored).
//
// Switch: AUTO_MODERATION_ENABLED. ON unless the value is exactly "false" (an explicit owner decision; the test setup pins it "false" like the other flags, and the moderation suites turn it on).
// The event log carries the surface, the outcome and the category: NEVER the text.
import { classifyText, classifyImage, type TextClassification } from './classifier'
import { scanLexicon, type ModerationCategory } from './lexicon'
import { incrDailyCounter } from '@/lib/security/kvCounter'

export type ModerationSurface = 'review' | 'comment' | 'profile' | 'group' | 'plan' | 'other'

export type GateOutcome =
  | { allowed: true }
  | { allowed: false; reason: 'blocked'; category: ModerationCategory; source: 'rule' | 'model' }
  | { allowed: false; reason: 'unavailable' }
  | { allowed: false; reason: 'locked' }

type Env = Record<string, string | undefined>

export const autoModerationOn = (env: Env = process.env): boolean => (env.AUTO_MODERATION_ENABLED ?? '').trim().toLowerCase() !== 'false'

/** Confidence the model needs before its "block" is believed. Child safety is believed at a low bar, misinformation (hardest to judge) at a high one. */
export const BLOCK_THRESHOLD: Record<ModerationCategory, number> = {
  child_safety: 0.3,
  sexual_explicit: 0.6,
  anti_state: 0.6,
  division_hate: 0.6,
  violence_terror: 0.6,
  scam_fraud: 0.6,
  gambling: 0.6,
  drugs: 0.6,
  defamation_privacy: 0.65,
  misinformation: 0.75,
}

/** Blocked attempts in one day after which the person is locked out for the rest of that day (they are probing the filter). */
export const DAILY_BLOCK_LIMIT = 10

export interface GateDeps {
  env?: Env
  classify?: (text: string) => Promise<TextClassification>
  /** Adds one blocked attempt and returns today's total. */
  countBlock?: (userId: string) => Promise<number>
  /** Today's total without adding. */
  blockedToday?: (userId: string) => Promise<number>
  log?: (event: Record<string, unknown>) => void
}

const defaultCount = async (userId: string) => (await incrDailyCounter(`automod:blocked:${userId}`, 1)).count
const defaultPeek = async (userId: string) => (await incrDailyCounter(`automod:blocked:${userId}`, 0)).count

export async function moderateUserText(o: { userId: string; surface: ModerationSurface; texts: Array<string | null | undefined> }, deps: GateDeps = {}): Promise<GateOutcome> {
  const env = deps.env ?? process.env
  if (!autoModerationOn(env)) return { allowed: true }
  const pieces = o.texts.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
  if (pieces.length === 0) return { allowed: true }
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)))
  const event = (outcome: string, extra: Record<string, unknown> = {}) => log({ type: 'tappyai_auto_moderation', surface: o.surface, outcome, ...extra })

  try {
    if ((await (deps.blockedToday ?? defaultPeek)(o.userId)) >= DAILY_BLOCK_LIMIT) { event('locked'); return { allowed: false, reason: 'locked' } }
  } catch { /* a counter outage must not lock anybody out; the rules and the model below still run */ }

  const block = async (category: ModerationCategory, source: 'rule' | 'model'): Promise<GateOutcome> => {
    try { await (deps.countBlock ?? defaultCount)(o.userId) } catch { /* the block still stands */ }
    event('blocked', { category, source })
    return { allowed: false, reason: 'blocked', category, source }
  }

  for (const p of pieces) {
    const hits = scanLexicon(p)
    if (hits.length) return block(hits[0].category, 'rule')
  }

  const r = await (deps.classify ?? classifyText)(pieces.join('\n'))
  if (r.status !== 'ok') { event('unavailable', { reason: r.reason }); return { allowed: false, reason: 'unavailable' } }
  if (r.verdict === 'block' && r.category !== 'none' && r.confidence >= BLOCK_THRESHOLD[r.category]) return block(r.category, 'model')
  // A "block" with no usable category or too little confidence is not believed; but a "block" the model could not even name is not published either.
  if (r.verdict === 'block' && r.category === 'none') { event('unavailable', { reason: 'block_without_category' }); return { allowed: false, reason: 'unavailable' } }
  event('allowed')
  return { allowed: true }
}

export interface ImageGateDeps extends Omit<GateDeps, 'classify'> {
  classifyImage?: (bytes: Uint8Array, mime: string) => Promise<TextClassification>
}

/** The same gate for a picture that is about to be stored publicly (profile photo, cover, review photo, group avatar). One vision call; a picture that cannot be judged is not stored. */
export async function moderateUserImage(o: { userId: string; surface: ModerationSurface; bytes: Uint8Array; mime: string }, deps: ImageGateDeps = {}): Promise<GateOutcome> {
  const env = deps.env ?? process.env
  if (!autoModerationOn(env)) return { allowed: true }
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)))
  const event = (outcome: string, extra: Record<string, unknown> = {}) => log({ type: 'tappyai_auto_moderation', surface: o.surface, kind: 'image', outcome, ...extra })
  try {
    if ((await (deps.blockedToday ?? defaultPeek)(o.userId)) >= DAILY_BLOCK_LIMIT) { event('locked'); return { allowed: false, reason: 'locked' } }
  } catch { /* see moderateUserText */ }
  const r = await (deps.classifyImage ?? classifyImage)(o.bytes, o.mime)
  if (r.status !== 'ok') { event('unavailable', { reason: r.reason }); return { allowed: false, reason: 'unavailable' } }
  if (r.verdict === 'block' && r.category !== 'none') {
    if (r.confidence >= BLOCK_THRESHOLD[r.category]) {
      try { await (deps.countBlock ?? defaultCount)(o.userId) } catch { /* the block still stands */ }
      event('blocked', { category: r.category, source: 'model' })
      return { allowed: false, reason: 'blocked', category: r.category, source: 'model' }
    }
  } else if (r.verdict === 'block') { event('unavailable', { reason: 'block_without_category' }); return { allowed: false, reason: 'unavailable' } }
  event('allowed')
  return { allowed: true }
}
