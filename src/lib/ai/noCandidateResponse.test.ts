import { describe, expect, it } from 'vitest'
import { buildNoCandidateResponse, buildRejectionQuestionBlock, buildRejectionResponse, rejectionQuestionFor, shouldUseDeterministicRejection, shouldUseDeterministicResponse, toDataStreamBody } from './noCandidateResponse'
import { collectAllowedNumbers, findUnsupportedNumericClaims } from './numericGrounding'
import { createState, newConversationId, ownerScopeFor, type Candidate, type ConversationState } from './conversationState'
import { isDecisionGrade, usableCandidates, type EvidenceStatus } from './stateContext'

const OWNER = ownerScopeFor({ userId: 'alice' })

function macState(): ConversationState {
  const s = createState(newConversationId(), OWNER)
  s.goal = 'mua MacPro M1 cũ'
  s.hardConstraints = [
    { key: 'ram_gb', op: '>=', value: 32, statedAs: 'dram 32gb', turn: 1 },
    { key: 'storage_gb', op: '>=', value: 512, statedAs: 'ổ cứng 512gb trở lên', turn: 1 },
    { key: 'condition', op: '=', value: 'used', statedAs: 'máy cũ', turn: 1 },
  ]
  s.softPreferences = [{ key: 'budget~25000000', weight: 1, statedAs: 'tầm 25 triệu', turn: 2 }]
  s.useCase = 'coding'
  return s
}
const candidate = (name: string): Candidate => ({
  candidateId: name, name, type: 'product', source: 'search_products', retrievedAt: 0, facts: {},
})

describe('activation is narrow — every other path keeps the LLM', () => {
  it('fires on search_empty + zero candidates + hard constraints', () => {
    expect(shouldUseDeterministicResponse(macState(), 'search_empty')).toBe(true)
  })

  it.each<EvidenceStatus>(['candidates', 'search_failed', 'none'])(
    'does NOT fire for status "%s"', (status) => {
      expect(shouldUseDeterministicResponse(macState(), status)).toBe(false)
    },
  )

  it('does NOT fire when a USABLE candidate exists — ranking path is untouched', () => {
    const s = macState()
    const c = candidate('MacBook Pro M1 32GB')
    c.facts = { price: '24.900.000đ' }
    s.candidates = [c]
    expect(shouldUseDeterministicResponse(s, 'search_empty', 1)).toBe(false)
  })

  it('DOES fire when the rows carry no price, spec or address', () => {
    // The live Mac consultation: six rows back from search_products, every one
    // a YouTube video, a marketplace tag page or a market report, each holding
    // nothing but a snippet. Counting them as evidence disabled this guard and
    // the reply invented a MacBook Air M2 32GB/512GB at 26-28 triệu.
    const s = macState()
    s.candidates = ['Lần đầu mua LAPTOP trên LAZADA và CÁI KẾT...', 'Báo cáo thị trường Laptop']
      .map(n => { const c = candidate(n); c.facts = { snippet: 'bài viết' }; return c })

    expect(usableCandidates(s)).toHaveLength(0)
    expect(shouldUseDeterministicResponse(s, 'search_empty', 0)).toBe(true)
  })

  it('treats a snippet as prose, and a price or spec as evidence', () => {
    const withSnippet = candidate('x'); withSnippet.facts = { snippet: 'blah' }
    const withPrice = candidate('y'); withPrice.facts = { price: '20.000.000đ' }
    const withSpec = candidate('z'); withSpec.facts = { ram_gb: 32 }
    const withAddress = candidate('w'); withAddress.facts = { address: '22 Lý Quốc Sư' }

    expect(isDecisionGrade(withSnippet)).toBe(false)
    expect(isDecisionGrade(withPrice)).toBe(true)
    expect(isDecisionGrade(withSpec)).toBe(true)
    expect(isDecisionGrade(withAddress)).toBe(true)
  })

  it('does NOT fire without a hard constraint — no requirement worth protecting', () => {
    const s = createState(newConversationId(), OWNER)
    expect(shouldUseDeterministicResponse(s, 'search_empty')).toBe(false)
  })

  it('does NOT fire without state at all', () => {
    expect(shouldUseDeterministicResponse(null, 'search_empty')).toBe(false)
  })
})

describe('the reply cannot fabricate — by construction', () => {
  const s = macState()
  const text = buildNoCandidateResponse(s, 'vi')

  it('introduces NO number the user did not state', () => {
    // The whole point: the only numeric source is `state`, so this is 0 by
    // construction rather than by instruction. 12 -> 0 against the 3F-2.1 baseline.
    const allowed = collectAllowedNumbers(s, [])
    expect(findUnsupportedNumericClaims(text, allowed)).toEqual([])
  })

  it('never proposes the downgrades the model kept inventing', () => {
    expect(text).not.toMatch(/16\s*GB/i)
    expect(text).not.toMatch(/256\s*GB/i)
    expect(text).not.toMatch(/28|30\s*triệu/)
    expect(text).not.toMatch(/\d+\s*(giờ|hours)/i)
    expect(text).not.toMatch(/\d+\s*%/)
  })

  it('names no product and makes no comparison', () => {
    expect(text).not.toMatch(/MacBook|Mac Pro|MacPro M1 \d/i)
    expect(text).not.toMatch(/rẻ hơn|tốt hơn|so với/i)
  })

  it('restates the requirements in the user\'s own terms', () => {
    expect(text).toContain('RAM từ 32GB')
    expect(text).toContain('ổ cứng từ 512GB')
    expect(text).toContain('máy cũ')
  })

  it('says explicitly that nothing was relaxed on the user\'s behalf', () => {
    expect(text).toMatch(/không tự ý hạ bớt/)
  })

  it('asks exactly ONE question, qualitatively', () => {
    expect((text.match(/\?/g) || [])).toHaveLength(1)
    expect(text).toMatch(/nới (ngân sách|cấu hình)/)
  })
})

describe('English parity', () => {
  const text = buildNoCandidateResponse(macState(), 'en')

  it('carries the same semantics without inventing numbers', () => {
    expect(findUnsupportedNumericClaims(text, collectAllowedNumbers(macState(), []))).toEqual([])
    expect(text).toContain('at least 32GB RAM')
    expect(text).toContain('at least 512GB storage')
    expect(text).toMatch(/haven't loosened/)
    expect((text.match(/\?/g) || [])).toHaveLength(1)
  })
})

describe('question adapts to which levers actually exist', () => {
  it('offers budget and specs when both are in play', () => {
    expect(buildNoCandidateResponse(macState(), 'vi')).toMatch(/ngân sách.*cấu hình|cấu hình.*ngân sách/)
  })

  it('offers a single lever when only one exists', () => {
    const s = createState(newConversationId(), OWNER)
    s.hardConstraints = [{ key: 'ram_gb', op: '>=', value: 32, statedAs: '32gb', turn: 1 }]
    const text = buildNoCandidateResponse(s, 'vi')

    expect(text).toMatch(/nới cấu hình một chút/)
    expect((text.match(/\?/g) || [])).toHaveLength(1)
  })

  it('renders a hard budget ceiling in the user\'s own units', () => {
    const s = createState(newConversationId(), OWNER)
    s.hardConstraints = [{ key: 'budget_max', op: '<=', value: 25_000_000, statedAs: 'dưới 25 triệu', turn: 1 }]

    expect(buildNoCandidateResponse(s, 'vi')).toContain('giá không quá 25 triệu')
  })
})

describe('security — only user-safe state is rendered', () => {
  it('leaks no ownerScope, id, token or storage key', () => {
    const s = macState()
    s.ownerScope = 'SECRET_OWNER_SCOPE'
    ;(s as unknown as Record<string, unknown>).authToken = 'SECRET_TOKEN'

    const text = buildNoCandidateResponse(s, 'vi')

    expect(text).not.toContain('SECRET_OWNER_SCOPE')
    expect(text).not.toContain('SECRET_TOKEN')
    expect(text).not.toContain(s.conversationId)
    expect(text).not.toContain('tappy:convstate')
  })
})

describe('wire format matches what clients already parse', () => {
  const body = toDataStreamBody('xin chào')

  it('emits the AI SDK data-stream frames', () => {
    expect(body).toMatch(/^f:\{"messageId"/)
    expect(body).toContain('0:"xin chào"')
    expect(body).toMatch(/\ne:\{"finishReason":"stop"/)
    expect(body).toMatch(/\nd:\{"finishReason":"stop"/)
  })

  it('round-trips through the same 0: parsing the clients use', () => {
    let text = ''
    for (const line of body.split('\n')) if (line.startsWith('0:')) text += JSON.parse(line.slice(2))
    expect(text).toBe('xin chào')
  })

  it('escapes newlines so a multi-line reply stays one frame', () => {
    const multi = toDataStreamBody('a\n\nb')
    expect(multi.split('\n').filter(l => l.startsWith('0:'))).toHaveLength(1)
  })
})

/**
 * Part E — the rejection turn asks at most ONE question.
 *
 * Measured failure this pins: after three Hanoi cafes were rejected, the EN
 * reply ran no search and asked two questions, the second of them re-asking the
 * area the user had already given.
 */
describe('rejection turn — exactly one question, never a re-ask', () => {
  function rejectedState(lang: 'vi' | 'en' = 'vi'): ConversationState {
    const s = createState(newConversationId(), OWNER)
    s.goal = lang === 'vi' ? 'quán cà phê yên tĩnh để làm việc' : 'quiet cafe to work'
    s.location = 'ha noi'
    s.useCase = 'work'
    s.softPreferences = [{ key: 'quiet', weight: 1, statedAs: 'yên tĩnh', turn: 1 }]
    s.candidates = [candidate('Cà Phê AnAn'), candidate('Cà Phê HAN')]
    s.presentedCandidates = ['Cà Phê AnAn', 'Cà Phê HAN']
    s.rejections = [{ ref: 'Cà Phê AnAn, Cà Phê HAN', turn: 2 }]
    s.decisionStage = 'rejection'
    return s
  }

  it('fires only when the rejection cleared every option that was held', () => {
    expect(shouldUseDeterministicRejection(rejectedState(), 'rejection', 0)).toBe(true)
  })

  it('does NOT fire while something is still on the table — the model consults', () => {
    // One of five rejected leaves four to recommend from. Handing that turn to a
    // template would throw away the whole point of holding candidates.
    expect(shouldUseDeterministicRejection(rejectedState(), 'rejection', 4)).toBe(false)
  })

  it.each([['refinement'], ['decision'], ['comparison'], ['confirmation'], [null]])(
    'does NOT fire on stage %s',
    stage => {
      expect(shouldUseDeterministicRejection(rejectedState(), stage as string | null, 0)).toBe(false)
    },
  )

  it('does NOT fire when there was never anything to reject', () => {
    const s = rejectedState()
    s.candidates = []
    expect(shouldUseDeterministicRejection(s, 'rejection', 0)).toBe(false)
  })

  it('VI asks exactly one question', () => {
    const text = buildRejectionResponse(rejectedState(), 'vi')
    expect((text.match(/\?/g) || []).length).toBe(1)
  })

  it('EN asks exactly one question — the measured two-question turn', () => {
    const text = buildRejectionResponse(rejectedState('en'), 'en')
    expect((text.match(/\?/g) || []).length).toBe(1)
  })

  it('never re-asks the area when the state already knows it', () => {
    const en = buildRejectionResponse(rejectedState('en'), 'en')
    expect(en).not.toMatch(/which area/i)
    expect(buildRejectionResponse(rejectedState(), 'vi')).not.toMatch(/khu vực nào/i)
  })

  it('DOES ask for the area when that is the thing it does not know — for PLACES', () => {
    const s = rejectedState('en')
    s.candidates = s.candidates.map(c => ({ ...c, type: 'place' as const }))
    s.location = undefined
    s.softPreferences = [{ key: 'budget~200000', weight: 1, statedAs: 'around 200k', turn: 1 }]
    const text = buildRejectionResponse(s, 'en')

    expect(text).toMatch(/which area/i)
    expect((text.match(/\?/g) || []).length).toBe(1)
  })

  it('confirms the rejected options are gone and the requirements are not', () => {
    const s = rejectedState('en')
    s.hardConstraints = [{ key: 'budget_max', op: '<=', value: 200_000, statedAs: 'under 200k', turn: 2 }]
    const text = buildRejectionResponse(s, 'en')

    expect(text).toMatch(/won't suggest them again/i)
    expect(text).toContain('Ha Noi')   // display copy, not the 'ha noi' match key
    expect(text).toContain('200000')
  })

  it('states no candidate, no price and no place the user did not supply', () => {
    const text = buildRejectionResponse(rejectedState(), 'vi')
    expect(text).not.toContain('Cà Phê AnAn')
    expect(text).not.toContain('Cà Phê HAN')
  })
})

/**
 * The question handed to the model on a rejection turn that still has options.
 * Measured before this block existed: VI asked 3, 3, 1 questions; after it,
 * 6/6 VI and 6/6 EN samples asked exactly one.
 */
describe('rejection question block — the model is given the question, not a menu', () => {
  function rejected(lang: 'vi' | 'en' = 'vi'): ConversationState {
    const s = createState(newConversationId(), OWNER)
    s.location = 'ha noi'
    s.useCase = 'work'
    s.candidates = [candidate('A'), candidate('B')]
    s.presentedCandidates = ['A']
    s.rejections = [{ ref: 'A', turn: 2 }]
    s.decisionStage = 'rejection'
    return s
  }

  it('carries the SAME question the deterministic reply would ask', () => {
    const s = rejected()
    expect(buildRejectionQuestionBlock(s, 'vi')).toContain(rejectionQuestionFor(s, 'vi'))
    expect(buildRejectionQuestionBlock(s, 'en')).toContain(rejectionQuestionFor(s, 'en'))
  })

  it('asks in the language of the reply', () => {
    expect(buildRejectionQuestionBlock(rejected(), 'vi')).toContain('tầm giá')
    expect(buildRejectionQuestionBlock(rejected(), 'en')).toContain('price range')
  })

  it('offers no dimension menu to enumerate — that was the questionnaire source', () => {
    const block = buildRejectionQuestionBlock(rejected(), 'vi')
    // The four dimensions may only appear inside the prohibition, never as an
    // instruction to ask about them.
    expect(block).not.toMatch(/hoi .{0,40}(gia|vi tri|kieu|thuong hieu) *\//i)
    expect(block).toMatch(/KHONG liet ke nhieu chieu/)
  })

  it('tells the model that recommending WITHOUT asking is the better outcome', () => {
    expect(buildRejectionQuestionBlock(rejected(), 'vi')).toMatch(/KHONG hoi gi ca/)
  })
})

describe('the rejection question fits what is being bought', () => {
  it('does NOT ask a laptop shopper which area to look in', () => {
    // Measured live on the product path: "Which area should I look around?
    // (HCM, Hanoi, Da Nang, or online nationwide?)" after used-MacBook results.
    const s = createState(newConversationId(), OWNER)
    s.candidates = [candidate('MacBook Pro M1')]        // type: 'product'
    s.presentedCandidates = ['MacBook Pro M1']
    s.rejections = [{ ref: 'MacBook Pro M1', turn: 2 }]
    s.softPreferences = [{ key: 'budget~25000000', weight: 1, statedAs: 'tầm 25 triệu', turn: 1 }]
    s.useCase = 'coding'

    const q = rejectionQuestionFor(s, 'en')
    expect(q).not.toMatch(/area/i)
    expect((q.match(/\?/g) || [])).toHaveLength(1)
  })

  it('forbids the parenthetical option list that smuggled in a second question', () => {
    const s = createState(newConversationId(), OWNER)
    s.candidates = [candidate('X')]
    expect(buildRejectionQuestionBlock(s, 'en')).toMatch(/KHONG them ngoac don/)
  })
})

/**
 * The exact fabrication from the live shopping run, pinned so it cannot recur
 * silently. State holds the two real listings; the reply is the one that was
 * actually produced.
 */
describe('anti-fabrication — the measured product failure', () => {
  function liveState(): ConversationState {
    const s = macState()
    const mk = (name: string, id: string, vnd: number, extra: Record<string, string | number> = {}) => ({
      candidateId: id, name, type: 'product' as const, source: 'search_products', retrievedAt: 0,
      facts: { price: `${vnd}`, price_vnd: vnd, ram_gb: 32, storage_gb: 512, source_site: 'Shop', spec_source: name, ...extra },
    })
    s.candidates = [
      mk('MacBook Pro 14 inch M1 Pro 2021 8CPU/32GB/512GB/14GPU cũ', 'pid:14', 29_550_000, { condition: 'used', condition_label: 'cũ' }),
      mk('Macbook Pro 16 inch M1 Max (10CPU/32GPU) 32GB/512GB', 'pid:16', 34_500_000),
    ]
    return s
  }

  const REAL_FAILURE = 'Nếu là mình thì mình chọn MacBook Pro 16 inch M1 Pro 32GB/512GB (29.550.000 ₫). '
    + 'Pin tốt nhất vì máy còn mới (2021, tình trạng 98%). Danh đổi: bản 13 inch hàng 95%.'

  it('flags the invented condition percentages as unsupported', () => {
    const allowed = collectAllowedNumbers(liveState(), [])
    const claims = findUnsupportedNumericClaims(REAL_FAILURE, allowed).join(' ')

    expect(claims).toContain('98')
    expect(claims).toContain('95')
  })

  it('no candidate supplies 95 or 98 — so no reply can source them', () => {
    const facts = JSON.stringify(liveState().candidates.map(c => c.facts))
    expect(facts).not.toMatch(/\b9[58]\b/)
  })

  it('the 16-inch listing does not carry the 14-inch price anywhere in state', () => {
    const sixteen = liveState().candidates.find(c => c.name.includes('16 inch'))!
    expect(sixteen.facts.price_vnd).toBe(34_500_000)
    expect(JSON.stringify(sixteen.facts)).not.toContain('29550000')
  })

  it('a reply quoting each listing\'s OWN price raises no unsupported claim', () => {
    const allowed = collectAllowedNumbers(liveState(), [])
    const grounded = 'Mình chọn Macbook Pro 16 inch M1 Max (10CPU/32GPU) 32GB/512GB — 34500000 ₫, RAM 32GB, ổ cứng 512GB.'
    expect(findUnsupportedNumericClaims(grounded, allowed)).toEqual([])
  })
})

describe('rejection falls back to the deterministic reply when nothing USABLE is left', () => {
  it('fires when the survivors are all evidence-free rows', () => {
    const s = macState()
    const junk = candidate('Báo cáo thị trường Laptop'); junk.facts = { snippet: 'bài viết' }
    s.candidates = [junk]
    s.presentedCandidates = ['Báo cáo thị trường Laptop']
    s.rejections = [{ ref: 'x', turn: 2 }]

    // visible = 1 but usable = 0: the free-form path here is where the
    // multi-question interrogations were measured.
    expect(usableCandidates(s)).toHaveLength(0)
    expect(shouldUseDeterministicRejection(s, 'rejection', usableCandidates(s).length)).toBe(true)
    expect((buildRejectionResponse(s, 'vi').match(/\?/g) || [])).toHaveLength(1)
    expect((buildRejectionResponse(s, 'en').match(/\?/g) || [])).toHaveLength(1)
  })

  it('still stands aside when a real priced listing survives', () => {
    const s = macState()
    const real = candidate('MacBook Pro 16 2019 32GB/512GB'); real.facts = { price_vnd: 22_390_000 }
    s.candidates = [real]
    s.rejections = [{ ref: 'other', turn: 2 }]

    expect(shouldUseDeterministicRejection(s, 'rejection', usableCandidates(s).length)).toBe(false)
  })
})
