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
  // A single named mailto address. Distinct from `contact`, which renders the SUPPORT address
  // plus the website: the copyright policy has to publish its own agent address, and a notice
  // sent to support instead of the agent is a notice that arrives in the wrong queue.
  | { kind: 'email'; labelKey: string; address: string }
  // Question/answer pairs (the /support FAQ). A <dl> so each answer is tied to its question for
  // assistive tech, rather than two paragraphs that merely sit next to each other.
  | { kind: 'faq'; items: { q: string; a: string }[] }
  // Links to other public pages of this site (e.g. /support → /privacy, /terms,
  // /delete-account). Internal paths only: these render through next/link.
  | { kind: 'links'; items: { href: string; labelKey: string }[] }

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

/**
 * The translation keys a block renders. `contact` renders fixed shared labels, so it contributes
 * none; `email` contributes only its label (the address beside it is a literal). One definition,
 * so a new block kind is handled here once instead of in every test that walks a document.
 */
export function blockKeys(block: LegalBlock): string[] {
  switch (block.kind) {
    case 'lead':
    case 'p':
    case 'note':
      return [block.key]
    case 'bullets':
    case 'steps':
      return block.keys
    case 'email':
      return [block.labelKey]
    case 'faq':
      return block.items.flatMap(({ q, a }) => [q, a])
    case 'links':
      return block.items.map(({ labelKey }) => labelKey)
    case 'contact':
      return []
  }
}

/** Builds numbered bullet keys, e.g. bullets('x.b', 3) -> ['x.b1','x.b2','x.b3']. */
export function bullets(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`)
}
