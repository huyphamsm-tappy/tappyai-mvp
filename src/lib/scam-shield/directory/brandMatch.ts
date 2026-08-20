import { domainToUnicode } from 'node:url'
import type { OfficialEntity } from '../types'
import { registrableDomain } from '../domain'

/**
 * Is this hostname the brand's own domain, or is it WEARING the brand's name?
 *
 * ============================================================================
 * WHY THIS EXISTS — B01
 * ============================================================================
 * `http://vietcombank-verify-login.tk/secure-otp` was scored 19 / LOW and shown to users as
 * "This link appears safe" — in production, live. So were `techcombank-otp-xacthuc.xyz/login`
 * and `bidv-verify.duckdns.org/otp`. The real `vietcombank.com.vn` scored 7. A bank-phishing
 * OTP page was twelve points away from the bank itself.
 *
 * The detection was never missing. `findMatchingBrand()` matched the brand and the result page
 * even printed "Official website: https://vietcombank.com.vn" beside the verdict — the system
 * knew the brand, knew the real domain, saw they differed, and used that only to render a
 * helpful link. The old matcher returned the SAME `OfficialEntity` whether the host WAS
 * vietcombank.com.vn or merely contained "vietcombank", with nothing to tell the two apart, and
 * `runCheck` looked the directory up AFTER `calculateRisk` had already finished. The signal was
 * computed and then thrown away.
 *
 * So this module answers the question the risk engine actually needs answered — which of the
 * three cases is it — and carries enough structured evidence for a deterministic scorer to act
 * on. `findMatchingBrand` stays as the display-facing wrapper; nothing about the "show me the
 * official site" behaviour changes.
 *
 * ============================================================================
 * WHY NOT A LIST OF BANK NAMES IN THE SCORER
 * ============================================================================
 * Because the next impersonated brand is always the one that is not on the list. Everything here
 * is derived from the Official Directory, so adding an entity to the directory automatically
 * protects it — no scorer change, no per-bank branch.
 */
export type BrandMatchKind = 'EXACT_OFFICIAL_MATCH' | 'BRAND_IMPERSONATION' | 'NO_MATCH'

export interface BrandMatch {
  kind: BrandMatchKind
  /**
   * The entity involved, for BOTH match kinds.
   *
   * 🚨 Deliberately still populated for BRAND_IMPERSONATION: the recommended actions want it, so
   * a user looking at a fake Vietcombank page is told where the real one is. `kind` is what
   * separates "this is them" from "this is pretending to be them" — the entity alone never did,
   * and that conflation is the whole of B01.
   */
  entity: OfficialEntity | null
  /** Structured evidence. Present only when `kind === 'BRAND_IMPERSONATION'`. */
  evidence?: {
    brand: string
    /** The part of the hostname that carried the brand name. */
    matchedIn: string
    /** How it carried it — exact label/token, a prefix, a suffix, or across a hyphen. */
    rule: 'token' | 'prefix' | 'suffix' | 'dehyphenated'
    /** eTLD+1 of the host being checked, so the report can contrast it with the real one. */
    registrable: string
    /** The domains that WOULD have been legitimate. */
    officialDomains: string[]
    /** The hostname used an IDN/punycode label — a homograph vector worth surfacing. */
    idn: boolean
  }
}

/** Lowercased, trailing dot removed, and IDN decoded so a punycode label cannot hide a brand. */
function normalizeHost(hostname: string): { host: string; idn: boolean } {
  const raw = hostname.trim().toLowerCase().replace(/\.$/, '')
  const idn = raw.split('.').some(l => l.startsWith('xn--'))
  if (!idn) return { host: raw, idn }
  try {
    // `vietcömbank.tk` reaches us as `xn--vietcmbank-p4a.tk`; matched as punycode it looks like
    // nothing at all. Decoding is what stops a homograph from walking straight past the check.
    const decoded = domainToUnicode(raw)
    return { host: decoded || raw, idn }
  } catch {
    return { host: raw, idn }
  }
}

/**
 * Strip a string to the letters and digits a domain can actually carry.
 *
 * 🚨 Applied to BOTH sides — the brand and the hostname — and it has to be. Folding only the
 * brand turns "Dịch vụ công" into "dichvucong" so it can match a domain, but leaves
 * `vietcömbank.tk` (decoded from `xn--vietcmbank-icb.tk`) unfolded, and "vietcömbank" matches no
 * brand. A homograph would then pass as NO_MATCH — the exact evasion the punycode decode above
 * was added to prevent.
 */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // "Dịch vụ công" → "dich vu cong"; "vietcömbank" → "vietcombank"
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

/** `Vietnam Airlines` → `vietnamairlines`. Matches how the brand is written in a domain. */
function brandSlug(brand: string): string {
  return fold(brand)
}

/**
 * The pieces of a hostname a brand name could be hiding in.
 *
 * Each DNS label contributes itself, its hyphen-separated tokens, and its de-hyphenated form —
 * the last one because `viet-combank.tk` is the same attack as `vietcombank.tk` with a hyphen
 * dropped in to break a naive substring check.
 */
function hostUnits(host: string): string[] {
  const units = new Set<string>()
  const add = (u: string) => {
    // Folded on the way in, so every comparison downstream is fold-vs-fold. `fold` also drops
    // hyphens, which is what makes `viet-combank` and `vietcombank` the same unit.
    const f = fold(u)
    if (f) units.add(f)
  }
  for (const label of host.split('.')) {
    if (!label) continue
    add(label)
    if (label.includes('-')) for (const token of label.split('-')) add(token)
  }
  return [...units]
}

/**
 * Does this hostname carry the brand name, and how?
 *
 * The rules are tiered by slug length, and that is the difference between a guard and a nuisance:
 *
 *   • exact token       — any slug ≥ 3. `acb-phishing.com` is caught, `beacba.com` is not.
 *                         The old matcher required ≥ 4 and so could not see ACB, VIB, SHB or MSB
 *                         impersonation AT ALL — its own test pinned `acb-phishing.com` → null.
 *   • token PREFIX      — slug ≥ 4. Catches `vietcombanklogin.tk`.
 *   • token SUFFIX      — slug ≥ 6 only. `mybidv…` is worth catching; a 4-letter suffix rule
 *                         would flag `kontiki-travel.com` over `tiki`, and a scam checker that
 *                         cries wolf on real sites gets ignored on the one that matters.
 */
function brandAppearsIn(units: string[], slug: string): { matchedIn: string; rule: 'token' | 'prefix' | 'suffix' | 'dehyphenated' } | null {
  if (slug.length < 3) return null
  for (const u of units) if (u === slug) return { matchedIn: u, rule: 'token' }
  if (slug.length >= 4) {
    for (const u of units) if (u.startsWith(slug)) return { matchedIn: u, rule: 'prefix' }
  }
  if (slug.length >= 6) {
    for (const u of units) if (u.endsWith(slug)) return { matchedIn: u, rule: 'suffix' }
  }
  return null
}

/** Is `host` the official domain itself, or a subdomain of it? */
function isOfficialHost(host: string, domains: string[]): boolean {
  return domains.some(d => {
    const official = d.toLowerCase()
    // `ibanking.vietcombank.com.vn` is the bank. The dot matters: `notvietcombank.com.vn` is not
    // a subdomain of `vietcombank.com.vn`, and `endsWith(official)` alone would say it was.
    return host === official || host.endsWith('.' + official)
  })
}

/**
 * Classify a hostname against the Official Directory.
 *
 * 🚨 ORDER IS LOAD-BEARING. Every entity is checked for an official-host match BEFORE any
 * impersonation check runs, across the WHOLE directory. `shopeepay.vn` contains "shopee", and
 * calling it impersonation because another entity's brand is a substring of its real domain
 * would be exactly the false positive that teaches users to ignore this feature.
 */
export function classifyBrand(hostname: string, directory: OfficialEntity[]): BrandMatch {
  const { host, idn } = normalizeHost(hostname)
  if (!host) return { kind: 'NO_MATCH', entity: null }

  for (const entity of directory) {
    if (isOfficialHost(host, entity.domains)) {
      return { kind: 'EXACT_OFFICIAL_MATCH', entity }
    }
  }

  const units = hostUnits(host)
  for (const entity of directory) {
    const hit = brandAppearsIn(units, brandSlug(entity.brand))
    if (hit) {
      return {
        kind: 'BRAND_IMPERSONATION',
        entity,
        evidence: {
          brand: entity.brand,
          matchedIn: hit.matchedIn,
          rule: hit.rule,
          registrable: registrableDomain(host),
          officialDomains: entity.domains,
          idn,
        },
      }
    }
  }

  return { kind: 'NO_MATCH', entity: null }
}
