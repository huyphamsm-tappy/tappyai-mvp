import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * U02 / U15 — the anonymous-write boundary, enforced across the WHOLE API surface.
 *
 * ============================================================================
 * WHY A WHOLE-SURFACE GUARD AND NOT PER-ROUTE TESTS
 * ============================================================================
 * `socialWriteAccess.test.ts` proves the helper works and that a named list of routes calls it.
 * That is necessary and it is not sufficient, because it can only assert about routes somebody
 * remembered to add to the list. The defect class here is the opposite: a route that nobody
 * thought about.
 *
 * That is exactly how `POST /api/explore/process` came to make up to three paid AI calls —
 * including `AI.vision()` — behind nothing but `if (!user)`, with no rate limit at all, reachable
 * by any anonymous session. It was not on anyone's list of social writes, so no list caught it.
 *
 * 🚨 So this guard starts from the FILESYSTEM, not from a list. Every route exporting a mutating
 * verb must be classified, and the only way to add a new one is to make a decision about it here.
 * An unclassified route FAILS. "Forgot to think about it" is the bug, and this is what makes
 * forgetting impossible.
 */

const API = 'src/app/api'

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) routeFiles(p, out)
    else if (entry === 'route.ts') out.push(p.replace(/\\/g, '/'))
  }
  return out
}

/** Route path as it appears in a URL, e.g. `group/[id]/suggest`. */
const routeName = (file: string) => file.replace(`${API}/`, '').replace(/\/route\.ts$/, '')

const MUTATING = /export async function (POST|PUT|PATCH|DELETE)\b/

/**
 * Routes that mutate but must NOT carry the anonymous refusal, each with the reason it is exempt.
 *
 * Every entry is a decision someone made on purpose. The reason is part of the data so that a
 * future reader can disagree with it, rather than guessing why a route is missing from the
 * boundary.
 */
const EXEMPT: Record<string, string> = {
  // ── The anonymous tier itself. Refusing anonymous here would refuse everything. ──
  'auth/anonymous': 'mints the anonymous session; rate-limited 5/min + 30/day per IP',
  'auth/claim-anonymous': 'the anonymous→account handoff; the anonymous token IS the credential',
  'auth/zalo/complete': 'sign-in completion, runs before any account exists',

  // ── The product deliberately offers these to a visitor (see socialWriteAccess.ts). ──
  'chat': 'the anonymous tier IS chat — capped at ANON_DAILY_LIMIT per identity, server-side',
  'conversations': "the visitor's own chat history; claimed into the account on sign-in",
  'memory': "the visitor's own chat memory; private, never shown to another user",
  'preferences': "the visitor's own preferences; private",
  'preferences/profile': "the visitor's own preference profile; private",
  'onboarding': 'runs before an account exists, by design',
  'favorites': "the visitor's own saved places; private",
  'bookings': "the visitor's own bookings; private",
  // 'price-watch' WAS here, on the same "private, self-scoped" reasoning as its neighbours.
  //
  // 🚨 That reasoning was true and insufficient. Privacy is one axis; recurring cost is another,
  // and this list already knows it — see the group below, whose whole justification is "each
  // carries its own cost control". Every other entry above is an inert row: a favourite, a
  // booking, a preference sits in the database and costs nothing until its owner looks at it.
  // A price watch is picked up by `/api/cron/price-check` every day and spends a paid search plus
  // a paid model call on the visitor's behalf, indefinitely.
  //
  // It is now guarded, so it must NOT stay listed here: an exemption that sits next to a working
  // guard is a loaded gun. Delete the guard and this line would silently make it legal again.
  'profile': 'self-scoped; an anonymous row is the visitor’s own and is claimed later',
  // 🗑️ `notifications/subscribe` removed 2026-09-01: the route now calls
  // `refuseAnonymousSocialWrite`, so it is guarded rather than exempt.
  //
  // The exemption read "device push token registration, self-scoped" — true as
  // far as it went, and still not the whole picture. It is the ONLY path that
  // creates an enabled `notification_subscriptions` row, and an anonymous
  // session costs one request to mint. The broadcast audience recognises
  // anonymous identities by the ABSENCE of a profile, which only holds for
  // accounts created after `20260808c`; a legacy anonymous account keeps its
  // profile and would pass. Closing the creation path is the preventive half of
  // that gap.
  //
  // It is removed for the reason stated four lines above about `price-watch`:
  // an exemption sitting next to a working guard is a loaded gun. Delete the
  // guard and this line would silently make it legal again.
  // 'notifications/subscribe/reconcile' is NOT here, and the first draft of it
  // was.
  //
  // 🚨 The exemption was argued on "it only disables, and whoever holds a push
  // credential can already push to that device anyway, which is worse". THE
  // SECOND HALF IS FALSE. Sending a Web Push needs the VAPID PRIVATE key that
  // the subscription was created against, plus the p256dh/auth keys to encrypt
  // with — none of which is in the endpoint. So the endpoint alone buys exactly
  // one power, and this route is it: silencing that device. That makes it a
  // denial-of-push surface rather than a no-op, and an anonymous session costs
  // one request to mint.
  //
  // It is also unnecessary. The incident it exists for had the arriving account
  // signed in, and sign-out now releases the claim on the way out. So the route
  // refuses anonymous callers and lives behind the boundary instead.
  'notifications/read': 'marks the caller’s own notifications read, self-scoped',
  'message-feedback': "feedback on the visitor's own chat message; not public content",

  // ── Anonymous-capable tools. Each carries its own cost control. ──
  'scam-shield/check': 'anonymous checks are a product feature; capped at dailyLimitAnon per IP',
  'scam-shield/qr': 'same surface as scam-shield/check; rate-limited',
  'translate': 'anonymous tool; rate-limited',
  'scan': 'anonymous tool',
  'viet-content': 'anonymous tool; rate-limited',
  'voice/tts': 'anonymous tool; rate-limited',
  'voice/language': 'anonymous tool; rate-limited',
  'links/resolve': 'link metadata for the composer; rate-limited',
  'upload/audio': 'refuses unauthenticated callers and is rate-limited',
  'upload/video': 'refuses unauthenticated callers and is rate-limited',

  // ── Counters and analytics. Not content, not a graph edge. ──
  'sound/[trackId]/play': 'play counter — anonymous listens count too; rate-limited 30/min per IP',
  'reviews/[id]/interact': "the caller's own watch row; rate-limited 10/min, values clamped, one view per user per review",
  'deals/[id]/click': 'click analytics, no user content',
  'track': 'analytics, no user content',

  // ── Machine-to-machine. No end user is present at all. ──
  'iap/apple/notifications': 'Apple server-to-server notification',
  'iap/apple/verify': 'receipt verification for the calling account',
  'stripe/checkout': 'payment session for the calling account',
  'stripe/portal': 'billing portal for the calling account',
  'webhooks/stripe': 'Stripe webhook, signature-verified',
  'notifications/backfill': 'internal job, CRON_SECRET',
  // 🗑️ `notifications/broadcast` removed 2026-09-01: the route was DELETED
  // (contract §14.2 step 8), so its exemption became stale — and the test below
  // is what caught it. Nothing about U02's guard changed; a name was removed
  // because the thing it named no longer exists.
}

/** Controller V2 has its own RBAC and is explicitly out of this boundary's scope. */
const OUT_OF_SCOPE = [/^admin\//, /^cron\//]

const ALL = routeFiles(API)
const MUTATING_ROUTES = ALL.filter((f) => MUTATING.test(readFileSync(f, 'utf8')))
  .map(routeName)
  .filter((n) => !OUT_OF_SCOPE.some((re) => re.test(n)))

const source = (name: string) => readFileSync(`${API}/${name}/route.ts`, 'utf8')

/**
 * Source with comments stripped.
 *
 * 🚨 Load-bearing. Every fix in this repo leaves a comment explaining what was wrong, and those
 * comments quote the very constructs these assertions look for — `AI.generate()`, `.insert(`.
 * Matching raw text makes the ordering check below fire on a paragraph of prose. It did, on the
 * first run, against a comment I had just written.
 */
const code = (name: string) =>
  source(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/**
 * Does this route actually CALL the refusal?
 *
 * 🚨 `includes('refuseAnonymousSocialWrite')` is not enough, and a mutation proved it: deleting the
 * call leaves `import { refuseAnonymousSocialWrite } from …` at the top of the file, the substring
 * still matches, and the guard reports the route as protected while it is wide open. The trailing
 * `(` is what distinguishes a call from an import.
 */
const guarded = (name: string) => /refuseAnonymousSocialWrite\s*\(/.test(code(name))

/**
 * Any cost control, not just one spelling of it.
 *
 * 🚨 `rateLimit(` alone is wrong: `dailyRateLimit(` is a different exported function, is what the
 * anonymous-capable tools actually use, and does not contain the lower-case substring. The first
 * version of this guard reported `translate` and `scan` as uncapped when both are capped at 30/day
 * per IP — a false alarm that would have sent someone to "fix" working code.
 */
const capped = (name: string) => /\b(daily)?[Rr]ateLimit\(/.test(code(name))

describe('U02 — the guard can see the whole surface', () => {
  it('finds a realistic number of mutating routes', () => {
    // A traversal that silently matched nothing would make every assertion below vacuous.
    expect(MUTATING_ROUTES.length).toBeGreaterThan(40)
  })

  it('the exemption list names only routes that exist', () => {
    // A stale exemption is worse than none: it looks like a decision and protects nothing.
    const stale = Object.keys(EXEMPT).filter((n) => !MUTATING_ROUTES.includes(n))
    expect(stale, 'exemptions for routes that no longer mutate (or were renamed)').toEqual([])
  })

  it('every exemption states a reason', () => {
    const blank = Object.entries(EXEMPT).filter(([, why]) => !why || why.trim().length < 12)
    expect(blank.map(([n]) => n)).toEqual([])
  })
})

describe('U02 — every mutating route is classified', () => {
  it('🚨 no route is silently unclassified', () => {
    // THE point of this file. A new mutating route is either behind the boundary or explicitly
    // exempted with a reason. There is no third state, and no way to add one by accident.
    const unclassified = MUTATING_ROUTES.filter((n) => !guarded(n) && !(n in EXEMPT))
    expect(
      unclassified,
      'these routes mutate, do not refuse anonymous callers, and are not exempted — decide, do not ignore',
    ).toEqual([])
  })

  it('the social mutations are all behind the boundary', () => {
    // Named explicitly, because these are the ones the device UAT proved were open on production.
    const SOCIAL = [
      'reviews', 'reviews/[id]', 'reviews/[id]/like', 'reviews/[id]/save',
      'reviews/[id]/comments', 'reviews/upload', 'comments/[commentId]/reactions',
      'users/[id]/follow', 'group', 'group/[id]/join', 'group/[id]/suggest',
      'music/tracks', 'music/tracks/[id]/report',
      'sound/[trackId]/follow', 'sound/[trackId]/save',
    ]
    const open = SOCIAL.filter((n) => MUTATING_ROUTES.includes(n) && !guarded(n))
    expect(open, 'a social mutation is reachable by an anonymous session').toEqual([])
  })

  it('a guarded route refuses BEFORE it does any work', () => {
    // A refusal placed after the expensive part still costs what it was meant to save.
    for (const name of MUTATING_ROUTES.filter(guarded)) {
      const src = code(name)
      const refusal = src.indexOf('refuseAnonymousSocialWrite(')
      for (const spend of ['AI.generate(', 'AI.vision(', '.insert(', '.upsert(']) {
        const at = src.indexOf(spend)
        if (at === -1) continue
        expect(refusal, `${name}: ${spend} runs before the anonymous check`).toBeLessThan(at)
      }
    }
  })
})

describe('U15 — a route that spends money is capped', () => {
  /** Routes whose handler reaches a paid model call, directly or through a helper. */
  const PAID_HELPERS: Record<string, string[]> = {
    'explore/process': ['@/lib/explore/contentProcessor'],
  }

  function reachesPaidCall(name: string): boolean {
    if (/\bAI\.(generate|vision|stream)\(/.test(code(name))) return true
    for (const helper of PAID_HELPERS[name] ?? []) {
      const path = helper.replace('@/', 'src/')
      try {
        if (/\bAI\.(generate|vision|stream)\(/.test(readFileSync(`${path}.ts`, 'utf8'))) return true
      } catch { /* helper moved; the direct check above still applies */ }
    }
    return false
  }

  const PAID = MUTATING_ROUTES.filter(reachesPaidCall)

  /**
   * Paid routes the product deliberately offers to a visitor with no account.
   *
   * These are not exempt from cost control — they are exempt from the ACCOUNT requirement, and
   * each pays for that with its own per-IP daily cap. The distinction matters: the rule is "no
   * unbounded spend", not "no anonymous spend".
   */
  const ANONYMOUS_PAID_TOOLS = new Set([
    'chat', 'scam-shield/check', 'scam-shield/qr', 'translate', 'scan', 'viet-content',
  ])

  it('the paid-route scan is not vacuous', () => {
    expect(PAID.length, 'no paid route found — this test would prove nothing').toBeGreaterThan(3)
  })

  it('🚨 every paid route is capped — no unbounded spend', () => {
    // `explore/process` reached AI.vision() with no limit of ANY kind. One anonymous identity
    // could loop it forever. This is the assertion that would have caught it.
    const uncapped = PAID.filter((n) => !capped(n))
    expect(uncapped, 'these routes reach a paid model call with no rate limit at all').toEqual([])
  })

  it('🚨 a paid route is either account-only or an explicitly listed anonymous tool', () => {
    // An anonymous identity is mintable 30×/day per IP, so "reachable by anonymous" has to be a
    // decision someone made, not a default a route drifts into.
    const undecided = PAID.filter((n) => !guarded(n) && !ANONYMOUS_PAID_TOOLS.has(n))
    expect(undecided, 'these routes spend money for an anonymous caller by accident').toEqual([])
  })

  it('explore/process specifically is closed', () => {
    // Named, because it is the one the audit found open.
    const src = code('explore/process')
    // The CALL, not the import — see `guarded`.
    expect(src).toMatch(/refuseAnonymousSocialWrite\s*\(req,\s*user\)/)
    expect(src).toMatch(/rateLimit\(`explore-process:\$\{user\.id\}`/)
    // And both must precede the spend.
    expect(src.indexOf('refuseAnonymousSocialWrite(')).toBeLessThan(src.indexOf('processContent('))
    expect(src.indexOf('rateLimit(')).toBeLessThan(src.indexOf('processContent('))
  })
})
