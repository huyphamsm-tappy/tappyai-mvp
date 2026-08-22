import { describe, it, expect } from 'vitest'
import { classifyBrand } from '../directory/brandMatch'
import { impersonationSignal } from '../engine/impersonationSignal'
import { calculateRisk } from '../engine/riskEngine'
import { buildEvidence } from '../engine/evidenceEngine'
import { getRecommendedActions } from '../engine/actionEngine'
import type { OfficialEntity, ProviderSignal } from '../types'

/**
 * B01 — brand impersonation must CHANGE THE RISK, not merely be detected.
 *
 * The live production failure: `http://vietcombank-verify-login.tk/secure-otp` scored 19, was
 * classified LOW, and was shown to the user as "This link appears safe" — on a page that
 * simultaneously printed the real Vietcombank domain. Detection worked; scoring never heard
 * about it.
 *
 * 🚨 So the assertions here are deliberately NOT "the brand was found". The old
 * `matcher.test.ts` asserted exactly that and passed throughout the entire period the product
 * was clearing bank-phishing links. Every test below ends at a RISK LEVEL or a USER-FACING
 * ACTION, because that is the layer the defect lived in.
 */

const DIRECTORY: OfficialEntity[] = [
  { id: 'vcb', brand: 'Vietcombank', category: 'bank', domains: ['vietcombank.com.vn'], website: 'https://vietcombank.com.vn', hotline: '1900 545413' },
  { id: 'tcb', brand: 'Techcombank', category: 'bank', domains: ['techcombank.com.vn'], website: 'https://techcombank.com.vn' },
  { id: 'bidv', brand: 'BIDV', category: 'bank', domains: ['bidv.com.vn'], website: 'https://bidv.com.vn' },
  { id: 'acb', brand: 'ACB', category: 'bank', domains: ['acb.com.vn'], website: 'https://acb.com.vn' },
  { id: 'momo', brand: 'MoMo', category: 'ewallet', domains: ['momo.vn'], website: 'https://momo.vn' },
  { id: 'shopee', brand: 'Shopee', category: 'ecommerce', domains: ['shopee.vn'], website: 'https://shopee.vn' },
  { id: 'shopeepay', brand: 'ShopeePay', category: 'ewallet', domains: ['shopeepay.vn'], website: 'https://shopeepay.vn' },
  { id: 'tiki', brand: 'Tiki', category: 'ecommerce', domains: ['tiki.vn'], website: 'https://tiki.vn' },
  { id: 'dvc', brand: 'Dịch vụ công', category: 'government', domains: ['dichvucong.gov.vn'], website: 'https://dichvucong.gov.vn' },
  { id: 'vna', brand: 'Vietnam Airlines', category: 'airline', domains: ['vietnamairlines.com'], website: 'https://www.vietnamairlines.com' },
]

/** The end-to-end path a hostname takes, minus the network providers. */
function assess(hostname: string, providerSignals: ProviderSignal[] = []) {
  const match = classifyBrand(hostname, DIRECTORY)
  const signal = impersonationSignal(match)
  const signals = signal ? [...providerSignals, signal] : providerSignals
  const risk = calculateRisk(signals)
  const evidence = buildEvidence(signals)
  const actions = getRecommendedActions(risk.level, evidence, match.entity, risk.confidence)
  return { match, risk, evidence, actions, labels: actions.map(a => a.action) }
}

/**
 * What the six real providers reported for the live phishing domains: score 19, and enough of
 * the base completed for confidence 75. Reproducing it exactly is what makes the regression
 * tests below a measurement of the production case rather than an approximation of it.
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

// ─────────────────────────────────────────────────────────────────────────────
// The three domains found live in production
// ─────────────────────────────────────────────────────────────────────────────
describe('the exact production reproductions are no longer called safe', () => {
  const LIVE = [
    'vietcombank-verify-login.tk',
    'techcombank-otp-xacthuc.xyz',
    'bidv-verify.duckdns.org',
  ]

  for (const host of LIVE) {
    it(`${host} — impersonation, HIGH risk, "do not open"`, () => {
      const { match, risk, labels } = assess(host, productionProviderBaseline())

      expect(match.kind).toBe('BRAND_IMPERSONATION')
      // Was 19/LOW in production. The impersonation weight for a bank is 60 on top of the same
      // provider baseline.
      expect(risk.score).toBe(79)
      expect(risk.level).toBe('HIGH')
      expect(labels).toContain('DO_NOT_OPEN')
      expect(labels).not.toContain('LIKELY_SAFE')
    })
  }

  it('the user is still pointed at the real bank', () => {
    // The one genuinely good behaviour the old code had. It must survive the fix — a warning
    // that leaves someone with nowhere safe to go is half an answer.
    const { labels, actions } = assess('vietcombank-verify-login.tk', productionProviderBaseline())
    expect(labels).toContain('USE_OFFICIAL')
    expect(actions.find(a => a.action === 'USE_OFFICIAL')?.label_en).toContain('vietcombank.com.vn')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Legitimate domains must not be punished for being in the directory
// ─────────────────────────────────────────────────────────────────────────────
describe('official domains stay safe', () => {
  it('the exact official domain is not impersonation and scores nothing extra', () => {
    const bare = calculateRisk(productionProviderBaseline())
    const { match, risk } = assess('vietcombank.com.vn', productionProviderBaseline())
    expect(match.kind).toBe('EXACT_OFFICIAL_MATCH')
    expect(risk.score).toBe(bare.score) // the signal carries weight 0
    expect(risk.level).not.toBe('HIGH')
  })

  it('an official SUBDOMAIN is the bank, not an impostor', () => {
    expect(classifyBrand('ibanking.vietcombank.com.vn', DIRECTORY).kind).toBe('EXACT_OFFICIAL_MATCH')
    expect(classifyBrand('www.vietcombank.com.vn', DIRECTORY).kind).toBe('EXACT_OFFICIAL_MATCH')
  })

  it('a sibling brand whose real domain contains another brand is not impersonation', () => {
    // `shopeepay.vn` contains "shopee". Checking every entity for an official-host match BEFORE
    // any impersonation check is what keeps this correct.
    const m = classifyBrand('shopeepay.vn', DIRECTORY)
    expect(m.kind).toBe('EXACT_OFFICIAL_MATCH')
    expect(m.entity?.id).toBe('shopeepay')
  })

  it('an unrelated domain that merely contains a short brand is left alone', () => {
    // "tiki" inside "kontiki". A scam checker that flags real travel agencies gets ignored on
    // the day it flags a real bank.
    expect(classifyBrand('kontiki-travel.com', DIRECTORY).kind).toBe('NO_MATCH')
    expect(classifyBrand('beacba.com', DIRECTORY).kind).toBe('NO_MATCH')
  })

  it('an entirely unknown domain is NO_MATCH and scores nothing', () => {
    const { match, risk } = assess('some-random-blog.com', productionProviderBaseline())
    expect(match.kind).toBe('NO_MATCH')
    expect(risk.score).toBe(calculateRisk(productionProviderBaseline()).score)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// How a brand can be worn
// ─────────────────────────────────────────────────────────────────────────────
describe('the ways a hostname can carry a brand name', () => {
  const impersonations: [string, string][] = [
    ['vietcombank-example.tk', 'hyphen token, unrelated TLD'],
    ['vietcombank.tk', 'bare brand on an unrelated TLD'],
    ['vietcombanklogin.xyz', 'brand as a token prefix'],
    ['viet-combank.tk', 'hyphen dropped INTO the brand to break substring checks'],
    ['login.vietcombank.tk', 'brand in a non-official registrable domain'],
    ['secure-vietcombank-otp.com', 'brand between phishing words'],
    ['mobile.techcombank-verify.net', 'brand in a subdomain label of a hostile domain'],
    ['momo-scam.xyz', 'e-wallet'],
    ['dichvucong-verify.tk', 'government, diacritics stripped from the brand'],
    ['vietnamairlines-refund.xyz', 'multi-word brand'],
  ]

  for (const [host, why] of impersonations) {
    it(`${host} — ${why}`, () => {
      expect(classifyBrand(host, DIRECTORY).kind).toBe('BRAND_IMPERSONATION')
    })
  }

  it('a 3-letter brand is caught as an exact token — the old matcher could not see this at all', () => {
    // 🚨 The previous test suite pinned `acb-phishing.com` → null and called it correct. ACB,
    // VIB, SHB and MSB impersonation was therefore invisible by construction.
    const m = classifyBrand('acb-phishing.com', DIRECTORY)
    expect(m.kind).toBe('BRAND_IMPERSONATION')
    expect(m.entity?.id).toBe('acb')
  })

  it('case is normalised', () => {
    expect(classifyBrand('VietcomBank-Verify-Login.TK', DIRECTORY).kind).toBe('BRAND_IMPERSONATION')
    expect(classifyBrand('VIETCOMBANK.COM.VN', DIRECTORY).kind).toBe('EXACT_OFFICIAL_MATCH')
  })

  it('a trailing root dot does not evade the check', () => {
    expect(classifyBrand('vietcombank-verify-login.tk.', DIRECTORY).kind).toBe('BRAND_IMPERSONATION')
    expect(classifyBrand('vietcombank.com.vn.', DIRECTORY).kind).toBe('EXACT_OFFICIAL_MATCH')
  })

  it('a punycode label is decoded before matching, and flagged', () => {
    // The real ASCII form of `vietcombank-đăng-nhập.tk` — a Vietnamese-language phishing host,
    // which is exactly the kind a Vietnamese target would find plausible. Matched as raw
    // punycode, `xn--vietcombank-ng-nhp-…` still happens to start with the brand; the case that
    // truly needs decoding is the homograph below, where the brand itself carries the diacritic.
    const m = classifyBrand('xn--vietcombank-ng-nhp-qbc3z8897c.tk', DIRECTORY)
    expect(m.kind).toBe('BRAND_IMPERSONATION')
    expect(m.evidence?.idn).toBe(true)
  })

  it('a homograph inside the brand itself is caught only because the host is decoded', () => {
    // `vietcömbank.tk` → `xn--vietcmbank-icb.tk`. The encoded label contains "vietcmbank", which
    // matches no brand; decoded it is "vietcömbank", whose diacritic is stripped to
    // "vietcombank". Without the decode step this walks straight through as NO_MATCH.
    const m = classifyBrand('xn--vietcmbank-icb.tk', DIRECTORY)
    expect(m.kind).toBe('BRAND_IMPERSONATION')
    expect(m.entity?.id).toBe('vcb')
    expect(m.evidence?.idn).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Consistency — the owner's explicit acceptance condition
// ─────────────────────────────────────────────────────────────────────────────
describe('level, evidence and action never disagree', () => {
  it('impersonation alone reaches HIGH even with every provider dead', () => {
    // The fail-closed case. No provider completed, so confidence is 0 — and a warning must never
    // be withdrawn for low confidence, only reassurance may be.
    const dead: ProviderSignal[] = [
      { provider: 'whois', status: 'timeout', finding: 'ERROR', severity: 'info', weight: 0, detail: '' },
      { provider: 'webRisk', status: 'error', finding: 'ERROR', severity: 'info', weight: 0, detail: '' },
    ]
    const { risk, labels } = assess('vietcombank-verify-login.tk', dead)
    expect(risk.level).toBe('HIGH')
    expect(labels).toContain('DO_NOT_OPEN')
    expect(labels).not.toContain('LIKELY_SAFE')
    expect(labels).not.toContain('INCONCLUSIVE')
  })

  it('a confidently detected bank impersonation can never be SAFE, LOW or INCONCLUSIVE', () => {
    // Stated as the owner stated it, over every bank-ish host this suite knows about.
    for (const host of ['vietcombank-verify-login.tk', 'techcombank-otp-xacthuc.xyz', 'bidv-verify.duckdns.org', 'acb-phishing.com', 'momo-scam.xyz']) {
      const { risk, labels } = assess(host, productionProviderBaseline())
      expect(['MEDIUM', 'HIGH', 'CRITICAL'], host).toContain(risk.level)
      expect(labels, host).not.toContain('LIKELY_SAFE')
    }
  })

  it('the finding appears in the evidence report under its own category', () => {
    const { evidence } = assess('vietcombank-verify-login.tk', productionProviderBaseline())
    const item = evidence.items.find(i => i.finding === 'BRAND_IMPERSONATION')
    expect(item).toBeDefined()
    expect(item?.category).toBe('brand_impersonation')
    expect(item?.severity).toBe('critical')
    expect(item?.detail).toContain('vietcombank.com.vn')
  })

  it('an official domain is stated as verified rather than passed over in silence', () => {
    const { evidence } = assess('vietcombank.com.vn', productionProviderBaseline())
    const item = evidence.items.find(i => i.finding === 'OFFICIAL_DOMAIN')
    expect(item?.severity).toBe('safe')
  })

  it('a non-financial impersonation warns without over-claiming ON ITS OWN', () => {
    // Isolated from the provider baseline on purpose — this pins the DESIGN of the weight split.
    // A bank reaches HIGH unaided (60); an e-commerce brand reaches MEDIUM (40), because the
    // directory is VN-focused and an unlisted legitimate foreign storefront can land here, where
    // "proceed with caution" is right and "do not open" would not be.
    const { risk, labels } = assess('tiki-sale.xyz')
    expect(risk.score).toBe(40)
    expect(risk.level).toBe('MEDIUM')
    expect(labels).toContain('PROCEED_WITH_CAUTION')
    expect(labels).not.toContain('LIKELY_SAFE')
  })

  it('…and escalates to HIGH once real provider signals join it', () => {
    // 40 + the same 19 the live domains carried = 59. The signals compose; nothing special-cases
    // the category once it is in the score.
    const { risk, labels } = assess('tiki-sale.xyz', productionProviderBaseline())
    expect(risk.level).toBe('HIGH')
    expect(labels).toContain('DO_NOT_OPEN')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The guard must not have been bought by weakening the existing ones
// ─────────────────────────────────────────────────────────────────────────────
describe('the existing fail-closed behaviour is untouched', () => {
  it('confidence still measures only the NETWORK evidence base', () => {
    // 🚨 If `impersonation` were added to PROVIDER_MAX_WEIGHTS it would count on both sides of
    // the confidence ratio and inflate it, softening MIN_CONFIDENCE_FOR_SAFE on exactly the runs
    // where nothing else completed. Same providers, same confidence, with and without the signal.
    const providers = productionProviderBaseline()
    const withoutSignal = calculateRisk(providers)
    const withSignal = calculateRisk([...providers, impersonationSignal(classifyBrand('vietcombank-verify-login.tk', DIRECTORY))!])
    expect(withSignal.confidence).toBe(withoutSignal.confidence)
  })

  it('an unknown domain with no completed providers is still INCONCLUSIVE, not SAFE', () => {
    const dead: ProviderSignal[] = [
      { provider: 'whois', status: 'timeout', finding: 'ERROR', severity: 'info', weight: 0, detail: '' },
    ]
    expect(assess('some-random-blog.com', dead).risk.level).toBe('INCONCLUSIVE')
  })
})
