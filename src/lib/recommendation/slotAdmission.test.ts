import { describe, it, expect } from 'vitest'
import { askedSubjects, producerSubject, admitsProducer } from './slotAdmission'

// The production defect, in one line: a FLIGHT question rendered EIGHT HOTEL
// CARDS, under a sentence that said no places had been found. See the header of
// slotAdmission.ts for the full trace.

const FLIGHT_TURN = 'máy bay đi, bay từ sài gòn'

describe('P0 — a flight turn never yields a place card', () => {
  it('reproduces the UAT turn: stay is refused', () => {
    expect(admitsProducer(FLIGHT_TURN, 'stay')).toBe(false)
  })

  it('refuses every other place producer on that same turn', () => {
    for (const p of ['food', 'spa', 'entertainment', 'shopping', 'attraction', 'place'] as const) {
      expect(admitsProducer(FLIGHT_TURN, p)).toBe(false)
    }
  })

  it('the flight tool produces no card subject at all', () => {
    expect(producerSubject('get_flight_prices')).toBeNull()
    expect(producerSubject('get_weather')).toBeNull()
    expect(producerSubject('get_transport_options')).toBeNull()
    // …and a null producer can never claim the slot, whatever the turn said.
    expect(admitsProducer('bất kỳ câu nào', null)).toBe(false)
  })

  it('sees the flight subject and nothing place-shaped', () => {
    const asked = askedSubjects(FLIGHT_TURN)
    expect(asked.has('flight')).toBe(true)
    expect(asked.has('stay')).toBe(false)
    expect(asked.has('food')).toBe(false)
  })
})

describe('the four UAT place turns are untouched', () => {
  it.each([
    ['Quán bún bò ngon ở TP.HCM', 'food'],
    ['Trung tâm mua sắm lớn Sài Gòn', 'shopping'],
    ['spa làm dưỡng da mặt giá rẻ ở Sài Gòn', 'spa'],
    ['rạp chiếu phim IMAX Sài Gòn', 'entertainment'],
  ] as const)('%s admits its own producer', (text, producer) => {
    expect(admitsProducer(text, producer)).toBe(true)
  })

  it('a hotel question admits the stay producer', () => {
    expect(admitsProducer('khách sạn Đà Nẵng giá rẻ', 'stay')).toBe(true)
  })
})

describe('fail-open — an unrecognised turn behaves exactly as before', () => {
  it('admits everything when no subject is recognised', () => {
    for (const p of ['food', 'stay', 'shopping', 'place'] as const) {
      expect(admitsProducer('xyzzy qwerty', p)).toBe(true)
    }
  })

  it('an empty message admits everything', () => {
    expect(askedSubjects('').size).toBe(0)
    expect(admitsProducer('', 'stay')).toBe(true)
  })
})

describe('a trip plan legitimately asks for the composite', () => {
  const PLAN = 'lên kế hoạch chuyến đi Đà Nẵng 3 ngày 2 người ngân sách 5 triệu'

  it('admits hotels, restaurants and attractions', () => {
    for (const p of ['stay', 'food', 'attraction'] as const) {
      expect(admitsProducer(PLAN, p)).toBe(true)
    }
  })

  /**
   * 🔑 THE DISTINCTION THE WHOLE FIX RESTS ON. The screenshot's user asked about
   * a FLIGHT; the model decided on its own to write a plan. A plan the USER
   * asked for admits lodging. A plan the MODEL improvised does not make the
   * user's flight question into a lodging question.
   */
  it('but a bare flight question is not a plan, however the model answers it', () => {
    expect(admitsProducer(FLIGHT_TURN, 'stay')).toBe(false)
  })
})

describe('producerSubject reads the tool, never the row shape', () => {
  it('maps the place tool through the result’s own stated domain', () => {
    expect(producerSubject('search_places', 'food')).toBe('food')
    expect(producerSubject('search_places', 'spa')).toBe('spa')
    expect(producerSubject('search_places', 'entertainment')).toBe('entertainment')
    expect(producerSubject('search_places', 'shopping')).toBe('shopping')
  })

  it('carries an unclassified place through as `place`, never defaulted to food', () => {
    expect(producerSubject('search_places', 'place')).toBe('place')
    expect(producerSubject('search_places', undefined)).toBe('place')
  })

  it('maps the hotel and product tools', () => {
    expect(producerSubject('get_hotel_prices')).toBe('stay')
    expect(producerSubject('search_products')).toBe('shopping')
  })
})

describe('a generic `place` producer follows the turn, and never smuggles a hotel', () => {
  it('is admitted when the turn asked about any place-shaped subject', () => {
    expect(admitsProducer('quán cà phê view đẹp', 'place')).toBe(true)
    expect(admitsProducer('điểm tham quan Đà Nẵng', 'place')).toBe(true)
  })

  it('is NOT admitted on a pure lodging turn — a hotel must be asked for by name', () => {
    expect(admitsProducer('khách sạn Đà Nẵng giá rẻ', 'place')).toBe(false)
  })
})

describe('"ở Quận 1" is a district, not an eatery (CONSULTATIVE-40 E1, 2026-09-18)', () => {
  const t = 'Tối nay đi chơi gì với hội bạn 5 người ở Quận 1'
  it('an outing question admits the entertainment and attraction producers', () => {
    expect(admitsProducer(t, 'entertainment')).toBe(true)
    expect(admitsProducer(t, 'place')).toBe(true)
    expect(askedSubjects(t).has('food')).toBe(false)
  })
  it('"quán" without a number is still food', () => {
    expect(askedSubjects('quán nào ngon ở Quận 1').has('food')).toBe(true)
  })
})
