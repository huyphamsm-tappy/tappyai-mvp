import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * W2 — the API error contract, enforced STRUCTURALLY.
 *
 * ============================================================================
 * THE CONTRACT
 * ============================================================================
 *   { error: "<stable machine code>", message: "<sentence, in the caller's language>" }
 *
 * `error` is for code: lowercase, snake_case, never a sentence, never localized, never derived from
 * an exception. `message` is for people, and comes from `serverMessage(...)` so it follows
 * `Accept-Language`.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS AND THE OLD GUARD DID NOT WORK (C44)
 * ============================================================================
 * B08's guard matched string LITERALS:
 *
 *     line.match(/[{,]\s*error:\s*'([^'\n]+)'/)
 *
 * So `error: 'Thiếu thông tin bắt buộc'` was caught, and
 *
 *     error: pw.missingFields(lang)      ← a function call
 *     error: String(e)                   ← an exception, verbatim
 *     error: upsertErr.message           ← a database error, verbatim
 *
 * were all invisible. `POST /api/price-watch` was still returning a Vietnamese sentence in `error`
 * with no `message` at all, months after B08 was called fixed, and the guard stayed green.
 *
 * 🚨 So this guard does NOT look at literals. It finds every JSON response payload, reads whatever
 * the `error` property is, and classifies it:
 *
 *   - a snake_case string literal          → fine
 *   - any other string literal             → a sentence in a code field, FAIL
 *   - anything that is not a literal at all → FAIL unless the producer is on the allow-list below
 *
 * The third rule is the point: an unrecognised expression is a failure by default, so the next
 * `error: someHelper(lang)` fails the moment it is written rather than months later in a UAT.
 */

const ROOT = join(__dirname, '..', '..', '..')
const API = join(ROOT, 'src', 'app', 'api')

/** A machine code: lowercase letters, digits and underscores. */
const MACHINE_CODE = /^[a-z][a-z0-9_]*$/

/**
 * Routes with no human on the other end — cron jobs, provider webhooks, IAP notifications and debug
 * endpoints. Their callers are schedulers and payment providers, so a short English reason is the
 * right contract and localizing it would be noise. Same exemption B08 established.
 */
const MACHINE_TO_MACHINE = [
  /^src\/app\/api\/cron\//,
  /^src\/app\/api\/webhooks\//,
  /^src\/app\/api\/iap\/apple\/notifications\//,
  /^src\/app\/api\/stripe\/webhook\//,
  /^src\/app\/api\/debug-places\//,
  /^src\/app\/api\/test-photos\//,
  /^src\/app\/api\/health\//,
  /^src\/app\/api\/version\//,
]

/**
 * The ONLY non-literal expressions allowed in an `error` field.
 *
 * Every entry has to be something that provably yields a machine code, never prose. Adding to this
 * list is a deliberate act; the default for anything else is failure.
 */
const ALLOWED_CODE_EXPRESSIONS = [
  // The validator's own discriminated code — `clientInput.ts` types it as a union of snake_case
  // literals, so it cannot carry a sentence.
  'validated.code',
]

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) routeFiles(p, out)
    else if (entry === 'route.ts') out.push(p)
  }
  return out
}

function rel(p: string): string {
  return relative(ROOT, p).replace(/\\/g, '/')
}

/**
 * Every `error:` property that appears inside a JSON response payload, with the raw expression.
 *
 * Anchored on `NextResponse.json(` / `Response.json(` so a destructured
 * `const { error: dbErr } = await supabase…` — which is not a response at all — is never mistaken
 * for one. That distinction is what makes the "unknown expression fails" rule usable: without it
 * the guard would drown in false positives and get switched off.
 */
interface ErrorSite {
  file: string
  line: number
  expression: string
  hasMessage: boolean
}

function errorSites(file: string): ErrorSite[] {
  const text = readFileSync(file, 'utf8')
  const sites: ErrorSite[] = []
  const responseCall = /(?:NextResponse|Response)\s*\.\s*json\s*\(/g

  let m: RegExpExecArray | null
  while ((m = responseCall.exec(text))) {
    // Walk from the opening paren to its match so nested objects/calls stay inside the payload.
    let depth = 0
    let i = m.index + m[0].length - 1
    const start = i
    for (; i < text.length; i++) {
      const ch = text[i]
      if (ch === '(') depth++
      else if (ch === ')') { depth--; if (depth === 0) break }
    }
    const payload = text.slice(start + 1, i)
    const errorProp = payload.match(/(?:^|[{,\s])error\s*:\s*([^,}\n]+)/)
    if (!errorProp) continue

    sites.push({
      file: rel(file),
      line: text.slice(0, m.index).split('\n').length,
      expression: errorProp[1].trim().replace(/,$/, ''),
      hasMessage: /(?:^|[{,\s])message\s*:/.test(payload),
    })
  }
  return sites
}

const ALL_SITES = routeFiles(API).flatMap(errorSites)
const HUMAN_SITES = ALL_SITES.filter((s) => !MACHINE_TO_MACHINE.some((re) => re.test(s.file)))

function unquote(expression: string): string | null {
  const m = expression.match(/^'([^']*)'$|^"([^"]*)"$|^`([^`$]*)`$/)
  if (!m) return null
  return m[1] ?? m[2] ?? m[3] ?? ''
}

describe('W2 — the guard can see the whole surface', () => {
  it('finds error sites in a realistic number of routes', () => {
    // A parser that silently matched nothing would make every assertion below vacuous — the exact
    // failure mode that let C44 live. This is the tripwire for that.
    expect(ALL_SITES.length).toBeGreaterThan(150)
    expect(new Set(ALL_SITES.map((s) => s.file)).size).toBeGreaterThan(30)
  })

  it('does not mistake a destructured supabase error for a response', () => {
    // `const { data, error: dbErr } = await supabase…` must never appear as a site.
    expect(ALL_SITES.filter((s) => /^(dbErr|readErr|delErr|insertError|upsertErr)$/.test(s.expression)))
      .toEqual([])
  })
})

describe('W2 — `error` carries a machine code, never a sentence', () => {
  it('every literal error code is snake_case', () => {
    const offenders = HUMAN_SITES
      .map((s) => ({ ...s, literal: unquote(s.expression) }))
      .filter((s) => s.literal !== null && !MACHINE_CODE.test(s.literal!))
      .map((s) => `${s.file}:${s.line}  error: ${s.expression}`)
    expect(offenders, 'a sentence, or a capitalised word, in a field clients branch on').toEqual([])
  })

  /**
   * 🚨 The rule C44 was missing. An `error` value that is not a literal cannot be read by eye, so
   * it is refused unless it is a known code producer.
   */
  it('every non-literal error value is a known code producer', () => {
    const offenders = HUMAN_SITES
      .filter((s) => unquote(s.expression) === null)
      .filter((s) => !ALLOWED_CODE_EXPRESSIONS.includes(s.expression))
      .map((s) => `${s.file}:${s.line}  error: ${s.expression}`)
    expect(
      offenders,
      'a computed `error` may be a localized sentence, a database error or an exception — none of ' +
      'which a client can branch on. Return a snake_case code and put the human text in `message`.',
    ).toEqual([])
  })

  it('never returns an exception or a database message to the client', () => {
    // Information disclosure as much as a contract break: `String(e)` and `err.message` can carry
    // table names, column names, connection strings and stack fragments.
    const leaks = ALL_SITES
      .filter((s) => /String\(|\.message\b|JSON\.stringify\(/.test(s.expression))
      .filter((s) => !MACHINE_TO_MACHINE.some((re) => re.test(s.file)))
      .map((s) => `${s.file}:${s.line}  error: ${s.expression}`)
    expect(leaks).toEqual([])
  })
})

describe('W2 — a user-facing error carries a human message beside the code', () => {
  /**
   * A code alone is unrenderable. The exceptions are deliberate and narrow: a malformed request
   * shape is a CLIENT bug, and there is no sentence worth showing a user whose client sent
   * something impossible.
   */
  const CLIENT_SHAPE_CODES = new Set([
    'invalid_request', 'invalid_role', 'invalid_content', 'forbidden_structure',
    'too_many_messages', 'too_many_images', 'too_many_preferences', 'message_too_long',
    'preference_too_long', 'invalid_preferences',
  ])

  /**
   * Session bootstrap. No user ever reads these: the client mints or claims a session in the
   * background and every caller fails OPEN — Android's `ensureAnonymousSession` catches and returns,
   * the Zalo callback redirects rather than rendering JSON. A sentence here would be written for
   * nobody, and pretending otherwise would make the exemption list meaningless.
   */
  const BOOTSTRAP_ROUTES = [
    /^src\/app\/api\/auth\/anonymous\//,
    /^src\/app\/api\/auth\/claim-anonymous\//,
    /^src\/app\/api\/auth\/zalo\//,
  ]

  it('every user-facing error code ships a message', () => {
    const missing = HUMAN_SITES
      .filter((s) => !BOOTSTRAP_ROUTES.some((re) => re.test(s.file)))
      .map((s) => ({ ...s, literal: unquote(s.expression) }))
      .filter((s) => s.literal !== null)
      .filter((s) => !s.hasMessage && !CLIENT_SHAPE_CODES.has(s.literal!))
      .map((s) => `${s.file}:${s.line}  error: '${s.literal}' — no message`)
    expect(missing).toEqual([])
  })
})
