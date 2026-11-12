// What the chat route does with the Canonical Context (flag CANONICAL_CONTEXT, r13Flags.ts): ONE contract per turn, a counts-only trace line, and at most ONE compact system line.
//   · The trace never carries text, names of places the person typed, coordinates or addresses: intent class, whether a target was resolved, its country code, the location source,
//     the language codes, cross_border and the number of ambiguities.
//   · The system line states FACTS (target place and country, the role of the current location, the reply language) and only when the target or the response locale is resolved with
//     confidence AND differs from what the model would assume. It never overrides the person's own words and never touches the market gate: the gate keeps the USER/SERVICE market.
// Pure and browser-safe.

import { COUNTRIES, geoEntityById } from './geoGazetteer'
import { countryName, placeLabel, resolveCanonicalContext, type CanonicalContext, type CanonicalContextInput, type LocationEvidence } from './canonicalContext'

export const CANONICAL_CONTEXT_TRACE = 'tappyai_canonical_context'

const LANGUAGE_NAME: Record<string, string> = { vi: 'Vietnamese', en: 'English', zh: 'Simplified Chinese', ja: 'Japanese', ko: 'Korean', th: 'Thai', ar: 'Arabic', fr: 'French', de: 'German', es: 'Spanish' }
export const languageName = (code: string): string => LANGUAGE_NAME[code] ?? code

/** the confidence a target needs before the model is told about it */
export const SYSTEM_LINE_MIN_CONFIDENCE = 0.75

export interface CanonicalTrace {
  type: typeof CANONICAL_CONTEXT_TRACE
  intent: CanonicalContext['intent']
  target_resolved: boolean
  target_country: string | null
  location_source: LocationEvidence['source']
  location_role: CanonicalContext['currentLocationRole']
  query_lang: string | null
  response_lang: string
  response_source: CanonicalContext['languages']['responseLocale']['source']
  cross_border: boolean
  ambiguity_count: number
  inherited: boolean
  status: CanonicalContext['status']
}

/** Counts and codes only. Pure. */
export function canonicalTrace(c: CanonicalContext): CanonicalTrace {
  return {
    type: CANONICAL_CONTEXT_TRACE,
    intent: c.intent,
    target_resolved: c.serviceTarget.resolution === 'EXPLICIT' || c.serviceTarget.resolution === 'RESOLVED',
    target_country: c.serviceTarget.countryCode ?? null,
    location_source: c.currentLocation.source,
    location_role: c.currentLocationRole,
    query_lang: c.languages.queryLanguage?.code ?? null,
    response_lang: c.languages.responseLocale.code,
    response_source: c.languages.responseLocale.source,
    cross_border: c.crossBorder,
    ambiguity_count: c.ambiguity.length,
    inherited: c.inherited,
    status: c.status,
  }
}

const placeText = (t: { displayNameOriginal?: string; placeEntityId?: string; cityId?: string; countryCode?: string }): string => {
  const ent = (t.placeEntityId && geoEntityById(t.placeEntityId)) || (t.cityId && geoEntityById(t.cityId)) || (t.countryCode && geoEntityById(t.countryCode)) || undefined
  const label = ent ? placeLabel(ent) : (t.displayNameOriginal ?? '')
  const cc = t.countryCode && COUNTRIES[t.countryCode] ? countryName(t.countryCode) : ''
  return [label, cc && !label.includes(cc) ? cc : ''].filter(Boolean).join(', ')
}

/** The ONE compact line, or null when nothing is worth telling the model. Pure. */
export function canonicalSystemLine(c: CanonicalContext): string | null {
  const parts: string[] = []
  const t = c.serviceTarget
  const loc = c.currentLocation
  const resolved = (t.resolution === 'EXPLICIT' || t.resolution === 'RESOLVED') && (t.confidence ?? 0) >= SYSTEM_LINE_MIN_CONFIDENCE && !c.ambiguity.some(a => a.blocking)
  const targets = c.travelContext?.destinations.length ? c.travelContext.destinations : (resolved ? [t] : [])
  const tellTargets = c.intent !== 'GENERAL_INFORMATION' && c.confidence >= SYSTEM_LINE_MIN_CONFIDENCE - 0.15 && targets.length > 0
    && targets.every(x => (x.confidence ?? 0) >= SYSTEM_LINE_MIN_CONFIDENCE - 0.15 && x.resolution !== 'UNRESOLVED')
    && c.currentLocationRole !== 'PRIMARY_RADIUS'

  if (tellTargets) {
    const assumedCountry = (loc.source !== 'UNKNOWN' ? loc.countryCode : undefined) ?? 'VN'
    const differs = targets.some(x => (x.countryCode && x.countryCode !== assumedCountry) || (x.cityId && loc.cityId && x.cityId !== loc.cityId))
    if (differs) {
      const label = targets.map(placeText).join(' | ')
      parts.push(`${targets.length > 1 ? 'Places asked about' : 'Target place'}: ${label}${c.inherited ? ' (carried from the earlier turn)' : ''}.`)
      if (loc.source !== 'UNKNOWN' && (loc.cityId || loc.countryCode)) {
        const here = placeText({ cityId: loc.cityId, countryCode: loc.countryCode })
        const roleText = c.currentLocationRole === 'ORIGIN' ? 'the starting point' : c.currentLocationRole === 'ELIGIBILITY' ? 'context for entry/eligibility only' : 'secondary context, not the target'
        parts.push(`Current location (${loc.source}): ${here}, ${roleText}.`)
      } else if (c.travelContext?.origin) parts.push(`Starting point: ${placeText(c.travelContext.origin)}.`)
      if (c.crossBorder) parts.push('Cross-border question: answer for the target place; this is not a refusal.')
    }
  }

  const rl = c.languages.responseLocale
  const q = c.languages.queryLanguage
  if ((rl.source === 'EXPLICIT_REQUEST' || rl.source === 'USER_CHOICE') && (!q || q.code !== rl.code)) {
    parts.push(`Reply language: ${languageName(rl.code)} (${rl.source === 'EXPLICIT_REQUEST' ? 'the person asked for it' : "the person's chosen language"}); keep names of places, dishes and brands in their original form.`)
  }

  return parts.length ? `[Resolved context, facts only; the person's own words override it] ${parts.join(' ')}` : null
}

export interface CanonicalTurn { context: CanonicalContext; trace: CanonicalTrace; systemLine: string | null }

/** The whole per-turn step the route runs when the flag is ON. Pure. */
export function canonicalTurn(input: CanonicalContextInput): CanonicalTurn {
  const context = resolveCanonicalContext(input)
  return { context, trace: canonicalTrace(context), systemLine: canonicalSystemLine(context) }
}
