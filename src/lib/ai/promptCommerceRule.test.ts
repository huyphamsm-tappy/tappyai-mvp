import { describe, it, expect } from 'vitest'
import { buildSystem } from './promptBuilder'
import { PROVIDER_REGISTRY } from '@/lib/ccp'

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

  it('spells no CCP merchant host anywhere in the system prompt', () => {
    const hosts = PROVIDER_REGISTRY.filter(e => e.tier === 'mvp').flatMap(e => e.allowedHosts)
    for (const h of hosts) expect(text.toLowerCase(), h).not.toContain(h.replace(/^www\./, ''))
  })

  it('rule 18 (the legacy search allow-list) is intact', () => {
    expect(text).toContain('18) CHI DUNG LINK TU CAC NEN TANG CHINH THUC')
  })
})
