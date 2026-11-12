// The emergency turn (R13 §10.5, SAFETY_EMERGENCY): classifier verdict -> SafetyContext -> buildSafetyPayload -> plain text + one annotation for the web card. Deterministic, no model call.
//   - Cards come only from VERIFIED_HOTLINES via buildSafetyPayload, and only when the person's position (a device GPS point) is inside Viet Nam. Language never decides the place.
//   - The location question is asked at most once per thread: the module's own guard (mayAskLocation) is fed "already asked" from the assistant turns of the thread.
//   - Hours and "free" are written only from the card's own registry fields (111 and 112); the copy itself never says them.
import { buildSafetyPayload, mayAskLocation, type EpisodeState, type SafetyResponsePayload, type VerifiedHotline } from './emergencyPayload'
import type { DetectedCategory } from './emergencyClassifier'
import { insideVietnam } from './vietnamPlace'
import { vi as VI, en as EN, zh as ZH } from '@/lib/i18n/w5/safetyEmergency'

export const SAFETY_ANNOTATION_KIND = 'tappy.safety.v1'
type Lang = 'vi' | 'en' | 'zh'
const copy = (lang: Lang) => (lang === 'en' ? EN : lang === 'zh' ? ZH : VI)

export interface SafetyCard { hotlineId: string; displayName: string; phoneNumber: string; operatingHours?: string; freeOfCharge?: true; sourceUrl: string }
export interface SafetyAnnotation { kind: typeof SAFETY_ANNOTATION_KIND; v: 1; category: DetectedCategory; cards: SafetyCard[]; askedLocation: boolean }
export interface EmergencyTurn { payload: SafetyResponsePayload; text: string; annotation: SafetyAnnotation }

const textOf = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join(' ') : '')

/** Did an earlier ASSISTANT turn of this thread already ask where the person is? (the question's own words, in either language) */
export function locationAlreadyAsked(messages: ReadonlyArray<{ role: string; content: unknown }>): boolean {
  return messages.some(m => m.role === 'assistant' && (() => { const t = textOf(m.content); return t.includes(VI['safety.emergency.askLocation']) || t.includes(EN['safety.emergency.askLocation']) || t.includes(ZH['safety.emergency.askLocation']) })())
}

const toCard = (h: VerifiedHotline): SafetyCard => ({ hotlineId: h.hotlineId, displayName: h.displayName, phoneNumber: h.phoneNumber ?? '', ...(h.operatingHours ? { operatingHours: h.operatingHours } : {}), ...(h.freeOfCharge ? { freeOfCharge: true as const } : {}), sourceUrl: h.sourceUrl })

export function buildEmergencyTurn(i: { category: DetectedCategory; lang: Lang; userLocation: { lat: number; lng: number } | null; priorMessages: ReadonlyArray<{ role: string; content: unknown }>; now: Date }): EmergencyTurn {
  const inVn = !!i.userLocation && insideVietnam(i.userLocation.lat, i.userLocation.lng)
  const jurisdictionStatus = inVn ? 'VERIFIED' as const : 'UNKNOWN' as const
  const episode: EpisodeState = { emergencyEpisodeId: 'thread', status: 'ACTIVE', locationClarificationPromptIssued: locationAlreadyAsked(i.priorMessages), jurisdictionStatus, lastSafetyRelevantActivityAt: i.now.toISOString(), inactivityWindowSeconds: 3600 }
  const payload = buildSafetyPayload({ severity: 'EMERGENCY', reasonCode: `EMERGENCY_${i.category}`, locale: i.lang, jurisdictionStatus, currentJurisdiction: inVn ? 'VN' : null, category: i.category, mayAskLocation: mayAskLocation(episode, i.now) })
  const c = copy(i.lang)
  const cards = payload.hotlineCards.map(toCard).filter(x => x.phoneNumber)
  const asks = !!payload.emergencyFallback?.locationClarificationPromptKey
  const lines = cards.map(k => `- **${k.displayName}: ${k.phoneNumber}**${k.operatingHours ? ` · ${c['safety.emergency.hours'].replace('{hours}', k.operatingHours)}` : ''}${k.freeOfCharge ? ` · ${c['safety.emergency.free']}` : ''}`)
  const text = [
    `**${c['safety.emergency.title']}**`,
    c[payload.emergencyFallback?.immediateGuidanceKey ?? 'safety.emergency.guidance.unknownPlace'],
    c[`safety.emergency.cat.${i.category}`],
    ...(lines.length ? [`${c['safety.emergency.cardsTitle']}:`, lines.join('\n')] : []),
    ...(asks ? [c['safety.emergency.askLocation']] : []),
  ].join('\n\n')
  return { payload, text, annotation: { kind: SAFETY_ANNOTATION_KIND, v: 1, category: i.category, cards, askedLocation: asks } }
}

/** The answer as the AI SDK data stream the clients parse: the text, the card annotation, the finish frame. No model, no tool, no cost. */
export function emergencyDataStreamResponse(turn: EmergencyTurn, headers: Record<string, string> = {}): Response {
  const body = `0:${JSON.stringify(turn.text)}\n8:${JSON.stringify([turn.annotation])}\nd:${JSON.stringify({ finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } })}\n`
  return new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-vercel-ai-data-stream': 'v1', 'cache-control': 'no-store', ...headers } })
}

/** The web card's reader: the safety annotation of a message, or null. */
export function readSafetyAnnotation(annotations: unknown[] | undefined | null): SafetyAnnotation | null {
  if (!Array.isArray(annotations)) return null
  for (const a of annotations) {
    if (!a || typeof a !== 'object') continue
    const x = a as Partial<SafetyAnnotation>
    if (x.kind !== SAFETY_ANNOTATION_KIND || !Array.isArray(x.cards)) continue
    const cards = x.cards.filter((k): k is SafetyCard => !!k && typeof k.phoneNumber === 'string' && /^\d{2,4}$/.test(k.phoneNumber) && typeof k.displayName === 'string')
    return { kind: SAFETY_ANNOTATION_KIND, v: 1, category: x.category as DetectedCategory, cards, askedLocation: !!x.askedLocation }
  }
  return null
}
