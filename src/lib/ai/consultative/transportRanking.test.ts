import { describe, it, expect } from 'vitest'
import { normalizeTransport } from './candidate'
import { rankCandidates } from './rank'
import { derivePick, buildPickPayload } from './pick'
import { deriveNeedProfile } from './needProfile'
import type { NeedProfile } from './needProfile'

// ── TRANSPORT-NORM / FILTER / RANK / PICK / LINK / EVIDENCE / VI / EN / REFINE ──
//
// Transport becomes decision-capable for RIDE-HAILING only, using Grab's PUBLIC
// Farefeed contract (`POST /farefeed/v1/estimate`). That endpoint returns one
// entry per ride SERVICE — "JustGrab", "GrabShare", … — each with its own fare
// range, pickup ETA and deep link. Those are genuinely comparable alternatives
// with real evidence on both axes a rider decides on: price and wait.
//
// The fixtures below mirror the DOCUMENTED response shape field for field. They
// are not captured live: Grab partner credentials do not exist, so no live call
// has been made and none is claimed. What is proven here is the adapter contract
// and the ranking behaviour — the same footing Shopping stood on before its key.
//
// Still NOT covered by this, and not pretended to be: intercity bus and rail
// (Vexere has no public API) and public transit (no Vietnam coverage).

function profile(over: Partial<NeedProfile> = {}): NeedProfile {
  return {
    domain: 'transport', subject: 'transport', budget: null, budgetStated: null,
    location: { text: null, gps: null },
    useCases: [], priorities: [], mustHave: [], avoid: [],
    turnsObserved: 1, changedAtTurn: {},
    ...over,
  }
}
const prio = (key: string, weight = 2) => ({ key, weight, source: 'stated' as const })

/** Grab Farefeed response, documented shape, VND (Vietnam). */
const FAREFEED = {
  ride_estimates: [
    {
      serviceID: 601, serviceName: 'GrabBike',
      fare: { currency: 'VND', minFare: 32_000, maxFare: 38_000 },
      eta: 3,
      deepLink: 'https://grab.onelink.me/2695613898?pickup=x&dropoff=y&service=601',
      directDeepLink: 'grab://open?screenType=BOOKING&sourceID=tappyai&serviceID=601',
      surgeNotice: 'NONE',
      iconLink: 'https://assets.grab.com/bike.png',
    },
    {
      serviceID: 602, serviceName: 'JustGrab',
      fare: { currency: 'VND', minFare: 78_000, maxFare: 92_000 },
      eta: 6,
      deepLink: 'https://grab.onelink.me/2695613898?pickup=x&dropoff=y&service=602',
      surgeNotice: 'LOW_SURGE',
      iconLink: 'https://assets.grab.com/car.png',
    },
    {
      serviceID: 603, serviceName: 'GrabCar Plus',
      fare: { currency: 'VND', minFare: 105_000, maxFare: 121_000 },
      eta: 2,
      deepLink: 'https://grab.onelink.me/2695613898?pickup=x&dropoff=y&service=603',
      surgeNotice: 'NONE',
    },
  ],
}

describe('TRANSPORT-NORM-01 — documented provider response becomes common Candidates', () => {
  const c = normalizeTransport(FAREFEED)

  it('one candidate per ride service', () => {
    expect(c).toHaveLength(3)
    expect(c.map(x => x.name)).toEqual(['GrabBike', 'JustGrab', 'GrabCar Plus'])
  })

  it('carries the documented fare as a structured price', () => {
    expect(c[0].attrs.priceVnd).toBe(32_000)
    expect(c[1].attrs.priceVnd).toBe(78_000)
  })

  it('carries the pickup ETA as etaMinutes — never as journey duration', () => {
    expect(c[0].attrs.etaMinutes).toBe(3)
    // The field name is the guard: nothing downstream can read this as trip time.
    expect(c[0].attrs).not.toHaveProperty('durationMinutes')
  })

  it('the domain is transport', () => {
    for (const x of c) expect(x.domain).toBe('transport')
  })

  it('surge and icon ride through on raw, unmodified', () => {
    expect((c[1].raw as { surgeNotice: string }).surgeNotice).toBe('LOW_SURGE')
    expect((c[0].raw as { iconLink: string }).iconLink).toBe('https://assets.grab.com/bike.png')
  })

  it('never throws on malformed input', () => {
    for (const bad of [null, undefined, {}, { ride_estimates: null }, { ride_estimates: [{}] }, 'x', 9]) {
      expect(() => normalizeTransport(bad)).not.toThrow()
    }
  })
})

describe('TRANSPORT-NORM-02 — identity is retained', () => {
  const c = normalizeTransport(FAREFEED)

  it('identity comes from the provider serviceID', () => {
    expect(c[0].id).toBe('601')
    expect(new Set(c.map(x => x.id)).size).toBe(3)
  })

  it('a duplicate serviceID is collapsed, not double-counted', () => {
    const dup = normalizeTransport({ ride_estimates: [...FAREFEED.ride_estimates, FAREFEED.ride_estimates[0]] })
    expect(dup).toHaveLength(3)
  })

  it('a service with no name is dropped rather than emitted nameless', () => {
    const c2 = normalizeTransport({ ride_estimates: [{ serviceID: 9, serviceName: '', fare: { currency: 'VND', minFare: 1000 } }] })
    expect(c2).toHaveLength(0)
  })
})

describe('a non-VND fare is REFUSED, never read as VND', () => {
  // Grab's own documentation example shows "SGD". An SGD fare read as VND would
  // be wrong by orders of magnitude and would silently pass every budget check.
  const sgd = normalizeTransport({
    ride_estimates: [{ serviceID: 1, serviceName: 'JustGrab', fare: { currency: 'SGD', minFare: 12.5, maxFare: 15 }, eta: 4 }],
  })

  it('no price is set for a foreign currency', () => {
    expect(sgd[0].attrs.priceVnd).toBeUndefined()
  })

  it('but the candidate survives with its other real evidence', () => {
    expect(sgd[0].attrs.etaMinutes).toBe(4)
    expect(sgd[0].name).toBe('JustGrab')
  })
})

describe('TRANSPORT-FILTER-01/02 — budget', () => {
  const c = normalizeTransport(FAREFEED)

  it('FILTER-01: a known over-budget fare is removed', () => {
    const need = profile({ budget: { min: 0, max: 80_000, type: 'under' }, budgetStated: 80_000 })
    const r = rankCandidates(c, need)
    expect(r.ranked.map(x => x.candidate.name)).toEqual(expect.arrayContaining(['GrabBike', 'JustGrab']))
    expect(r.ranked.map(x => x.candidate.name)).not.toContain('GrabCar Plus')
    expect(r.filtered[0].filteredBy).toBe('budget')
  })

  it('FILTER-02: an unknown fare is NOT treated as over-budget', () => {
    const mixed = normalizeTransport({
      ride_estimates: [
        ...FAREFEED.ride_estimates,
        { serviceID: 604, serviceName: 'GrabRent', fare: { currency: 'SGD', minFare: 40 }, eta: 9 },
      ],
    })
    const need = profile({ budget: { min: 0, max: 80_000, type: 'under' }, budgetStated: 80_000 })
    expect(rankCandidates(mixed, need).ranked.map(x => x.candidate.name)).toContain('GrabRent')
  })

  it('when every fare is over budget, nothing survives and the reason is explicit', () => {
    const need = profile({ budget: { min: 0, max: 10_000, type: 'under' }, budgetStated: 10_000 })
    const r = rankCandidates(c, need)
    expect(r.ranked).toHaveLength(0)
    expect(r.budgetFilterEmpty).toBe(true)
  })
})

describe('TRANSPORT-RANK-01 — cheapest preference', () => {
  const c = normalizeTransport(FAREFEED)
  const need = profile({ priorities: [prio('price', 4)], budget: { min: 0, max: 150_000, type: 'under' }, budgetStated: 150_000 })

  it('the cheapest service leads', () => {
    expect(rankCandidates(c, need).ranked[0].candidate.name).toBe('GrabBike')
  })

  it('and names price as the deciding reason', () => {
    expect(rankCandidates(c, need).ranked[0].reasons.map(x => x.key)).toContain('price')
  })
})

describe('TRANSPORT-RANK-02 — fastest-pickup preference', () => {
  const c = normalizeTransport(FAREFEED)

  it('the shortest ETA leads when the user prioritises waiting', () => {
    const need = profile({ priorities: [prio('eta', 6)], budget: { min: 0, max: 150_000, type: 'under' }, budgetStated: 150_000 })
    expect(rankCandidates(c, need).ranked[0].candidate.name).toBe('GrabCar Plus')
  })

  it('cheapest and fastest genuinely disagree — the §14 proof for Transport', () => {
    const budget = { min: 0, max: 150_000, type: 'under' as const }
    const cheap = rankCandidates(c, profile({ priorities: [prio('price', 4)], budget, budgetStated: 150_000 })).ranked.map(x => x.candidate.name)
    const fast = rankCandidates(c, profile({ priorities: [prio('eta', 6)], budget, budgetStated: 150_000 })).ranked.map(x => x.candidate.name)
    expect(cheap[0]).not.toBe(fast[0])
  })

  it('a service with no ETA is not penalised, and the gap is recorded', () => {
    const noEta = normalizeTransport({
      ride_estimates: [
        { serviceID: 1, serviceName: 'Có ETA', fare: { currency: 'VND', minFare: 50_000 }, eta: 5 },
        { serviceID: 2, serviceName: 'Chưa Rõ', fare: { currency: 'VND', minFare: 50_000 } },
      ],
    })
    const r = rankCandidates(noEta, profile({ priorities: [prio('eta', 4)] }))
    expect(r.ranked).toHaveLength(2)
    const unknown = r.ranked.find(e => e.candidate.name === 'Chưa Rõ')!
    expect(unknown.missing).toContain('eta')
    expect(unknown.reasons.map(x => x.key)).not.toContain('eta')
  })
})

describe('TRANSPORT-RANK-04 — determinism', () => {
  const c = normalizeTransport(FAREFEED)
  const need = profile({ priorities: [prio('price')], budget: { min: 0, max: 150_000, type: 'under' }, budgetStated: 150_000 })

  it('identical inputs give byte-identical output, 50 runs', () => {
    const first = JSON.stringify(rankCandidates(c, need))
    for (let i = 0; i < 50; i++) expect(JSON.stringify(rankCandidates(c, need))).toBe(first)
  })

  it('input order does not decide the outcome', () => {
    expect(rankCandidates([...c].reverse(), need).ranked.map(x => x.candidate.name))
      .toEqual(rankCandidates(c, need).ranked.map(x => x.candidate.name))
  })
})

describe('TRANSPORT-EVIDENCE-01 — missing data never becomes invented data', () => {
  it('no candidate gains an attribute the provider never sent', () => {
    for (const x of normalizeTransport(FAREFEED)) {
      expect(x.attrs.rating).toBeUndefined()
      expect(x.attrs.distanceKm).toBeUndefined()
      expect(x.attrs.stars).toBeUndefined()
      expect(x.attrs.wifi).toBeUndefined()
    }
  })

  it('an entry with no fare and no eta yields an attribute-free candidate', () => {
    const bare = normalizeTransport({ ride_estimates: [{ serviceID: 7, serviceName: 'Chỉ Tên' }] })
    expect(bare[0].attrs).toEqual({})
    expect(bare[0].link).toBeNull()
  })

  it('an all-bare set is not rankable — provider order is not a decision', () => {
    const bare = normalizeTransport({
      ride_estimates: [{ serviceID: 1, serviceName: 'A' }, { serviceID: 2, serviceName: 'B' }],
    })
    expect(rankCandidates(bare, profile({ priorities: [prio('price')] })).rankable).toBe(false)
  })
})

describe('TRANSPORT-PICK-01/02 — the Pick', () => {
  const c = normalizeTransport(FAREFEED)
  const need = profile({ priorities: [prio('price', 4)], budget: { min: 0, max: 150_000, type: 'under' }, budgetStated: 150_000 })
  const r = rankCandidates(c, need)
  const pick = derivePick(r, need)!

  it('PICK-01: Pick = ranked[0] and is a real candidate', () => {
    expect(pick.candidate).toBe(r.ranked[0].candidate)
    expect(c).toContain(pick.candidate)
  })

  it('PICK-02: the Pick keeps its OWN fare, service identity and deep link', () => {
    expect(pick.candidate.name).toBe('GrabBike')
    expect(pick.candidate.attrs.priceVnd).toBe(32_000)
    expect(pick.candidate.link).toBe('grab://open?screenType=BOOKING&sourceID=tappyai&serviceID=601')
    expect(pick.candidate.id).toBe('601')
  })

  it('the payload names a real runner-up and quotes only real figures', () => {
    const payload = buildPickPayload(pick)
    expect(c.map(x => x.name)).toContain(payload.not_chosen)
    expect(JSON.stringify(payload)).not.toContain('http')
  })

  it('no Pick when only one service is returned', () => {
    const one = normalizeTransport({ ride_estimates: [FAREFEED.ride_estimates[0]] })
    expect(derivePick(rankCandidates(one, need), need)).toBeNull()
  })
})

describe('TRANSPORT-LINK-01 — no candidate-link cross-association', () => {
  const c = normalizeTransport(FAREFEED)

  it('each service keeps its own link under every reordering', () => {
    const byName = new Map(c.map(x => [x.name, x.link]))
    for (const need of [
      profile(),
      profile({ priorities: [prio('price', 5)] }),
      profile({ priorities: [prio('eta', 5)] }),
    ]) {
      for (const e of rankCandidates(c, need).ranked) {
        expect(e.candidate.link, `${e.candidate.name} link changed`).toBe(byName.get(e.candidate.name))
      }
    }
  })

  it('directDeepLink wins over deepLink, and neither is synthesised', () => {
    expect(c[0].link).toContain('serviceID=601')      // directDeepLink present
    expect(c[1].link).toContain('service=602')        // only deepLink present
    expect(c[2].link).toContain('service=603')
  })

  it('a service with no link at all gets null, never a borrowed one', () => {
    const noLink = normalizeTransport({
      ride_estimates: [
        { serviceID: 1, serviceName: 'Có Link', fare: { currency: 'VND', minFare: 1000 }, deepLink: 'https://grab/x' },
        { serviceID: 2, serviceName: 'Không Link', fare: { currency: 'VND', minFare: 2000 } },
      ],
    })
    expect(noLink.find(x => x.name === 'Không Link')!.link).toBeNull()
  })
})

describe('TRANSPORT-VI-01 / TRANSPORT-EN-01 — both languages drive the same decision', () => {
  const c = normalizeTransport(FAREFEED)

  it('VI: "rẻ nhất" style request ranks by price', () => {
    const need = deriveNeedProfile([{ role: 'user', content: 'Mình muốn đi xe giá rẻ từ Quận 1 về Quận 7' }])
    const r = rankCandidates(c, need)
    expect(r.ranked[0].candidate.name).toBe('GrabBike')
  })

  it('EN: the cheapest-first request ranks the same way', () => {
    const need = deriveNeedProfile([{ role: 'user', content: 'I want a cheap ride from District 1 to District 7' }])
    expect(rankCandidates(c, need).ranked[0].candidate.name).toBe('GrabBike')
  })

  it('VI and EN produce identical ordering from identical evidence', () => {
    const vi = deriveNeedProfile([{ role: 'user', content: 'Đi xe giá rẻ từ Quận 1 về Quận 7' }])
    const en = deriveNeedProfile([{ role: 'user', content: 'A cheap ride from District 1 to District 7' }])
    expect(rankCandidates(c, en).ranked.map(x => x.candidate.name))
      .toEqual(rankCandidates(c, vi).ranked.map(x => x.candidate.name))
  })
})

describe('TRANSPORT-REFINE-01 — a later turn changes the recommendation', () => {
  // A dedicated fixture where price and wait genuinely CONFLICT. In FAREFEED
  // above, GrabBike is both the cheapest and nearly the fastest, so it dominates
  // outright and no priority can move it — correct behaviour, but it proves
  // nothing about refinement. Here the cheap option makes you wait.
  const TRADEOFF = normalizeTransport({
    ride_estimates: [
      {
        serviceID: 601, serviceName: 'GrabBike',
        fare: { currency: 'VND', minFare: 30_000, maxFare: 36_000 }, eta: 14,
        deepLink: 'https://grab.onelink.me/x?service=601', surgeNotice: 'NONE',
      },
      {
        serviceID: 603, serviceName: 'GrabCar Plus',
        fare: { currency: 'VND', minFare: 110_000, maxFare: 128_000 }, eta: 2,
        deepLink: 'https://grab.onelink.me/x?service=603', surgeNotice: 'NONE',
      },
    ],
  })

  const turn1 = [{ role: 'user', content: 'Mình muốn đi xe giá rẻ từ Quận 1 về Quận 7' }]
  const turn3 = [
    ...turn1,
    { role: 'assistant', content: 'Đây là vài lựa chọn.' },
    { role: 'user', content: 'Ưu tiên xe tới nhanh nhất' },
  ]

  it('turn 1 — a price preference picks the cheap, slower ride', () => {
    expect(rankCandidates(TRADEOFF, deriveNeedProfile(turn1)).ranked[0].candidate.name).toBe('GrabBike')
  })

  it('turn 3 — refining to pickup speed moves the Pick', () => {
    const after = deriveNeedProfile(turn3)
    expect(after.priorities.map(p => p.key)).toContain('eta')
    expect(rankCandidates(TRADEOFF, after).ranked[0].candidate.name).toBe('GrabCar Plus')
  })

  it('the earlier price preference is not lost, only outweighed', () => {
    const after = deriveNeedProfile(turn3)
    expect(after.priorities.map(p => p.key)).toContain('price')
  })

  it('the Pick and its deep link move together', () => {
    const after = deriveNeedProfile(turn3)
    const pick = derivePick(rankCandidates(TRADEOFF, after), after)!
    expect(pick.candidate.name).toBe('GrabCar Plus')
    expect(pick.candidate.link).toBe('https://grab.onelink.me/x?service=603')
  })

  it('the EN equivalent refines the same way', () => {
    const en = deriveNeedProfile([
      { role: 'user', content: 'I want a cheap ride from District 1 to District 7' },
      { role: 'assistant', content: 'Here are some options.' },
      { role: 'user', content: 'Actually prioritise the shortest wait' },
    ])
    expect(rankCandidates(TRADEOFF, en).ranked[0].candidate.name).toBe('GrabCar Plus')
  })
})
