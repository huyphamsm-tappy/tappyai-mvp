// ─────────────────────────────────────────────────────────────────────────────
// The ONE client-side handler for an 18+ refusal.
//
// Every gated product surface refuses the same way — HTTP 403 with
// `age_verification_required` or `age_ineligible` — so exactly one piece of code
// should recognise that and decide where the user goes. Four surfaces styling
// four bespoke error branches is how they drift: one forgets to preserve
// `next`, another sends the user to `/login` instead, a third treats the
// refusal as retryable and loops.
//
// WHAT THIS IS NOT
// It is not enforcement. Every product API refuses independently — see
// `requireEligibleUser.ts` — so a caller that ignores this module changes
// nothing about what the account can actually do. This exists so the refusal is
// ACTIONABLE rather than a dead end.
//
// TWO ENTRY POINTS, ONE RULE
//   apiFetch()            — for ordinary fetch call sites. Intercepts the 403.
//   isAgeGateMessage()    — for transports that hand back a raw body string
//                           instead of a Response (the AI SDK's `useChat`,
//                           whose error surfaces as `error.message`).
// Both consult the same code list, so the two can never disagree about what
// counts as an age refusal.
// ─────────────────────────────────────────────────────────────────────────────

/** The refusal codes `requireEligibleUser` / `refuseIneligible` can return. */
export const AGE_GATE_CODES = ['age_verification_required', 'age_ineligible'] as const
export type AgeGateCode = (typeof AGE_GATE_CODES)[number]

const CODE_SET: ReadonlySet<string> = new Set(AGE_GATE_CODES)

export function isAgeGateCode(code: unknown): code is AgeGateCode {
  return typeof code === 'string' && CODE_SET.has(code)
}

/**
 * Detects an age refusal in a RAW body string.
 *
 * `useChat` surfaces the server's response body as `error.message`, so there is
 * no status code and no parsed JSON to inspect — a substring test is the only
 * signal available. Deliberately not a loose `/age/` match: `message` text
 * mentions age in prose, and matching that would send a user to the age screen
 * for an unrelated failure.
 */
export function isAgeGateMessage(raw: string | undefined | null): boolean {
  if (!raw) return false
  return AGE_GATE_CODES.some((code) => raw.includes(code))
}

/** Where an age refusal sends the user, with a safe return path. */
export function ageCheckHref(next?: string): string {
  const target = next ?? (typeof window !== 'undefined'
    ? window.location.pathname + window.location.search
    : '/')
  // Relative paths only — the same restriction the auth callback and the
  // age-check page apply, so a crafted link cannot turn this into an open
  // redirect.
  const safe = target.startsWith('/') && !target.startsWith('//') ? target : '/'
  return safe === '/' ? '/age-check' : `/age-check?next=${encodeURIComponent(safe)}`
}

/** Sends the browser to the age flow. No-op outside a browser. */
export function redirectToAgeCheck(next?: string): void {
  if (typeof window === 'undefined') return
  // `replace`, not `assign`: the refused page should not sit in history behind
  // the age screen, or Back returns the user straight to the refusal.
  window.location.replace(ageCheckHref(next))
}

/**
 * How long to wait for the navigation started by `apiFetch` before giving the
 * caller its response back.
 *
 * The normal path is that the page unloads and nothing else runs. But a
 * navigation can be prevented (a `beforeunload` handler, a browser that blocks
 * it), and a promise that never settles would leave a spinner up and a submit
 * button disabled forever. Settling late is a worse UX than settling never for
 * about a second, and a better one after that.
 */
const NAVIGATION_GRACE_MS = 4000

/**
 * `fetch` that turns an age refusal into a redirect instead of an error.
 *
 * On any other response — success, 401, 500 — it behaves exactly like `fetch`
 * and the caller's existing handling is untouched. That is what lets the four
 * gated surfaces adopt this by changing one identifier each.
 *
 * When it DOES intercept, it starts the navigation and then deliberately
 * withholds the response for a moment (see NAVIGATION_GRACE_MS): the caller's
 * error branch would otherwise paint a generic failure over a page that is
 * already leaving, which is the exact confusing flash this module exists to
 * remove. If the navigation does not happen, the original response is returned
 * and the caller behaves as it did before — degraded, never stuck.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { next?: string }
): Promise<Response> {
  const res = await fetch(input, init)

  // 403 is the only status the gate uses. Checking it first means the body is
  // not read — and therefore not consumed — on any other response.
  if (res.status !== 403) return res

  let code: unknown
  try {
    // `clone()` so the caller still gets an unread body if this turns out not
    // to be an age refusal. Reading the original would break every 403 handler
    // that parses its own JSON.
    code = (await res.clone().json())?.error
  } catch {
    return res // not JSON — not ours
  }

  if (!isAgeGateCode(code)) return res

  redirectToAgeCheck(options?.next)

  return new Promise<Response>((resolve) => {
    setTimeout(() => resolve(res), NAVIGATION_GRACE_MS)
  })
}
