// ── get_transport_options `mode`: tolerant, never fatal ─────────────────────
//
// Same risk class as search_places.type (placeType.ts, measured 2026-09-18): a `z.enum` in a
// tool schema is validated by the AI SDK BEFORE execute() runs, so one off-enum word from the
// model ("bus", "grab", "xe khách") ends the whole turn with `3:"An error occurred."`. The
// schema now takes any string; this maps it to one of the two modes the tool knows, or to
// undefined (the tool then decides from the route itself, exactly as when the model omits it).

export const TRANSPORT_MODES = ['intercity', 'taxi'] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

const SYNONYMS: Record<string, TransportMode> = {
  bus: 'intercity', coach: 'intercity', train: 'intercity', railway: 'intercity', 'xe khach': 'intercity',
  'tau hoa': 'intercity', 'tau': 'intercity', 'xe do': 'intercity', 'lien tinh': 'intercity', 'long distance': 'intercity',
  'inter city': 'intercity', intercity: 'intercity', 'xe limousine': 'intercity', limousine: 'intercity', sleeper: 'intercity',
  taxi: 'taxi', grab: 'taxi', be: 'taxi', 'xanh sm': 'taxi', 'xe cong nghe': 'taxi', ride: 'taxi', 'ride hailing': 'taxi',
  cab: 'taxi', 'xe om': 'taxi', motorbike: 'taxi', bike: 'taxi', local: 'taxi', 'in city': 'taxi', 'noi thanh': 'taxi',
  'trong thanh pho': 'taxi', 'xe may': 'taxi', car: 'taxi', 'o to': 'taxi',
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')

/** The mode for whatever the model wrote, or undefined (the tool infers from the route). */
export function coerceTransportMode(raw: unknown): TransportMode | undefined {
  if (typeof raw !== 'string') return undefined
  const t = fold(raw).trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (!t) return undefined
  if ((TRANSPORT_MODES as readonly string[]).includes(t)) return t as TransportMode
  if (SYNONYMS[t]) return SYNONYMS[t]
  // Substring fallback for phrases ("xe khách giường nằm", "grab car"); short keys ("be",
  // "car", "tau") only match whole, or "be" would fire inside "bell".
  for (const k of Object.keys(SYNONYMS).filter(k => k.length >= 4).sort((a, b) => b.length - a.length)) if (t.includes(k)) return SYNONYMS[k]
  return undefined
}
