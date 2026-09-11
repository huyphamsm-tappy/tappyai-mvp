import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeMemoryPatch, MEMORY_FIELDS } from './memoryContract'
import { buildMemoryBlock } from './memoryService'
import type { UserMemory } from './memoryService'

// ─────────────────────────────────────────────────────────────────────────────
// discovery_city vs location_base — the semantic split.
//
//   location_base  = residence / usual area (where the user lives or usually is)
//   discovery_city = destination / discovery interest (a place they want to
//                    EXPLORE; NOT necessarily where they are)
//
// The two must coexist and NEVER be inferred from one another. These tests pin
// the deterministic parts of that guarantee: the write-boundary keeps the two
// fields independent, the chat context labels them distinctly, and the routes
// that touch either concept keep them apart. Extraction correctness itself is
// an LLM behaviour (prompt-defined) rather than a pure function, so it is
// guarded here at the contract + prompt-text level, not by calling the model.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..', '..')
const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const baseMemory = (over: Partial<UserMemory> = {}): UserMemory => ({
  location_base: null,
  discovery_city: null,
  preferences: {},
  budget: {},
  history: [],
  ...over,
})

describe('discovery_city is a first-class memory field', () => {
  it('is on the write allowlist alongside location_base', () => {
    expect(MEMORY_FIELDS).toContain('discovery_city')
    expect(MEMORY_FIELDS).toContain('location_base')
  })

  // Scenario 10 — security: the field follows the same canonical-materialisation
  // boundary as every other memory field; nothing outside the allowlist survives.
  it('is bounded like every other text field, and ownership keys still cannot ride in', () => {
    const out = sanitizeMemoryPatch({
      discovery_city: 'x'.repeat(500),
      user_id: 'attacker',
      trust: 'system',
    } as unknown)
    expect(typeof out.discovery_city).toBe('string')
    expect((out.discovery_city as string).length).toBeLessThanOrEqual(120)
    expect('user_id' in out).toBe(false)
    expect('trust' in out).toBe(false)
  })
})

describe('the two concepts never infer one another (write boundary)', () => {
  // Scenario 3 — a destination write leaves residence untouched.
  it('writing discovery_city does not touch location_base', () => {
    const out = sanitizeMemoryPatch({ discovery_city: 'Quy Nhơn' })
    expect(out.discovery_city).toBe('Quy Nhơn')
    expect('location_base' in out).toBe(false)
  })

  // Scenario 2 — a residence write leaves destination untouched.
  it('writing location_base does not touch discovery_city', () => {
    const out = sanitizeMemoryPatch({ location_base: 'Hà Nội' })
    expect(out.location_base).toBe('Hà Nội')
    expect('discovery_city' in out).toBe(false)
  })

  // Scenario 4 — both can be held at once, independently.
  it('both can coexist with distinct values', () => {
    const out = sanitizeMemoryPatch({ location_base: 'TP.HCM', discovery_city: 'Quy Nhơn' })
    expect(out.location_base).toBe('TP.HCM')
    expect(out.discovery_city).toBe('Quy Nhơn')
  })
})

describe('chat context labels the two distinctly (Scenario 5)', () => {
  it('shows discovery_city as an interest, explicitly not the current location', () => {
    const block = buildMemoryBlock(baseMemory({ location_base: 'TP.HCM', discovery_city: 'Quy Nhon' }))
    expect(block).toContain('TP.HCM')
    expect(block).toContain('Quy Nhon')
    // residence line and destination line are separate, and the destination
    // line states it is NOT where the user is.
    expect(block).toMatch(/thuong o[\s\S]*TP\.HCM/i)
    expect(block).toMatch(/Diem den[\s\S]*Quy Nhon/i)
    expect(block).toMatch(/KHONG phai noi dang o/i)
  })

  it('a destination alone is never rendered with a residence label', () => {
    const block = buildMemoryBlock(baseMemory({ discovery_city: 'Đà Nẵng' }))
    expect(block).toContain('Đà Nẵng')
    // the residence label must not appear when only a destination is known
    expect(block).not.toMatch(/thuong o.*Đà Nẵng/i)
  })
})

describe('the extractor is told the two are different (Scenario 2/3 prompt guard)', () => {
  const svc = src('src/lib/memory/memoryService.ts')
  it('defines discovery_city as a destination, not a residence', () => {
    expect(svc).toMatch(/"discovery_city":\s*"[^"]*KHAM PHA|"discovery_city":\s*"[^"]*DU LICH/i)
  })
  it('forbids cross-assigning the two fields', () => {
    expect(svc).toMatch(/KHONG suy ra cai nay tu cai kia|HAI KHAI NIEM KHAC NHAU/i)
  })
})

describe('onboarding writes discovery_city, never location_base (Scenario 1)', () => {
  const route = src('src/app/api/onboarding/route.ts')
  it('persists the onboarding city as discovery_city', () => {
    expect(route).toMatch(/discovery_city:\s*city/)
  })
  it('does not write the onboarding city into location_base', () => {
    expect(route).not.toMatch(/location_base:\s*city/)
  })
})

describe('morning brief never treats discovery_city as current location (Scenario 6)', () => {
  it('the morning-brief route makes no reference to discovery_city', () => {
    // It reads only location_base (residence) for its weather line; a
    // destination interest must never drive "today's weather".
    expect(src('src/app/api/cron/morning-brief/route.ts')).not.toContain('discovery_city')
  })
})

describe('weekly recap can use discovery_city for discovery framing (Scenario 7)', () => {
  it('prefers discovery_city for the exploration mention', () => {
    expect(src('src/app/api/cron/weekly-recap/route.ts')).toMatch(/discovery_city\s*\|\|/)
  })
})

describe('profile shows destination distinctly from residence (Scenario 8)', () => {
  const page = src('src/app/profile/tappy-knows/page.tsx')
  it('renders a destination card keyed to discovery_city with its own label', () => {
    expect(page).toContain('memory.card.destination')
    expect(page).toMatch(/memory\.discovery_city &&/)
  })
  it('keeps the residence card on its own area label', () => {
    expect(page).toContain('memory.card.area')
  })
})
