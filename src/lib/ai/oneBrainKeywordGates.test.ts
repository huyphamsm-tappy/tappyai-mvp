import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createEnrichmentCollector } from './toolResultSplit'

// Review 30/10: on the one-brain route the model reads the whole conversation and chooses its tools; three code gates still read the
// user's words with keyword lists and overrode it:
//   · card admission - a hotel card set was admitted only when the user had typed a hotel word ("chỗ ngủ gần biển" → no cards);
//   · place constraints - rows were dropped by "đang mở / dưới …k / không muốn nhà hàng / quận …" read from the text;
//   · the plan card's "ăn chay" reading turned retrieved restaurants into meal slots.
// On one brain: the tool the model called decides the cards; rows are not dropped by a keyword reading; no vegetarian keyword gate.

const REC = [{ name: 'Khách sạn Biển Xanh', place_id: 'h1' }] as never

describe('one brain · card admission follows the tool the model called', () => {
  // a trip question with no hotel word: on the old route the hotel producer is refused (probed 30/10: admitsProducer('đi Đà Lạt chơi gì', 'stay') = false)
  const Q = 'đi Đà Lạt chơi gì'
  it('a hotel card set the model searched for is admitted though the user typed no hotel word', () => {
    const c = createEnrichmentCollector(Q)
    c.oneBrain = true
    c.setPlacesRecommendations(REC, 'stay')
    expect(c.placesRecommendations).toEqual(REC)
  })
  it('other routes: unchanged - the hotel producer still needs a hotel word', () => {
    const c = createEnrichmentCollector(Q)
    c.setPlacesRecommendations(REC, 'stay')
    expect(c.placesRecommendations).toBeUndefined()
  })
})

describe('one brain · no keyword constraint filter, no vegetarian keyword gate (wiring, read from the source)', () => {
  const route = readFileSync(join(__dirname, '../../app/api/chat/route.ts'), 'utf8')
  const stream = readFileSync(join(__dirname, 'streamEnrichment.ts'), 'utf8')
  it('the place constraints read from the user\'s words are empty on one brain', () => {
    expect(route).toContain('const constraints = oneBrain ? NO_PLACE_CONSTRAINTS : {')
  })
  it('the plan card gets no vegetarian reading on one brain', () => {
    expect(stream).toContain('vegetarian: collector?.oneBrain === true ? false : wantsVegetarian(')
  })
})
