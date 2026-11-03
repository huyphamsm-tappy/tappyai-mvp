// Cloudflare Turnstile verification.
//
// One `fetch` to siteverify. No SDK: a dependency for a single HTTP call is
// supply-chain surface bought for nothing.
//
// ============================================================================
// 🔑 THIS CONTROL FAILS OPEN, ON PURPOSE, AND ONLY IN ONE DIRECTION
// ============================================================================
// Most of Tappy Business's traffic arrives inside the Zalo and Messenger in-app
// browsers. Challenge widgets are unreliable in those webviews, and Cloudflare
// is a third party that can be slow or unreachable.
//
// So the outcomes are separated:
//
//   token present and REJECTED by Cloudflare  → `failed`   the caller is refused
//   token missing, or siteverify unreachable  → `degraded` the caller proceeds
//                                                          under a tighter rate limit
//   token accepted                            → `passed`
//
// `degraded` is a deliberate decision recorded in PHASE_0 (§Clarify E): one spam
// order that gets through is cheaper than one real customer who cannot buy. It
// is safe only because it is not the only control — the IP, product and phone
// rate limits still apply, and the caller tightens them on `degraded`.
//
// A token Cloudflare actively rejects is a different thing: that is a positive
// signal of automation, and it is refused.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 3_000

export type TurnstileOutcome = 'passed' | 'failed' | 'degraded'

export interface TurnstileResult {
  outcome: TurnstileOutcome
  /** Cloudflare's codes, for logging. Never returned to the caller. */
  errorCodes?: string[]
}

/** True when the platform is configured to challenge at all. */
export function turnstileConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.TURNSTILE_SECRET_KEY === 'string' && env.TURNSTILE_SECRET_KEY.length > 0
}

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string | null,
  env: NodeJS.ProcessEnv = process.env
): Promise<TurnstileResult> {
  // Unconfigured — development, preview and the test suite. Degraded rather
  // than passed, so the tighter rate limit still applies and nobody can turn
  // the control off by removing an environment variable.
  if (!turnstileConfigured(env)) return { outcome: 'degraded' }
  if (!token) return { outcome: 'degraded' }

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return { outcome: 'degraded' }

    const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (json.success === true) return { outcome: 'passed' }
    return { outcome: 'failed', errorCodes: json['error-codes'] ?? [] }
  } catch {
    // Timeout, DNS, TLS — Cloudflare's availability must not become Tappy's.
    return { outcome: 'degraded' }
  }
}
