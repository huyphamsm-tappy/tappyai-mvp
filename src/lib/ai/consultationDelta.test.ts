import { describe, expect, it } from 'vitest'
import { applyDelta, decideSearch, extractDelta } from './consultationDelta'
import { createState, newConversationId, ownerScopeFor, type Candidate, type ConversationState } from './conversationState'
import { rankCandidates } from './candidateRanking'
import { detectDecisionStage } from './intent'

const OWNER = ownerScopeFor({ userId: 'alice' })
const fresh = () => createState(newConversationId(), OWNER)

const candidate = (name: string): Candidate => ({
  candidateId: name, name, type: 'place', source: 'search_places', retrievedAt: 0, facts: {},
})

/** Drives a whole conversation exactly as route.ts does: stage → delta → apply. */
function run(turns: string[], start: ConversationState = fresh()) {
  let state = start
  const deltas = []
  for (const [i, text] of turns.entries()) {
    const stage = detectDecisionStage(text, { hasPriorAssistantTurn: i > 0 })
    const d = extractDelta(text, state, stage, i + 1)
    state = applyDelta({ ...state, turn: i + 1 }, d)
    deltas.push(d)
  }
  return { state, deltas }
}

describe('Mac purchase — the required 5-turn accumulation', () => {
  const TURNS = [
    'tôi muốn mua máy MacPro M1, dram 32gb, ổ cứng 512gb trở lên, máy cũ',
    'tầm 25 triệu',
    'chủ yếu code',
    'pin phải tốt',
    'bạn chọn máy nào?',
  ]

  it('turn 1 lifts the stated specs into HARD constraints', () => {
    const { state } = run(TURNS.slice(0, 1))
    const byKey = Object.fromEntries(state.hardConstraints.map(c => [c.key, c]))

    expect(byKey.ram_gb).toMatchObject({ op: '=', value: 32 })
    expect(byKey.storage_gb).toMatchObject({ op: '>=', value: 512 }) // "trở lên"
    expect(byKey.condition).toMatchObject({ value: 'used' })
    expect(state.goal).toContain('MacPro M1')
  })

  it('"tầm 25 triệu" is a target, NOT a hard ceiling', () => {
    const { state } = run(TURNS.slice(0, 2))

    // The user said "around". Treating it as <= 25M would hide a 26M machine
    // that is otherwise a perfect fit.
    expect(state.hardConstraints.some(c => c.key === 'budget_max')).toBe(false)
    // …and it records the figure the USER said. extractBudget widens "around N"
    // to [N*0.8, N*1.2], so reading `.max` here labelled it 30M — a number that
    // never came out of the user's mouth. Observed live before this was fixed.
    expect(state.softPreferences.map(p => p.key)).toContain('budget~25000000')
  })

  it('"dưới 25 triệu" IS a hard ceiling — the wording decides', () => {
    const { state } = run([TURNS[0], 'dưới 25 triệu'])

    expect(state.hardConstraints.find(c => c.key === 'budget_max')).toMatchObject({ op: '<=' })
  })

  it('accumulates every turn without ever dropping an earlier requirement', () => {
    const { state } = run(TURNS)

    // This is the regression the whole task exists for.
    expect(state.hardConstraints.map(c => c.key).sort()).toEqual(['condition', 'ram_gb', 'storage_gb'])
    expect(state.useCase).toBe('coding')
    expect(state.softPreferences.map(p => p.key)).toContain('battery')
    expect(state.softPreferences.some(p => p.key.startsWith('budget~'))).toBe(true)
    expect(state.goal).toContain('MacPro M1')
  })

  it('does not re-search on the decision turn when candidates are already held', () => {
    const withCands = { ...fresh(), candidates: [candidate('MacBook A'), candidate('MacBook B')] }
    const { deltas } = run(TURNS, withCands)

    expect(deltas[4].decisionIntent).toBe(true)
    expect(deltas[4].searchImpact.required).toBe(false)
    expect(deltas[4].searchImpact.reason).toMatch(/already on the table/)
  })
})

describe('English parity — the same reasoning, not a translation', () => {
  it('extracts the same structure from the English phrasing', () => {
    const { state } = run([
      'I want to buy a used MacBook Pro M1 with 32gb ram and 512gb ssd or more',
      'under 25 million',
      'mostly coding',
      'battery must be good',
    ])
    const byKey = Object.fromEntries(state.hardConstraints.map(c => [c.key, c]))

    expect(byKey.ram_gb).toMatchObject({ value: 32 })
    expect(byKey.storage_gb).toMatchObject({ op: '>=', value: 512 })
    expect(byKey.condition).toMatchObject({ value: 'used' })
    expect(byKey.budget_max).toMatchObject({ op: '<=' })   // "under" = hard
    expect(state.useCase).toBe('coding')
    expect(state.softPreferences.map(p => p.key)).toContain('battery')
  })
})

describe('relative refinement resolves against the task in play', () => {
  it('"rẻ hơn" / "cheaper" becomes a preference and forces a re-rank', () => {
    const { state, deltas } = run(['quán cà phê ở Hoàn Kiếm Hà Nội', 'rẻ hơn'])

    expect(state.softPreferences.map(p => p.key)).toContain('cheaper')
    expect(state.location).toBe('hoan kiem')          // survives the short turn
    expect(deltas[1].searchImpact.required).toBe(true)
  })

  it('repeating a preference raises its weight instead of duplicating it', () => {
    const { state } = run(['quán cà phê yên tĩnh ở Hà Nội', 'yên tĩnh hơn nữa'])
    const quiet = state.softPreferences.filter(p => p.key === 'quiet')

    expect(quiet).toHaveLength(1)
    expect(quiet[0].weight).toBe(2)
  })

  it('a changed hard bound REPLACES the old one rather than stacking', () => {
    const { state } = run(['laptop dưới 30 triệu', 'dưới 20 triệu'])
    const budgets = state.hardConstraints.filter(c => c.key === 'budget_max')

    expect(budgets).toHaveLength(1)
    expect(budgets[0].value).toBe(20_000_000)
  })
})

describe('rejection', () => {
  it('records what the user was SHOWN and forces a fresh search', () => {
    const withCands = {
      ...fresh(),
      candidates: [candidate('Cà Phê HAN'), candidate('Cà Phê AnAn')],
      presentedCandidates: ['Cà Phê HAN', 'Cà Phê AnAn'],
    }
    const { state, deltas } = run(["I don't like those."], withCands)

    expect(state.rejections).toHaveLength(1)
    expect(state.rejections[0].ref).toContain('Cà Phê HAN')
    expect(deltas[0].searchImpact.required).toBe(true)
    expect(deltas[0].searchImpact.reason).toMatch(/rejected/)
  })

  it('keeps the goal and constraints — the set was wrong, not the task', () => {
    const start = run(['quán cà phê yên tĩnh ở Hà Nội']).state
    const withCands = { ...start, candidates: [candidate('X')] }
    const { state } = run(['tôi không thích mấy quán này'], withCands)

    expect(state.goal).toContain('cà phê')
    expect(state.softPreferences.map(p => p.key)).toContain('quiet')
  })
})

describe('search policy', () => {
  const empty = fresh()
  const stocked = { ...fresh(), candidates: [candidate('A')] }
  const nil = { hardConstraintAdds: [], hardConstraintChanges: [], softPreferenceAdds: [], decisionIntent: false, searchImpact: { required: false, reason: '' } }

  it('searches when there is nothing on the table', () => {
    expect(decideSearch(nil, empty, null).required).toBe(true)
  })

  it('does NOT search on a bare acknowledgement', () => {
    expect(decideSearch(nil, stocked, 'confirmation').required).toBe(false)
  })

  it('does NOT search when nothing decision-relevant moved', () => {
    expect(decideSearch(nil, stocked, null).required).toBe(false)
  })

  it('DOES search on a decision turn if the table is empty — nothing to choose from', () => {
    expect(decideSearch({ ...nil, decisionIntent: true }, empty, 'decision').required).toBe(true)
  })
})

describe('extraction safety', () => {
  it('ignores a bare number with no spec context', () => {
    const { state } = run(['32'])
    expect(state.hardConstraints).toEqual([])
  })

  it('does not read a RAM figure out of an unrelated sentence', () => {
    // "16gb" with no ram/memory word nearby must not become a requirement.
    const d = extractDelta('gói cước 16gb data', fresh(), null, 1)
    expect(d.hardConstraintAdds.some(c => c.key === 'ram_gb')).toBe(false)
  })

  it('does not read "sáng mai" (tomorrow morning) as a request for somewhere fancy', () => {
    // normalizeVN strips diacritics, so "sáng" collapses to "sang" — a bare
    // "sang" pattern tagged every morning request as `nicer`. Observed live.
    const { state } = run(['quán cà phê yên tĩnh ở Hoàn Kiếm để làm việc sáng mai'])

    expect(state.softPreferences.map(p => p.key)).not.toContain('nicer')
    expect(state.timeContext).toBe('tomorrow-morning')
    expect(state.softPreferences.map(p => p.key)).toContain('quiet')
  })

  it('is a no-op on empty input', () => {
    const d = extractDelta('', fresh(), null, 1)
    expect(d.hardConstraintAdds).toEqual([])
    expect(d.softPreferenceAdds).toEqual([])
  })
})

/**
 * Rejection scope (Part D). "These" means the candidates the assistant actually
 * NAMED, recorded from the finished reply text — not the first N held, and not
 * all of them. Both earlier guesses were wrong in opposite directions: the
 * first-five rule under-captured, and all-candidates over-captured (observed
 * live: Cà Phê MVTTS and Cà Phê Linh rejected while never displayed).
 */
describe('rejection scope — only what was shown', () => {
  const held = (names: string[]): Candidate[] => names.map(n => ({
    candidateId: n, name: n, type: 'place', source: 'search_places', retrievedAt: 0, facts: {},
  }))

  it('CASE 1 — 5 held, A/B/C shown, "these" rejects only A/B/C', () => {
    const s = { ...fresh(), candidates: held(['A', 'B', 'C', 'D', 'E']), presentedCandidates: ['A', 'B', 'C'] }
    const { state } = run(['I don\'t like these.'], s)
    const rejected = state.rejections[0].ref

    expect(rejected).toContain('A'); expect(rejected).toContain('B'); expect(rejected).toContain('C')
    expect(rejected).not.toContain('D'); expect(rejected).not.toContain('E')
  })

  it('CASE 2 — naming ONE of the shown options rejects only that one', () => {
    const s = { ...fresh(), candidates: held(['Cà Phê HAN', 'Cà Phê AnAn']), presentedCandidates: ['Cà Phê HAN', 'Cà Phê AnAn'] }
    const { state } = run(['tôi không thích Cà Phê HAN'], s)

    expect(state.rejections[0].ref).toBe('Cà Phê HAN')
    expect(rankCandidates(state.candidates, state).ranked.map(r => r.candidate.name)).toEqual(['Cà Phê AnAn'])
  })

  it('CASE 3 — rejection by name works without diacritics, as users type it', () => {
    const s = { ...fresh(), candidates: held(['Cà Phê HAN', 'Cà Phê AnAn']), presentedCandidates: ['Cà Phê HAN', 'Cà Phê AnAn'] }
    const { state } = run(['I don\'t like Ca Phe AnAn'], s)

    expect(state.rejections[0].ref).toBe('Cà Phê AnAn')
    expect(state.rejections[0].ref).not.toContain('HAN')
  })

  it('CASE 4 — a candidate never shown can never become rejected', () => {
    const s = { ...fresh(), candidates: held(['Shown', 'NeverShown']), presentedCandidates: ['Shown'] }
    const { state } = run(['tôi không thích mấy quán này'], s)

    expect(state.rejections[0].ref).not.toContain('NeverShown')
  })

  it('CASE 5 — a rejected candidate cannot return through ranking', () => {
    const s = { ...fresh(), candidates: held(['A', 'B']), presentedCandidates: ['A'] }
    const { state } = run(['I don\'t like these.'], s)
    const out = rankCandidates(state.candidates, state)

    expect(out.ranked.map(r => r.candidate.name)).toEqual(['B'])
    expect(out.excluded[0]).toMatchObject({ name: 'A' })
  })

  it('CASE 6 — the consultation survives a rejection', () => {
    const start = run(['quán cà phê yên tĩnh ở Hoàn Kiếm Hà Nội']).state
    const s = { ...start, candidates: held(['A']), presentedCandidates: ['A'] }
    const { state } = run(['tôi không thích mấy quán này'], s)

    expect(state.goal).toContain('cà phê')
    expect(state.location).toBe('hoan kiem')
    expect(state.softPreferences.map(p => p.key)).toContain('quiet')
  })

  it('names NO candidate rather than guessing when no reply has been recorded yet', () => {
    // Safer to under-reject than to discard options the user never saw. The
    // turn is still recorded so the search re-runs, but it points at nothing.
    const s = { ...fresh(), candidates: held(['A', 'B', 'C']) }
    const { state, deltas } = run(['I don\'t like these.'], s)

    expect(state.rejections[0].ref).toBe('previous suggestions')
    // No search: nothing was recorded as shown, so all three are unseen and the
    // reuse policy answers from them rather than fetching the same set again.
    expect(deltas[0].searchImpact.required).toBe(false)
    expect(rankCandidates(state.candidates, state).excluded).toEqual([])
  })
})

/**
 * Phrasings the real product consultation actually used. Both were measured
 * silently dropping a HARD requirement: the state after "RAM phải 32GB, ổ cứng
 * từ 512GB trở lên" held ram_gb only, and "một chiếc Mac cũ" never became a
 * used-condition requirement. A requirement that is never captured cannot be
 * protected from silent relaxation later.
 */
describe('spec phrasings from the live Mac consultation', () => {
  it('reads "ổ cứng TỪ 512GB trở lên" — filler words between noun and figure', () => {
    const { state } = run(['RAM phải 32GB, ổ cứng từ 512GB trở lên.'])
    const byKey = Object.fromEntries(state.hardConstraints.map(c => [c.key, c]))

    expect(byKey.ram_gb).toMatchObject({ op: '=', value: 32 })
    expect(byKey.storage_gb).toMatchObject({ op: '>=', value: 512 })
  })

  it.each([
    ['ổ cứng ít nhất 512GB', 512],
    ['ssd tối thiểu 512gb', 512],
    ['ổ cứng khoảng 1TB', 1024],
    ['storage from 512gb', 512],
    ['ssd at least 512 gb', 512],
  ])('reads storage from %s', (text, gb) => {
    const { state } = run([text])
    expect(state.hardConstraints.find(c => c.key === 'storage_gb')).toMatchObject({ value: gb })
  })

  it.each(['một chiếc Mac cũ', 'mua MacBook cũ', 'laptop cũ', 'iphone cũ'])(
    'reads used condition from "%s"',
    text => {
      const { state } = run([`Tôi muốn mua ${text} để code.`])
      expect(state.hardConstraints.find(c => c.key === 'condition')).toMatchObject({ value: 'used' })
    },
  )

  it('does NOT read "bạn cũ" or "chỗ cũ" as a used-condition requirement', () => {
    // "cũ" is only a condition when it qualifies the THING being bought.
    for (const text of ['gặp lại bạn cũ', 'vẫn quán cũ nhé', 'chỗ cũ']) {
      const { state } = run([text])
      expect(state.hardConstraints.some(c => c.key === 'condition')).toBe(false)
    }
  })
})

describe('"at least N" is a FLOOR wherever the qualifier sits', () => {
  it.each([
    ['at least 512GB storage', '>='],      // qualifier BEFORE — measured as '=' live
    ['storage at least 512gb', '>='],
    ['ổ cứng 512gb trở lên', '>='],
    ['ổ cứng 512gb', '='],                 // unqualified stays exact
  ])('%s -> %s', (text, op) => {
    const { state } = run([text])
    expect(state.hardConstraints.find(c => c.key === 'storage_gb')).toMatchObject({ op, value: 512 })
  })
})
