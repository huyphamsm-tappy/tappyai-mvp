import { describe, it, expect } from 'vitest'
import { buildSystem } from './promptBuilder'
import { PROVIDER_REGISTRY } from '@/lib/ccp'
import { registrySearchPrefixes } from '@/lib/platformLinks/ccpShim'
import { marketplaceSearchTemplates, searchTemplates } from '@/lib/ccp/adapters'

// ── Rule 18a: merchant deep links are the platform's, never the model's ──────
//
// With SERVER_AUTHORED_CTA off the model still writes its own [CTA_BUTTONS]
// from search templates. What Phase 6 adds is the boundary for the merchants
// CCP transacts with: the prompt names the capability (`has_direct_handoff`),
// forbids composing a merchant URL, and — because the hosts are registry data
// — never spells a CCP merchant host itself.

const system = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)
const text = `${system.shared}\n${system.dynamic}`

describe('prompt rule 18a', () => {
  it('teaches the capability and forbids model-authored merchant URLs', () => {
    expect(text).toContain('18a)')
    expect(text).toContain("'has_direct_handoff'")
    expect(text).toMatch(/KHONG tu viet URL cho merchant/)
  })

  it('spells no CCP merchant host anywhere in the system prompt, beyond the registry search templates it projects', () => {
    // The marketplaces' declared SEARCH grammars are projected into the CTA template from the registry
    // (owner decision 14 Sep 2026) — remove those instances, then nothing on a CCP host may remain.
    let stripped = text
    for (const p of registrySearchPrefixes()) stripped = stripped.split(p).join('')
    // A merchant NAME that is spelled like its host ("Booking.com", "Trip.com") may be named; only URLs may not.
    for (const e of PROVIDER_REGISTRY) stripped = stripped.replace(new RegExp(e.merchantName.replace(/./g, '\.'), 'gi'), '')
    // www.tiktok.com is shared with TikTok REVIEWS: the prompt names it only in rule 18b's prohibition on
    // composing review URLs (pre-dating the marketplace). The commerce host, shop.tiktok.com, must not appear.
    const hosts = PROVIDER_REGISTRY.filter(e => e.tier === 'mvp').flatMap(e => e.allowedHosts).filter(h => h !== 'www.tiktok.com')
    for (const h of hosts) expect(stripped.toLowerCase(), h).not.toContain(h.replace(/^www\./, ''))
    expect(stripped.toLowerCase()).not.toContain('shop.tiktok.com')
    // …and the templates the prompt projects (marketplaces + the Booking.com results page) are present
    // exactly as the registry declares them. Agoda / Vexere front doors and the Ticketbox search are
    // never model buttons: those merchants' links come from the system (Commerce Links / tool fields).
    const projected = [...marketplaceSearchTemplates(), ...searchTemplates().filter(s => s.providerId === 'booking')]
    for (const s of projected) expect(text).toContain(s.template.slice(0, s.template.indexOf('{q}')))
    for (const id of ['agoda', 'vexere', 'ticketbox']) expect(text).not.toContain(searchTemplates().find(s => s.providerId === id)!.template.replace('{q}', ''))
    expect(text).not.toContain('tiki.vn')
  })

  it('rule 18 (the legacy search allow-list) is intact', () => {
    expect(text).toContain('18) CHI DUNG LINK TU CAC NEN TANG CHINH THUC')
  })
})
