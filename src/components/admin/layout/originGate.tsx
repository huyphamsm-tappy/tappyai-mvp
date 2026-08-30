'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

// ─── THE CONTROLLER ORIGIN GATE ──────────────────────────────────────────────
//
// 🚨 THIS IS PRESENTATION. IT IS NOT AUTHORIZATION.
//
// `isSameOrigin(req)` in src/lib/admin/rbac.ts is and remains the authority: it
// refuses every guarded `/api/admin/*` request whose `Origin` is not the
// canonical site origin, and nothing here changes, weakens or bypasses it. If
// this file were deleted the security boundary would be exactly as strong; what
// would come back is the defect it exists to fix.
//
// THE DEFECT. The production deployment is reachable at two hostnames — the
// canonical `https://www.tappyai.com` and the Vercel alias
// `https://tappyai-mvp.vercel.app` (MEASURED: the alias answers 200 and serves
// the same revision). On the alias the Controller renders in full, forms accept
// input, and every guarded request then fails 403 `Cross-origin request denied`.
// The person finds out after composing the message, not before.
//
// WHY IT COVERS READS TOO, NOT ONLY MUTATIONS. An audit of `origin/main` found
// 25 `isSameOrigin` call sites across 20 route files: 18 mutations
// (POST/PATCH/DELETE) and **7 GET reads**. Six of those reads are fetched from
// client components — analytics (users/activation/auth), the moderation queue,
// the membership roster and user notes — so on a non-canonical origin they are
// already 403 as well. A gate that spoke only about mutations would ship a
// banner that is not true: it would explain the disabled Send button while the
// analytics panel beside it kept failing silently.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not disable the Controller. Several
// admin reads carry no same-origin guard at all — audit, the users list,
// `users/[id]`, the home snapshot and settings — and those keep working on any
// origin. The gate models the ACTUAL dependency, route by route, rather than the
// convenient generalisation "nothing works here".

/**
 * The origin of `value`, or null when it cannot be one.
 *
 * 🔑 Normalisation is `new URL().origin`, not string comparison. It makes
 * `https://www.tappyai.com` and `https://www.tappyai.com/` the same answer —
 * a trailing slash in configuration must not read as a different site — while
 * a malformed value throws and becomes `null`, which the gate treats as
 * unknown, which fails closed.
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

interface ControllerOriginValue {
  /**
   * Whether the provider is mounted at all.
   *
   * 🔑 "THE GATE SAYS NO" AND "THERE IS NO GATE" ARE DIFFERENT ANSWERS. In the
   * Controller the provider is always mounted, by AdminShell. Outside it — a
   * component rendered on its own in a unit test, or one day some surface that
   * lives elsewhere — there is no origin to compare against, and treating that
   * as "refuse everything" would mean this file silently disabled controls in
   * contexts it knows nothing about. Where the gate is not installed, behaviour
   * is exactly what it was before it existed; the server guard is unaffected
   * either way, because it never depended on this.
   */
  installed: boolean
  /** The canonical origin the server guard compares against, normalised. */
  canonicalOrigin: string | null
  /**
   * True only when this browser is on the canonical origin.
   *
   * FAILS CLOSED. It is false while the browser origin is still unknown (server
   * render, first paint before the effect runs), false when the canonical
   * origin is absent or malformed, and false on any other host.
   */
  guardedApiAvailable: boolean
  /**
   * True once the browser origin has been observed AND it is not canonical —
   * i.e. the one case where telling the person something is useful.
   *
   * Separate from `!guardedApiAvailable` on purpose: during the first render
   * the answer is not yet known, and a banner that flashes on the canonical
   * origin would be worse than no banner at all.
   */
  showUnavailableNotice: boolean
}

/**
 * THE WHOLE DECISION, as a pure function of two values.
 *
 * Extracted so the states a rendered tree cannot show can still be asserted:
 * React flushes the provider's effect inside `render()`, so "the browser origin
 * has not been observed yet" is unobservable from the DOM — and that is exactly
 * the state fail-closed depends on. A test that cannot reach a state cannot
 * prove anything about it.
 */
export function deriveOriginState(
  canonicalOrigin: string | null | undefined,
  browserOrigin: string | null | undefined,
): ControllerOriginValue {
  const canonical = normalizeOrigin(canonicalOrigin)
  const observed = normalizeOrigin(browserOrigin)
  const matches = canonical !== null && observed !== null && observed === canonical
  return {
    installed: true,
    canonicalOrigin: canonical,
    guardedApiAvailable: matches,
    showUnavailableNotice: observed !== null && !matches,
  }
}

// The value seen when NO provider is mounted. `installed: false` is what tells
// consumers to behave exactly as they did before this file existed.
const NOT_INSTALLED: ControllerOriginValue = {
  installed: false,
  canonicalOrigin: null,
  guardedApiAvailable: false,
  showUnavailableNotice: false,
}

const ControllerOriginContext = createContext<ControllerOriginValue>(NOT_INSTALLED)

/**
 * Mounted once by AdminShell.
 *
 * `canonicalOrigin` is passed in from the server layout, which reads it from
 * `serverEnv.siteUrl()` — THE SAME function `isSameOrigin` reads. That is the
 * point: one source, so the thing the UI says and the thing the server enforces
 * cannot drift apart. A client that read `process.env` for itself would be a
 * second source, and two sources eventually disagree.
 */
export function ControllerOriginProvider({
  canonicalOrigin,
  children,
}: {
  canonicalOrigin: string | null
  children: ReactNode
}) {
  // Read in an effect rather than during render: the server has no
  // `window.location`, and rendering a different tree on the client would be a
  // hydration mismatch. `null` means "not observed yet", which is not the same
  // as "not canonical".
  const [browserOrigin, setBrowserOrigin] = useState<string | null>(null)
  useEffect(() => {
    setBrowserOrigin(window.location.origin)
  }, [])

  const value = useMemo<ControllerOriginValue>(
    () => deriveOriginState(canonicalOrigin, browserOrigin),
    [canonicalOrigin, browserOrigin],
  )

  return (
    <ControllerOriginContext.Provider value={value}>{children}</ControllerOriginContext.Provider>
  )
}

/**
 * The single question every guarded Controller surface asks.
 *
 * 🚨 Consumers must NOT re-derive this from `window.location`. One comparison,
 * in one place, is what stops twenty surfaces from drifting into twenty
 * slightly different opinions about which host counts.
 */
export function useControllerOrigin(): ControllerOriginValue {
  return useContext(ControllerOriginContext)
}
