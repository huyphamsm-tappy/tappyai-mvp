import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAgeEligibility } from '@/lib/account/ageEligibility'
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
//
// ── AUTHENTICATE FIRST, THEN ASK (owner decision 2026-09-10) ─────────────────
//
// The DOB question is an ACCOUNT SETUP step, not a doorway. Nobody is asked for
// a date of birth before they have an account to attach it to, so this guard
// runs server-side, before the view renders:
//
//   no session / anonymous  → /login?returnTo=/age-check…  (authenticate first)
//   already eligible        → straight to `next`; never ask a second time
//   otherwise               → render the view
//
// 🔑 THIS FIXES A DEAD END, and that is why it is server-side. `AgeCheckView`
//    reads `GET /api/profile`, which answers 401 for a signed-out visitor; the
//    view's load effect returns early on a non-ok response without ever calling
//    `setState`, leaving `state === null` — the spinner branch. A logged-out
//    visitor therefore sat on an endless spinner with no text, no form and no
//    way forward (measured on production, 2026-09-10). Redirecting before the
//    view mounts removes the state that produced it rather than papering over
//    it in the client.
//
// 🔑 ANONYMOUS SESSIONS COUNT AS SIGNED OUT HERE, deliberately. A Guest is a
//    real `auth.users` row, so a bare `!user` test would let one through — but
//    `handle_new_user` gives anonymous identities no `profiles` row, and
//    `user_demographics.user_id` references `profiles(id)`. There is nothing to
//    attach a date of birth to, and `set_user_date_of_birth()` answers
//    `anonymous_not_eligible` by design. Sending them to /login is the honest
//    outcome; letting them fill in a form that cannot save is not. Same
//    exclusion the home-page guard already applies.
//
// 🔑 NO ELIGIBILITY LOGIC IS DUPLICATED. This calls the same
//    `getAgeEligibility()` the auth callback, the home page and every product
//    API call, so it inherits fail-closed behaviour unchanged: a failed read is
//    `unknown`, which renders the form rather than admitting anyone.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Age check — TappyAI',
  // A gate has no business in search results, and an indexed refusal page would
  // be a public statement about a private account state.
  robots: { index: false, follow: false },
}

export default async function AgeCheckPage({
  searchParams,
}: {
  searchParams?: { next?: string | string[] }
}) {
  // Same restriction the auth callback and the view both apply: a relative path
  // only, so a crafted link cannot turn either redirect below into an open one.
  const rawNext = Array.isArray(searchParams?.next) ? searchParams?.next[0] : searchParams?.next
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.is_anonymous) {
    // Preserve where they were headed THROUGH the login hop, so a user who is
    // bounced here from a deep link still lands on it once they are eligible.
    const returnTo = next === '/' ? '/age-check' : `/age-check?next=${encodeURIComponent(next)}`
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  }

  const eligibility = await getAgeEligibility(supabase)
  if (eligibility.status === 'eligible') redirect(next)

  return <AgeCheckView />
}
