import { describe, it, expect } from 'vitest'
import { classifyBrand } from '../directory/brandMatch'
import { impersonationSignal } from '../engine/impersonationSignal'
import { calculateRisk } from '../engine/riskEngine'
import { buildEvidence } from '../engine/evidenceEngine'
import { getRecommendedActions } from '../engine/actionEngine'
import { officialDirectory } from '../directory/officialDirectory'
import type { ProviderSignal } from '../types'

/**
 * U01 — the exact verdicts production got wrong, pinned.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS ON TOP OF THE OTHER FIFTEEN
 * ============================================================================
 * Scam Shield already has 162 tests. None of them failed while production was telling users that
 * `vietcombank-online.com` "appears safe", because they all run against a hand-built directory
 * fixture and the deployed defect was in the SHIPPED directory — the aliases that make `vcb…`
 * resolve to Vietcombank were simply not in the deployed tree.
 *
 * 🚨 So this file uses the REAL `officialDirectory`, not a fixture, and names the exact hostnames
 * measured against production on 2026-08-21:
 *
 *     vietcombank-online.com  →  19 / LOW  / "This link appears safe."     ← what production said
 *     vcb-secure-login.net    →  19 / LOW  / "This link appears safe."     ← what production said
 *
 * Every row below asserts the verdict a user's safety depends on, through the real engine, with the
 * real data. If a future change removes an alias, weakens the lookalike rule, or reorders the
 * directory, these fail — which is the one thing the existing 162 could not do.
 */

/**
 * What the six real providers reported for the live phishing domains: score 19, and enough of the
 * base completed for confidence 75. Reproducing it exactly is what makes these a measurement of
 * the production case rather than an approximation of it.
 */
function productionProviderBaseline(): ProviderSignal[] {
  return [
    { provider: 'whois', status: 'completed', finding: 'NEW_DOMAIN', severity: 'info', weight: 4.5, detail: '' },
    { provider: 'ssl', status: 'completed', finding: 'OK', severity: 'info', weight: 3, detail: '' },
    { provider: 'dns', status: 'completed', finding: 'OK', severity: 'info', weight: 3, detail: '' },
    { provider: 'redirect', status: 'completed', finding: 'OK', severity: 'info', weight: 4.5, detail: '' },
    { provider: 'blocklist', status: 'completed', finding: 'NOT_LISTED', severity: 'info', weight: 4, detail: '' },
    { provider: 'webRisk', status: 'unavailable', finding: 'NOT_CONFIGURED', severity: 'info', weight: 0, detail: '' },
  ]
}

async function assessWithRealDirectory(hostname: string, providers = productionProviderBaseline()) {
  const directory = await officialDirectory.getAll()
  const match = classifyBrand(hostname, directory)
  const signal = impersonationSignal(match)
  const signals = signal ? [...providers, signal] : providers
  const risk = calculateRisk(signals)
  const evidence = buildEvidence(signals)
  const actions = getRecommendedActions(risk.level, evidence, match.entity, risk.confidence)
  return { match, risk, actions, labels: actions.map((a) => a.action) }
}

/** The hostnames measured against production, with the brand each impersonates. */
const PRODUCTION_FAILURES = [
  { host: 'vietcombank-online.com', brand: 'Vietcombank', note: 'production: 19/LOW "appears safe"' },
  { host: 'vcb-secure-login.net', brand: 'Vietcombank', note: 'production: 19/LOW "appears safe"' },
  { host: 'vcbdigibank-login.com', brand: 'Vietcombank', note: 'alias + login lure' },
  { host: 'vietcombamk.com.vn', brand: 'Vietcombank', note: 'typo-squat, distance 1' },
  { host: 'momo-xacthuc-otp.top', brand: 'MoMo', note: 'wallet OTP lure — was in NO test file' },
]

describe('U01 — the domains production got wrong are HIGH risk, through the real directory', () => {
  it.each(PRODUCTION_FAILURES)('$host — $note', async ({ host, brand }) => {
    const { match, risk, labels } = await assessWithRealDirectory(host)

    expect(match.entity?.brand, `${host} no longer resolves to ${brand}`).toBe(brand)
    expect(
      ['HIGH', 'CRITICAL'],
      `${host} scored ${risk.score}/${risk.level} — production shipped this as LOW`,
    ).toContain(risk.level)
    expect(risk.score, `${host} scored ${risk.score}, below the HIGH band`).toBeGreaterThanOrEqual(70)
    // The verdict is only useful if it reaches the user as an instruction.
    expect(labels, `${host} does not tell the user to avoid it`).toContain('DO_NOT_OPEN')
    expect(labels, `${host} does not offer the official site`).toContain('USE_OFFICIAL')
  })

  it('🚨 none of them can EVER come back SAFE or LOW', async () => {
    // The single property whose violation was the production incident.
    for (const { host } of PRODUCTION_FAILURES) {
      const { risk } = await assessWithRealDirectory(host)
      expect(['SAFE', 'LOW'], `${host} is back to ${risk.level}`).not.toContain(risk.level)
    }
  })

  it('the official site offered is the real one, not the impersonator', async () => {
    const { actions } = await assessWithRealDirectory('vietcombank-online.com')
    const official = actions.find((a) => a.action === 'USE_OFFICIAL')
    expect(official?.label_en).toContain('vietcombank.com.vn')
    expect(official?.label_en).not.toContain('vietcombank-online.com')
    // Both languages, because a Vietnamese user reads the other one.
    expect(official?.label_vi).toContain('vietcombank.com.vn')
  })
})

describe('U01 — the real banks are NOT flagged', () => {
  /**
   * The failure mode a fix like this creates. An over-eager alias turns the bank's own site into
   * "impersonation" and trains people to ignore the warning — which is worse than the original bug,
   * because it breaks the signal itself.
   */
  const LEGITIMATE = [
    'vietcombank.com.vn',
    'techcombank.com.vn',
    'momo.vn',
    'bidv.com.vn',
    'agribank.com.vn',
    'vietinbank.vn',
    // Unrelated domains that merely contain a bank-ish substring.
    'agriculture-news.vn',
    'vibrant-design.com',
    'techcrunch.com',
  ]

  it.each(LEGITIMATE)('%s is not treated as an impersonator', async (host) => {
    const { match, risk, labels } = await assessWithRealDirectory(host)
    // 🚨 `kind`, not a truthiness check on some property of the match.
    //
    // The first version of this asserted `match.isImpersonation` — a field that does not exist on
    // `BrandMatch`. It read as `undefined`, `toBeFalsy()` passed for every host, and the whole
    // over-match check was vacuous. `tsc` caught it; the test run never would have.
    //
    // `entity` alone is also the wrong thing to look at: it is populated for BOTH an official
    // match and an impersonation, deliberately, so the warning can point at the real site.
    // Conflating those two is precisely what B01 was.
    expect(match.kind, `${host} was flagged as impersonating ${match.entity?.brand}`)
      .not.toBe('BRAND_IMPERSONATION')
    expect(['HIGH', 'CRITICAL'], `${host} scored ${risk.level}`).not.toContain(risk.level)
    expect(labels, `${host} tells the user not to open a legitimate site`).not.toContain('DO_NOT_OPEN')
  })
})

describe('U01 — the real directory still contains what the fix added', () => {
  it('the aliases that make `vcb…` resolve are present', async () => {
    // Production shipped a directory with ZERO aliases; that absence IS the incident. This asserts
    // the data, not the code that reads it.
    const directory = await officialDirectory.getAll()
    const vcb = directory.find((e) => e.id === 'vcb')
    expect(vcb?.aliases, 'Vietcombank has no aliases — the production defect is back').toBeTruthy()
    expect(vcb?.aliases).toContain('VCB')

    const withAliases = directory.filter((e) => (e.aliases?.length ?? 0) > 0)
    expect(withAliases.length, 'the alias set shrank').toBeGreaterThanOrEqual(14)
  })

  it('the directory is a real directory, not an empty fixture', async () => {
    // Guards the guard: every assertion above would pass trivially against an empty list.
    const directory = await officialDirectory.getAll()
    expect(directory.length).toBeGreaterThan(30)
    expect(directory.some((e) => e.category === 'bank')).toBe(true)
  })
})
