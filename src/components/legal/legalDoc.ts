// Document-shape types and helpers for the legal pages.
//
// Deliberately NOT in LegalDocument.tsx: that file is 'use client', and a
// runtime function exported from a client module becomes a client *reference*
// when imported by a server component, not a callable — calling bullets() from
// the server-rendered page then fails with "(0 , s.f) is not a function" during
// page-data collection. Types alone would be fine (erased at compile time), but
// the helper is real code, so the whole contract lives here in a plain module
// that both sides can import.

export type LegalBlock =
  | { kind: 'lead' | 'p' | 'note'; key: string }
  | { kind: 'bullets'; keys: string[] }
  // Ordered instructions where the sequence is the meaning (e.g. the in-app
  // steps on /delete-account). Distinct from `bullets`, which is an unordered
  // set: a numbered <ol> is what assistive tech announces as "step 2 of 4".
  | { kind: 'steps'; keys: string[] }
  | { kind: 'contact' }

export interface LegalSection {
  id: string
  headingKey: string
  blocks: LegalBlock[]
}

export interface LegalDoc {
  titleKey: string
  effectiveKey: string
  sections: LegalSection[]
}

/** Builds numbered bullet keys, e.g. bullets('x.b', 3) -> ['x.b1','x.b2','x.b3']. */
export function bullets(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`)
}
