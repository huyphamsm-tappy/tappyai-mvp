import { describe, it, expect } from 'vitest'
import { classifyBrand } from './brandMatch'
import { officialDirectory } from './officialDirectory'
import type { OfficialEntity } from '../types'

/**
 * C09 — a bank's ABBREVIATION is impersonated more often than its full name.
 *
 * The B01 fix taught the matcher to notice a brand name worn by a hostile host, but it derived its
 * only token from `entity.brand`. In Vietnam nobody writes "vietcombank" in a phishing domain —
 * they write "vcb", which is what the bank's own app is called (VCB Digibank). Measured before
 * this fix, against the live seed directory:
 *
 *     vietcombank-online.com        BRAND_IMPERSONATION(Vietcombank)   ✅
 *     vcb-secure-login.net          NO_MATCH                           ❌  scored 19 / LOW
 *     vcbdigibank-login.com         NO_MATCH                           ❌
 *     tcb-verify.duckdns.org        NO_MATCH                           ❌
 *     stb-otp.top / vtb-login.xyz   NO_MATCH                           ❌
 *
 * 19/LOW is the exact number B01 was raised about.
 */

let DIRECTORY: OfficialEntity[]
const load = async () => (DIRECTORY ??= await officialDirectory.getAll())

describe('C09 — abbreviations are recognised as the brand', () => {
  const IMPERSONATIONS: [host: string, expectedBrand: string][] = [
    ['vcb-secure-login.net', 'Vietcombank'],
    ['vcb-otp-xacthuc.xyz', 'Vietcombank'],
    ['vcbdigibank-login.com', 'Vietcombank'],
    ['tcb-verify.duckdns.org', 'Techcombank'],
    ['stb-otp.top', 'Sacombank'],
    ['vtb-login.xyz', 'VietinBank'],
    ['agr-verify.icu', 'Agribank'],
    ['tpb-xacthuc.top', 'TPBank'],
    ['mbb-otp.xyz', 'MBBank'],
  ]

  it.each(IMPERSONATIONS)('%s is impersonating %s', async (host, brand) => {
    const match = classifyBrand(host, await load())
    expect(match.kind, `${host} must not be NO_MATCH`).toBe('BRAND_IMPERSONATION')
    expect(match.entity?.brand).toBe(brand)
  })

  it('still catches the full-name variants the B01 fix added', async () => {
    for (const host of ['vietcombank-online.com', 'techcombank-verify.duckdns.org', 'sacombank-otp.top']) {
      expect(classifyBrand(host, await load()).kind).toBe('BRAND_IMPERSONATION')
    }
  })
})

describe('C09 — the real banks are still recognised as themselves', () => {
  /**
   * 🚨 The half of this that can do damage. An alias that swallows a legitimate host would turn
   * the bank's own site into "impersonation" and train people to ignore the warning.
   */
  const OFFICIAL = [
    'vietcombank.com.vn', 'techcombank.com.vn', 'sacombank.com.vn', 'agribank.com.vn',
    'vietinbank.vn', 'tpb.vn', 'mbbank.com.vn', 'momo.vn', 'zalopay.vn', 'viettel.vn',
    'vietnamairlines.com', 'vietjetair.com', 'bidv.com.vn', 'acb.com.vn',
  ]

  it.each(OFFICIAL)('%s is an exact official match', async (host) => {
    expect(classifyBrand(host, await load()).kind).toBe('EXACT_OFFICIAL_MATCH')
  })
})

describe('C09 — an alias cannot swallow unrelated hosts', () => {
  /**
   * Short aliases are the risk: a 3-letter token matched by prefix would flag half the internet.
   * `brandAppearsIn` only allows a prefix match at 4+ characters and a suffix match at 6+, so a
   * 3-letter alias must match a whole token — these hosts prove that boundary holds.
   */
  const UNRELATED = [
    'stackoverflow.com',
    'github.com',
    'mbappe-fanclub.net',               // starts with "mb" — must not match the MB alias
    'vtbc-media.org',                   // "vtbc" is not "vtb"
    // 🚨 These three caught a real over-match in the FIRST version of this fix. `brandAppearsIn`
    // allows a PREFIX match from 4 characters, so the 4-letter aliases 'Agri', 'Digibank' and
    // 'iPay' turned every agriculture, digital-banking and payments host into "bank phishing".
    // Only 3-letter abbreviations (token-match only) and specific multi-word names survive.
    'agriculture-news.vn',
    'digibanking-conference.org',
    'ipayment-gateway.co',
  ]

  it.each(UNRELATED)('%s is not treated as a bank', async (host) => {
    expect(classifyBrand(host, await load()).kind).toBe('NO_MATCH')
  })
})

describe('C09 — the directory declares aliases as data, not code', () => {
  it('every alias is a non-empty string and never duplicates its own brand', async () => {
    for (const e of await load()) {
      for (const alias of e.aliases ?? []) {
        expect(alias.trim().length, `${e.brand} has a blank alias`).toBeGreaterThan(0)
        expect(alias.toLowerCase()).not.toBe(e.brand.toLowerCase())
      }
    }
  })

  it('the banks most impersonated in Vietnam all carry an abbreviation', async () => {
    // A regression here means someone added a bank without the name it will be attacked under.
    const needAlias = ['Vietcombank', 'Techcombank', 'Sacombank', 'Agribank', 'VietinBank', 'TPBank', 'MBBank']
    for (const brand of needAlias) {
      const entity = (await load()).find((e) => e.brand === brand)
      expect(entity, `${brand} missing from the directory`).toBeDefined()
      expect(entity!.aliases?.length, `${brand} has no aliases`).toBeGreaterThan(0)
    }
  })
})

describe('W5 — one-character lookalike domains are caught', () => {
  /**
   * Measured before this rule existed: `vietcombamk.com.vn` scored 14 / LOW with the
   * recommended action "This link appears safe". One substituted letter is the classic
   * bank-phishing domain and no substring rule can see it.
   */
  const LOOKALIKES: [host: string, brand: string][] = [
    ['vietcombamk.com.vn', 'Vietcombank'],   // substitution  n → m
    ['vietcombak.com.vn', 'Vietcombank'],    // deletion      n
    ['vietcombannk.com.vn', 'Vietcombank'],  // insertion     n
    ['vietcombnak.com.vn', 'Vietcombank'],   // transposition an → na
    ['sacombamk-otp.top', 'Sacombank'],
    ['techcombamk.vn', 'Techcombank'],
  ]

  it.each(LOOKALIKES)('%s is impersonating %s', async (host, brand) => {
    const m = classifyBrand(host, await load())
    expect(m.kind).toBe('BRAND_IMPERSONATION')
    expect(m.entity?.brand).toBe(brand)
    expect(m.evidence?.rule).toBe('lookalike')
  })

  it('two characters off is NOT a lookalike — that is where false positives begin', async () => {
    for (const host of ['vietcombxmk.com.vn', 'saxombxnk.top']) {
      expect(classifyBrand(host, await load()).kind).toBe('NO_MATCH')
    }
  })

  it('the real domains are still exact matches, not lookalikes of themselves', async () => {
    for (const host of ['vietcombank.com.vn', 'sacombank.com.vn', 'techcombank.com.vn']) {
      expect(classifyBrand(host, await load()).kind).toBe('EXACT_OFFICIAL_MATCH')
    }
  })

  it('short brands never fuzzy-match — only 6+ characters are eligible', async () => {
    // 'acb' one edit from 'aca', 'shb' from 'shbx', 'msb' from 'msbb' — if three-letter brands were
    // fuzzy-eligible these would all be flagged, which is why the rule requires 6+ characters.
    //
    // 🚨 `vib-x.org` is deliberately NOT in this list. It IS flagged, but by the pre-existing
    // exact-token rule ('vib' is a whole hyphen-separated unit), not by anything added here.
    // Putting it here would have made this test claim something it does not test.
    for (const host of ['aca-news.com', 'shbx.net', 'msbb.io']) {
      expect(classifyBrand(host, await load()).kind).toBe('NO_MATCH')
    }
  })

  it('a one-edit bank name is flagged even when the rest of the host looks innocuous', async () => {
    // `vcbank…` is one substitution from VPBank — and reads as "VCBank" to a Vietnamese user.
    // This was in the NEGATIVE list while writing the fix; the rule catching it is correct, and
    // recording that here is more useful than an assertion that quietly asserted the old gap.
    const m = classifyBrand('vcbank-example-unrelated.com.au', await load())
    expect(m.kind).toBe('BRAND_IMPERSONATION')
    expect(m.evidence?.rule).toBe('lookalike')
  })
})
