import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyHardConstraintGate } from './hardConstraintGate'
import { deriveSituation } from './situationFrame'
import { deriveShoppingConstraints } from './shoppingConstraints'

// Q11–Q13 (29/10): the code told the model "say in ONE sentence that you could not confirm it" the moment the
// MAPS ROWS lacked a field - before the model had read a single review page. Rows are thin; the web is not.
// In one brain the note now says: the rows carry nothing, THAT IS NOT AN ANSWER - look it up first.

const need = () => ({ budget: null as never, location: { text: null, gps: null } })
afterEach(() => vi.restoreAllMocks())

describe('one brain: a gap in the rows is a reason to look, not a script to say "unconfirmed"', () => {
  const situation = () => deriveSituation(['Resort Phú Quốc cho kỷ niệm 1 năm, sang chút'], need())
  const rows = () => ({ hotel_list: [{ name: 'Rio Guest House Phú Quốc', place_types: ['Khách sạn'] }] })

  it('default (legacy) note is unchanged: still tells the model to say it could not confirm', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const r: Record<string, unknown> = rows()
    applyHardConstraintGate('get_hotel_prices', r, situation(), 'vi')
    expect(String(r._tappy_evidence_note)).toContain('chua xac nhan')
  })

  it('verifyFirst: the note asks for a lookup and no longer scripts the "unconfirmed" sentence', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const r: Record<string, unknown> = rows()
    applyHardConstraintGate('get_hotel_prices', r, situation(), 'vi', { verifyFirst: true })
    const note = String(r._tappy_evidence_note)
    expect(note).toContain('web_search')
    expect(note).toContain('read_page')
    expect(note).not.toContain('chua xac nhan')
    expect(note).not.toContain('KHONG khang dinh co')
    expect(r._tappy_hard_gaps).toEqual(['upscale'])
  })

  it('verifyFirst, English', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const r: Record<string, unknown> = rows()
    applyHardConstraintGate('get_hotel_prices', r, situation(), 'en', { verifyFirst: true })
    const note = String(r._tappy_evidence_note)
    expect(note).toContain('web_search')
    expect(note).not.toContain('could not confirm')
  })

  it('verifyFirst keeps the guard that protects the user: "only these rows carry evidence" stays', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const sit = deriveSituation(['quán cafe mở khuya yên tĩnh'], need())
    const r: Record<string, unknown> = { results: [{ title: 'A Cafe', opening_hours: '10:00–02:00' }, { title: 'B Cafe', opening_hours: '08:00–18:00' }] }
    applyHardConstraintGate('search_places', r, sit, 'vi', { verifyFirst: true })
    expect(String(r._tappy_evidence_note)).toContain('A Cafe')
  })

  it('shopping rows: same rule', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const k = deriveShoppingConstraints([{ role: 'user', content: 'Mua giày Nike size 42 còn hàng không' }] as never, null)
    const legacy: Record<string, unknown> = { search_results: [{ title: 'Giày chạy bộ Adidas Duramo', price: 1500000 }] }
    applyHardConstraintGate('search_products', legacy, null, 'vi', { shopping: k })
    expect(String(legacy._tappy_evidence_note)).toContain('chua xac nhan')
    const r: Record<string, unknown> = { search_results: [{ title: 'Giày chạy bộ Adidas Duramo', price: 1500000 }] }
    applyHardConstraintGate('search_products', r, null, 'vi', { shopping: k, verifyFirst: true })
    expect(String(r._tappy_evidence_note)).toContain('web_search')
    expect(String(r._tappy_evidence_note)).not.toContain('chua xac nhan')
  })
})

describe('the route wires it for one brain only', () => {
  it('route.ts passes verifyFirst: oneBrain to the gate', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(src).toContain('{ shopping: shoppingConstraints, verifyFirst: oneBrain }')
  })
})
