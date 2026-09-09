import type { Metadata } from 'next'
import { AgeCheckView } from './AgeCheckView'

// ─────────────────────────────────────────────────────────────────────────────
// /age-check — the 18+ eligibility surface.
//
// It renders three states from ONE source of truth (`GET /api/profile` →
// `ageStatus`), rather than three routes:
//
//   unknown     → ask for a date of birth
//   ineligible  → explain the refusal; offer the single self-correction if the
//                 user still holds it, otherwise point at support
//   eligible    → nothing to do here; bounce to wherever they were going
//
// 🚨 THIS PAGE IS NOT THE GATE. It is the human-readable face of a gate that
//    lives in the API (`requireEligibleUser` / `refuseIneligible`) and, for the
//    fields it depends on, in the database grants. Every product endpoint
//    refuses an ineligible caller on its own, so navigating around this page —
//    by deep link, by direct route, or by calling the API from a script —
//    reaches the same refusal. Hiding the UI is not what stops anyone.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Age check — TappyAI',
  // A gate has no business in search results, and an indexed refusal page would
  // be a public statement about a private account state.
  robots: { index: false, follow: false },
}

export default function AgeCheckPage() {
  return <AgeCheckView />
}
