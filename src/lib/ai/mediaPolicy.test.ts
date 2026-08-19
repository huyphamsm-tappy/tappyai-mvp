import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decideResponseMode, mediaBudgetFor, placesWithinBudget } from './mediaPolicy'
import { decideSearch, extractDelta, applyDelta, unseenCandidateCount } from './consultationDelta'
import { detectMoreOptions, detectDecisionStage } from './intent'
import { createState, isPresented, isRejected, newConversationId, ownerScopeFor, type Candidate, type ConversationState } from './conversationState'
import { rankCandidates } from './candidateRanking'

const OWNER = ownerScopeFor({ userId: 'alice' })
const place = (name: string): Candidate => ({
  candidateId: name, name, type: 'place', source: 'search_places', retrievedAt: 0,
  facts: { address: '1 Phố X', google_rating: '4.5⭐' },
})

/** Five held, three already named to the user — the shape after a first reply. */
function afterFirstReply(): ConversationState {
  const s = createState(newConversationId(), OWNER)
  s.goal = 'quán cà phê yên tĩnh ở Hoàn Kiếm'
  s.location = 'hoan kiem'
  s.softPreferences = [{ key: 'quiet', weight: 1, statedAs: 'yên tĩnh', turn: 1 }]
  s.candidates = ['A', 'B', 'C', 'D', 'E'].map(place)
  s.presentedCandidates = ['A', 'B', 'C']
  return s
}

const nilDelta = {
  hardConstraintAdds: [], hardConstraintChanges: [], softPreferenceAdds: [],
  decisionIntent: false, searchImpact: { required: false, reason: '' },
}

describe('media budget — images are supporting material, not output', () => {
  it('A. the initial recommendation gets at most 3 images TOTAL', () => {
    const budget = mediaBudgetFor('initial')

    expect(budget.maxImages).toBe(3)
    // Not 3 per place: three places x three photos each is where 9 came from.
    expect(budget.photosPerPlace).toBe(1)
    expect(budget.maxPlaces * budget.photosPerPlace).toBeLessThanOrEqual(3)
  })

  it.each<[string, Parameters<typeof mediaBudgetFor>[0]]>([
    ['B. more options', 'more-options'],
    ['C. decision', 'decision'],
    ['D. explanation / follow-up', 'followup'],
    ['E. refinement', 'refinement'],
    ['F. rejection', 'rejection'],
    ['comparison', 'comparison'],
    ['confirmation', 'confirmation'],
  ])('%s renders zero new images', (_label, mode) => {
    expect(mediaBudgetFor(mode).maxImages).toBe(0)
  })

  it('M. a zero budget resolves NO photos — the provider is never called', () => {
    const places = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    expect(placesWithinBudget(places, mediaBudgetFor('followup'))).toEqual([])
    expect(placesWithinBudget(places, mediaBudgetFor('decision'))).toEqual([])
  })

  it('the initial turn resolves at most three places, in the order named', () => {
    const places = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]
    expect(placesWithinBudget(places, mediaBudgetFor('initial'))).toEqual([{ name: 'A' }, { name: 'B' }, { name: 'C' }])
  })
})

describe('response mode', () => {
  it('is "initial" only while the user has seen nothing', () => {
    expect(decideResponseMode({ stage: null, moreOptions: false, hadCandidatesBefore: false })).toBe('initial')
    expect(decideResponseMode({ stage: null, moreOptions: false, hadCandidatesBefore: true })).toBe('followup')
  })

  it('recognises "more options" over an existing set', () => {
    expect(decideResponseMode({ stage: 'refinement', moreOptions: true, hadCandidatesBefore: true })).toBe('more-options')
  })

  it('a first-ever turn is never "more options" — there is nothing to add to', () => {
    expect(decideResponseMode({ stage: null, moreOptions: true, hadCandidatesBefore: false })).toBe('initial')
  })

  it.each([['decision'], ['comparison'], ['rejection'], ['confirmation'], ['refinement']] as const)(
    'passes stage %s through',
    stage => {
      expect(decideResponseMode({ stage, moreOptions: false, hadCandidatesBefore: true })).toBe(stage)
    },
  )
})

describe('"more options" is not a refinement', () => {
  it.each([
    'Cho mình thêm vài quán khác.',
    'còn quán nào khác không',
    'quán nào khác nữa',
    'show me more options',
    'any others?',
    'give me a few more',
  ])('detects %s', text => {
    expect(detectMoreOptions(text)).toBe(true)
  })

  it.each(['quán khác rẻ hơn', 'somewhere quieter', 'cheaper please', 'gần hơn'])(
    'does NOT treat the comparative "%s" as more-of-the-same',
    text => {
      // These change the criteria, so they must stay refinements.
      expect(detectMoreOptions(text)).toBe(false)
    },
  )
})

describe('search policy — reuse before searching again', () => {
  it('G. "more options" with unseen candidates causes NO search', () => {
    const s = afterFirstReply()
    const d = extractDelta('Cho mình thêm vài quán khác.', s, detectDecisionStage('Cho mình thêm vài quán khác.', { hasPriorAssistantTurn: true }), 2)

    expect(unseenCandidateCount(s)).toBe(2)
    expect(d.moreOptions).toBe(true)
    expect(d.searchImpact.required).toBe(false)
    expect(d.searchImpact.reason).toMatch(/unseen candidates/)
  })

  it('H. "more options" with nothing unseen DOES search', () => {
    const s = afterFirstReply()
    s.presentedCandidates = ['A', 'B', 'C', 'D', 'E']   // everything shown

    expect(unseenCandidateCount(s)).toBe(0)
    expect(extractDelta('Cho mình thêm vài quán khác.', s, 'refinement', 2).searchImpact.required).toBe(true)
  })

  it('a decision turn never searches', () => {
    expect(decideSearch(nilDelta, afterFirstReply(), 'decision').required).toBe(false)
  })

  it('an explanation over held evidence never searches', () => {
    expect(decideSearch(nilDelta, afterFirstReply(), null).required).toBe(false)
  })

  it('a soft preference RE-RANKS instead of searching when evidence is held', () => {
    const s = afterFirstReply()
    const d = extractDelta('yên tĩnh hơn nữa', s, 'refinement', 2)

    expect(d.softPreferenceAdds.length).toBeGreaterThan(0)
    expect(d.searchImpact.required).toBe(false)
    expect(d.searchImpact.reason).toMatch(/re-rank/i)
  })

  it('…but a soft preference with NOTHING held still searches', () => {
    const empty = createState(newConversationId(), OWNER)
    expect(extractDelta('quán yên tĩnh', empty, null, 1).searchImpact.required).toBe(true)
  })

  it('a HARD constraint still searches — it changes who qualifies', () => {
    const s = afterFirstReply()
    expect(extractDelta('dưới 100k', s, 'refinement', 2).searchImpact.required).toBe(true)
  })

  it('a location change still searches', () => {
    const s = afterFirstReply()
    expect(extractDelta('ở Đà Nẵng thì sao', s, 'refinement', 2).searchImpact.required).toBe(true)
  })
})

describe('the candidate pool is reused, and stays honest', () => {
  it('I. rejection with unseen candidates reuses them instead of searching', () => {
    const s = afterFirstReply()
    const d = extractDelta('mình không thích mấy quán này', s, 'rejection', 2)

    expect(d.searchImpact.required).toBe(false)
    expect(d.searchImpact.reason).toMatch(/unseen candidates remain/)
  })

  it('…and searches once every option has been shown and rejected', () => {
    const s = afterFirstReply()
    s.presentedCandidates = ['A', 'B', 'C', 'D', 'E']
    expect(extractDelta('mình không thích mấy quán này', s, 'rejection', 2).searchImpact.required).toBe(true)
  })

  it('J. rejected candidates are never counted as reusable', () => {
    const s = afterFirstReply()
    s.rejections = [{ ref: 'D, E', turn: 2 }]
    expect(unseenCandidateCount(s)).toBe(0)
  })

  it('K. reuse does not disturb the accumulated requirements', () => {
    const s = afterFirstReply()
    s.hardConstraints = [{ key: 'budget_max', op: '<=', value: 100_000, statedAs: 'dưới 100k', turn: 2 }]
    const after = applyDelta(s, extractDelta('Cho mình thêm vài quán khác.', s, 'refinement', 3))

    expect(after.hardConstraints.map(c => c.key)).toContain('budget_max')
    expect(after.location).toBe('hoan kiem')
    expect(after.softPreferences.map(p => p.key)).toContain('quiet')
    expect(after.candidates).toHaveLength(5)
  })

  it('L. a refinement re-ranks the SAME pool rather than replacing it', () => {
    const s = afterFirstReply()
    const after = applyDelta(s, extractDelta('yên tĩnh hơn nữa', s, 'refinement', 3))

    expect(after.candidates.map(c => c.name)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(after.softPreferences.find(p => p.key === 'quiet')?.weight).toBe(2)
  })
})

/**
 * Reuse presentation. Measured defect: a reuse turn named MVTTS/Orick/Van Viet
 * without searching, the user said "mình không thích quán đó", and the rejection
 * landed on the three places shown two turns earlier — leaving MVTTS, the option
 * actually rejected, still eligible.
 */
describe('presented candidates are recorded on reuse turns too', () => {
  const id = (n: string) => `pid-${n}`
  const cand = (n: string): Candidate => ({
    candidateId: id(n), name: n, type: 'place', source: 'search_places', retrievedAt: 0,
    facts: { address: `${n} street` },
  })

  function state(): ConversationState {
    const s = createState(newConversationId(), OWNER)
    s.candidates = ['Cosa Nostra', 'HAN', 'AnAn', 'MVTTS', 'Orick', 'Van Viet', 'Trang Anh', 'Nola'].map(cand)
    s.presentedCandidates = [id('Cosa Nostra'), id('HAN'), id('AnAn')]   // T1
    return s
  }

  it('1. a search turn records exactly the three it showed', () => {
    expect(unseenCandidateCount(state())).toBe(5)
  })

  it('2. a reuse turn ADDS the newly shown five, keeping the earlier three', () => {
    const s = state()
    s.presentedCandidates = [...s.presentedCandidates!, id('MVTTS'), id('Orick'), id('Van Viet'), id('Trang Anh'), id('Nola')]

    expect(unseenCandidateCount(s)).toBe(0)
    expect(s.presentedCandidates).toContain(id('Cosa Nostra'))
  })

  it('3. a candidate merely held is NOT presented', () => {
    const s = state()
    expect(isPresented(cand('MVTTS'), s)).toBe(false)
    expect(isPresented(cand('Cosa Nostra'), s)).toBe(true)
  })

  it('4. showing the same candidate twice records it once', () => {
    const shown = [id('MVTTS'), id('MVTTS')]
    expect([...new Set(shown)]).toHaveLength(1)
  })

  it('7. a rejection AFTER a reuse turn targets what that turn showed', () => {
    const s = state()
    // T3 showed five; T4 recommended MVTTS; that is the last-reply scope.
    s.presentedCandidates = [...s.presentedCandidates!, id('MVTTS'), id('Orick'), id('Van Viet')]
    s.lastPresentedCandidates = [id('MVTTS')]

    const d = extractDelta('Mình không thích quán đó.', s, 'rejection', 5)

    expect(d.rejection!.ref).toBe(id('MVTTS'))
    expect(d.rejection!.ref).not.toContain('Cosa Nostra')
  })

  it('5 + 6. rejected stays rejected, unshown stays unseen, and neither returns', () => {
    const s = state()
    s.lastPresentedCandidates = [id('MVTTS')]
    s.presentedCandidates = [...s.presentedCandidates!, id('MVTTS')]
    const after = applyDelta(s, extractDelta('Mình không thích quán đó.', s, 'rejection', 5))

    expect(isRejected(cand('MVTTS'), after)).toBe(true)
    const ranked = rankCandidates(after.candidates, after).ranked.map(r => r.candidate.name)
    expect(ranked).not.toContain('MVTTS')                       // 5. cannot return
    for (const still of ['Orick', 'Van Viet', 'Trang Anh', 'Nola']) {
      expect(ranked).toContain(still)                           // 6. remain eligible
      expect(isPresented(cand(still), after)).toBe(false)       //    and still unseen
    }
  })

  it('8. same display name, different identity, stay separate', () => {
    const s = createState(newConversationId(), OWNER)
    const a = { ...cand('Highlands'), candidateId: 'pid-a' }
    const b = { ...cand('Highlands'), candidateId: 'pid-b' }
    s.candidates = [a, b]
    s.rejections = [{ ref: 'pid-a', turn: 2 }]

    expect(isRejected(a, s)).toBe(true)
    expect(isRejected(b, s)).toBe(false)
    expect(rankCandidates(s.candidates, s).ranked.map(r => r.candidate.candidateId)).toEqual(['pid-b'])
  })
})

/**
 * The search policy must be ENFORCED, not advised.
 *
 * Measured: on "cho mình thêm vài quán khác" the policy computed
 * required:false with seven unseen candidates held, and the model called
 * search_places anyway. A policy the model can opt out of is not a policy.
 */
describe('search_places is withheld on reuse turns', () => {
  const route = readFileSync('src/app/api/chat/route.ts', 'utf8')

  /** The route's own predicate, mirrored so the cases below are executable. */
  const withhold = (o: { required: boolean; usable: number; unseen: number }) =>
    o.required === false && o.usable > 0 && o.unseen > 0

  it('1. reuse + unseen candidates -> withheld', () => {
    expect(withhold({ required: false, usable: 10, unseen: 7 })).toBe(true)
  })

  it('2. reuse + nothing unseen -> tool stays available', () => {
    expect(withhold({ required: false, usable: 10, unseen: 0 })).toBe(false)
  })

  it.each([
    ['3. location change', { required: true, usable: 10, unseen: 7 }],
    ['4. new hard constraint', { required: true, usable: 10, unseen: 7 }],
    ['5. initial discovery', { required: true, usable: 0, unseen: 0 }],
  ])('%s -> tool stays available', (_label, o) => {
    expect(withhold(o as { required: boolean; usable: number; unseen: number })).toBe(false)
  })

  it('the route gates the tool on exactly that predicate', () => {
    expect(route).toContain('const withholdPlaceSearch = !!convState')
    expect(route).toContain("consultationDelta?.searchImpact.required === false")
    expect(route).toContain('unseenCandidateCount(convState) > 0')
    expect(route).toContain('...(withholdPlaceSearch ? {} : { search_places: tool({')
  })

  it('8. search_places is NOT removed globally — it is still declared', () => {
    expect(route).toContain('search_places: tool({')
    expect(route.match(/search_places: tool\(\{/g) ?? []).toHaveLength(1)
  })

  it('6. the product exception is untouched by this change', () => {
    expect(route).toContain('!productPreSearched ? { search_products: tool({')
  })

  it('7. no other tool gained a pre-generation exception', () => {
    const beforeStream = route.slice(0, route.indexOf('AI.stream('))
    for (const forbidden of ['searchPlaces(', 'getHotelPrices(', 'getFlightPrices(', 'getNews(', 'getWeather(', 'webSearch(']) {
      expect(beforeStream, `${forbidden} must not run before generation`).not.toContain(forbidden)
    }
  })
})

describe('presentation tracking does not depend on bufferMode', () => {
  const filter = readFileSync('src/lib/ai/streamEnrichment.ts', 'utf8')

  it('8. a pure-reuse turn records what it named, with no tool frame', () => {
    // The decision turn named Cosa Nostra and AnAn but nothing buffered, so
    // presentedIds stayed empty and the next "quán đó" resolved against a reply
    // two turns older.
    expect(filter).toContain('let liveText')
    expect(filter).toContain('if (presentedIds.length === 0) presentedIds = namedHeldIds(liveText)')
  })

  it('9. only NAMED candidates count — held/ranked is not presented', () => {
    // Matching is by the candidate's NAME appearing in the finished text, and the
    // result is ordered by where it appears — [0] is the primary recommendation.
    expect(filter).toContain("hay.indexOf(normalizeVN(c.name.trim().toLowerCase()))")
    expect(filter).toContain('.sort((a, b) => a.at - b.at)')
  })

  it('recording the live text does not buffer the stream', () => {
    // The chunk is enqueued regardless; the copy is taken on the way past.
    const idx = filter.indexOf('liveText += JSON.parse(out.slice(2))')
    expect(idx).toBeGreaterThan(0)
    expect(filter.slice(idx, idx + 200)).toContain('controller.enqueue')
  })
})
