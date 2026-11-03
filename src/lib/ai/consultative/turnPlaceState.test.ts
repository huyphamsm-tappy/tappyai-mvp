import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTurnPlaceOwner } from './turnPlaceState'

// Review 30/10 (one brain, several place searches in one step): the turn's place state was written by whichever call finished last
// (pick, location, maps link, saved candidates) while the cards kept the FIRST non-empty set - so a cafe search with no rows could
// leave a hotpot card set under the cafe search's maps link and save an empty candidate list for "xem thêm".
describe('createTurnPlaceOwner', () => {
  it('the first search WITH rows owns the turn state; a later one does not overwrite it', () => {
    const o = createTurnPlaceOwner(true)
    expect(o.mayWrite(2)).toBe(true)
    expect(o.mayWrite(0)).toBe(false)
    expect(o.mayWrite(5)).toBe(false)
  })
  it('empty searches may write until one with rows comes, which then owns it', () => {
    const o = createTurnPlaceOwner(true)
    expect(o.mayWrite(0)).toBe(true)
    expect(o.mayWrite(0)).toBe(true)
    expect(o.mayWrite(3)).toBe(true)
    expect(o.mayWrite(0)).toBe(false)
  })
  it('off (every other route): every call writes, as before', () => {
    const o = createTurnPlaceOwner(false)
    expect([o.mayWrite(2), o.mayWrite(0), o.mayWrite(1)]).toEqual([true, true, true])
  })
  it('the route asks it once per search_places call, on one brain, before writing the turn state (wiring)', () => {
    const src = readFileSync(join(__dirname, '../../../app/api/chat/route.ts'), 'utf8')
    expect(src).toContain('const placeOwner = createTurnPlaceOwner(oneBrain)')
    expect(src).toContain('const ownsPlaceState = placeOwner.mayWrite(Array.isArray(rankedRows) ? rankedRows.length : 0)')
    expect(src).toContain('if (pick && ownsPlaceState) turnPick = pick')
    expect(src).toContain('if (ownsPlaceState) turnPlaceLocation = location')
    expect(src).toContain('if (ownsPlaceState) enrichment.setPlacesMapsUrl(')
  })
})
