// ── get_transport_options `mode`: tolerant, never fatal, never silent ────────
//
// Same risk class as search_places.type (placeType.ts, measured 2026-09-18): a `z.enum` in a
// tool schema is validated by the AI SDK BEFORE execute() runs, so one off-enum word from the
// model ("bus", "grab", "xe khách") ends the whole turn with `3:"An error occurred."`. The
// schema takes any string; this maps it to one of the two modes the tool knows.
//
// A value it cannot map is NOT dropped (owner rule 0.3, 2026-09-19: `unknown ⇒ undefined` was
// the same silent-drop bug as the hard-constraint skip — the tool would then have run the
// intercity branch, because getTransportOptions treats everything that is not "taxi" as
// intercity). It comes back as an explicit unknown carrying the original value; the route
// answers the model with that value and lets it ask the user which kind of trip this is.
//
// Downstream check (travel.ts): traditional taxi and ride-hailing (Grab / Be / Xanh SM) share ONE
// estimate — haversine distance × one fare band, one app list, no separate ETA source — so
// folding them into "taxi" loses nothing.

export const TRANSPORT_MODES = ['intercity', 'taxi'] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

export type TransportModeResult =
  | { mode: TransportMode; raw: string | undefined; coerced: boolean }
  /** The model omitted the field: the tool's own default applies (intercity). */
  | { mode: undefined; raw: undefined; coerced: false }
  /** The model wrote something that names neither kind of trip. */
  | { mode: 'unknown'; raw: string; coerced: false }

const SYNONYMS: Record<string, TransportMode> = {
  bus: 'intercity', coach: 'intercity', train: 'intercity', railway: 'intercity', 'xe khach': 'intercity',
  'tau hoa': 'intercity', 'tau': 'intercity', 'xe do': 'intercity', 'lien tinh': 'intercity', 'long distance': 'intercity',
  'inter city': 'intercity', intercity: 'intercity', 'xe limousine': 'intercity', limousine: 'intercity', sleeper: 'intercity',
  taxi: 'taxi', grab: 'taxi', be: 'taxi', 'xanh sm': 'taxi', 'xe cong nghe': 'taxi', ride: 'taxi', 'ride hailing': 'taxi',
  cab: 'taxi', 'xe om': 'taxi', motorbike: 'taxi', bike: 'taxi', local: 'taxi', 'in city': 'taxi', 'noi thanh': 'taxi',
  'trong thanh pho': 'taxi', 'xe may': 'taxi', car: 'taxi', 'o to': 'taxi',
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')

/** Where the model's `mode` lands: a known mode, the tool default (omitted), or an explicit unknown. */
export function coerceTransportMode(raw: unknown): TransportModeResult {
  if (raw === undefined || raw === null) return { mode: undefined, raw: undefined, coerced: false }
  const asText = typeof raw === 'string' ? raw : String(raw)
  const t = fold(asText).trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (!t) return { mode: undefined, raw: undefined, coerced: false }
  if ((TRANSPORT_MODES as readonly string[]).includes(t)) return { mode: t as TransportMode, raw: asText, coerced: t !== asText }
  if (SYNONYMS[t]) return { mode: SYNONYMS[t], raw: asText, coerced: true }
  // Substring fallback for phrases ("xe khách giường nằm", "grab car"); short keys ("be",
  // "car", "tau") only match whole, or "be" would fire inside "bell".
  for (const k of Object.keys(SYNONYMS).filter(k => k.length >= 4).sort((a, b) => b.length - a.length)) if (t.includes(k)) return { mode: SYNONYMS[k], raw: asText, coerced: true }
  return { mode: 'unknown', raw: asText, coerced: false }
}
