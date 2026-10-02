import { z } from 'zod'
import { neutralizeFenceMarkers } from '@/lib/ai/security/fence'
import { ATTACK_GOALS, SCAM_TYPES, SIGNAL_TYPES } from '../types'
import type { AiAssessment } from '../types'
import {
  MAX_ENTITIES_PER_KIND, MAX_ENTITY_CHARS, MAX_EXPLANATION_CHARS, MAX_REQUESTED_ACTIONS,
  MAX_SIGNALS, MAX_SUMMARY_CHARS,
} from '../config'

// Scam Shield · message analysis — the model output contract.
//
// 🚨 MODEL OUTPUT IS UNTRUSTED. It was produced while reading an adversarial message, so it can
// carry that message's payload: instructions, fake "advice", links, HTML, fence markers. This
// schema is the boundary between "what the model said" and "what the app believes":
//
//   • every enum is COERCED, not rejected — an invented signal type becomes `other`, an invented
//     goal becomes `other`, an invented level becomes `suspicious` (the cautious middle), so a
//     model that drifts from the vocabulary degrades to a vaguer answer rather than to no answer;
//   • every string is capped, stripped of control characters, HTML tags and fence markers;
//   • every array is bounded;
//   • confidence is clamped to [0, 1].
//
// The result is an `AiAssessment` — the only shape fusion accepts.

/** Control characters other than newline; HTML tags; anything that could be rendered as markup. */
const CONTROL = new RegExp('[\\u0000-\\u0009\\u000B-\\u001F\\u007F]', 'g')
const TAGS = /<[^>]{0,200}>/g

export function sanitizeText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return neutralizeFenceMarkers(value)
    .replace(CONTROL, '')
    .replace(TAGS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

const text = (max: number) => z.preprocess(v => sanitizeText(v, max), z.string())

const stringList = (max: number, maxItems: number) =>
  z.preprocess(
    v => (Array.isArray(v) ? v : []),
    z.array(z.unknown()).transform(items =>
      items.map(i => sanitizeText(i, max)).filter(s => s.length > 0).slice(0, maxItems),
    ),
  )

function member<T extends string>(values: readonly T[], v: unknown): T | null {
  if (typeof v !== 'string') return null
  const key = v.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return (values as readonly string[]).includes(key) ? (key as T) : null
}

/** An enum where anything unrecognised becomes `fallback` — the model drifts to vaguer, not to nothing. */
function coerceEnum<T extends string>(values: readonly T[], fallback: T) {
  return z.preprocess(v => member(values, v) ?? fallback, z.enum(values as [T, ...T[]]))
}

/** An enum where anything unrecognised becomes `null`. */
function coerceEnumNullable<T extends string>(values: readonly T[]) {
  return z.preprocess(v => member(values, v), z.enum(values as [T, ...T[]]).nullable())
}

const riskLevel = z.preprocess(v => {
  const s = typeof v === 'string' ? v.trim().toLowerCase().replace(/[\s-]+/g, '_') : ''
  if (s === 'safe' || s === 'suspicious' || s === 'high_risk' || s === 'critical') return s
  if (s === 'high' || s === 'dangerous' || s === 'scam') return 'high_risk'
  if (s === 'low' || s === 'legitimate' || s === 'ok') return 'safe'
  return 'suspicious'
}, z.enum(['safe', 'suspicious', 'high_risk', 'critical']))

const confidence = z.preprocess(v => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  if (!Number.isFinite(n)) return 0.5
  // A model that answers in percent is not wrong, just differently scaled.
  const scaled = n > 1 && n <= 100 ? n / 100 : n
  return Math.min(1, Math.max(0, scaled))
}, z.number())

const severity = z.preprocess(v => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return s === 'low' || s === 'medium' || s === 'high' ? s : 'medium'
}, z.enum(['low', 'medium', 'high']))

const signal = z.object({
  type: coerceEnum(SIGNAL_TYPES, 'other'),
  severity,
  explanation: text(MAX_EXPLANATION_CHARS),
})

const nullableString = (max: number) => z.preprocess(v => (typeof v === 'string' ? v : null), z.string().max(max).nullable())

export const aiAssessmentSchema = z.object({
  riskLevel,
  confidence,
  scamType: coerceEnumNullable(SCAM_TYPES),
  attackGoal: coerceEnumNullable(ATTACK_GOALS),
  signals: z.preprocess(
    v => (Array.isArray(v) ? v.filter(i => i && typeof i === 'object') : []),
    z.array(signal).transform(items => items.filter(s => s.explanation.length > 0).slice(0, MAX_SIGNALS)),
  ),
  requestedActions: stringList(MAX_ENTITY_CHARS * 2, MAX_REQUESTED_ACTIONS),
  detectedEntities: z.preprocess(
    v => (v && typeof v === 'object' ? v : {}),
    z.object({
      organizations: stringList(MAX_ENTITY_CHARS, MAX_ENTITIES_PER_KIND),
      platforms: stringList(MAX_ENTITY_CHARS, MAX_ENTITIES_PER_KIND),
    }),
  ),
  reasoningSummary: text(MAX_SUMMARY_CHARS),
  // Accepted and dropped: some models echo a "language" field. Keeping it out of the type.
  language: nullableString(16).optional(),
})

/**
 * Pulls the first JSON object out of a model reply (tolerating a ```json fence or leading prose)
 * and validates it. `null` when nothing usable is there — the caller then reports `failed`, and
 * fusion carries on without a model opinion. A parse failure must never become a verdict.
 */
export function parseAiAssessment(raw: string): AiAssessment | null {
  if (typeof raw !== 'string') return null
  const unfenced = raw.replace(/```(?:json)?/gi, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let json: unknown
  try {
    json = JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    return null
  }
  const parsed = aiAssessmentSchema.safeParse(json)
  if (!parsed.success) return null
  const { language: _language, ...assessment } = parsed.data
  return assessment
}
