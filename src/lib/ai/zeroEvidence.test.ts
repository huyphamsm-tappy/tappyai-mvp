import { describe, expect, it } from 'vitest'
import { buildEvidenceStatusBlock, buildStateContextBlock, type EvidenceStatus } from './stateContext'
import { rankCandidates } from './candidateRanking'
import { createState, newConversationId, ownerScopeFor, type Candidate, type ConversationState } from './conversationState'

const OWNER = ownerScopeFor({ userId: 'alice' })
const base = () => createState(newConversationId(), OWNER)

function macState(): ConversationState {
  const s = base()
  s.goal = 'mua MacPro M1 cũ'
  s.hardConstraints = [
    { key: 'ram_gb', op: '=', value: 32, statedAs: 'dram 32gb', turn: 1 },
    { key: 'storage_gb', op: '>=', value: 512, statedAs: '512gb trở lên', turn: 1 },
    { key: 'condition', op: '=', value: 'used', statedAs: 'máy cũ', turn: 1 },
  ]
  s.useCase = 'coding'
  return s
}

/**
 * REGRESSION (permanent): with zero candidates the model was given NO grounding
 * rules at all, because both the evidence block and the ranking block were
 * gated on `candidates.length > 0`. Observed live on the Mac consultation with
 * 0 candidates — it recommended a specific "MacPro M1 32GB SSD 256GB … tầm 25
 * triệu", invented a battery-health figure, and quietly downgraded the user's
 * own 512GB requirement to 256GB while explaining the downgrade away.
 *
 * The guard has to exist precisely when candidates are absent.
 */
describe('zero-evidence guard fires when there is nothing to recommend', () => {
  it.each<EvidenceStatus>(['none', 'search_empty', 'search_failed'])(
    'emits a directive for status "%s"', (status) => {
      const block = buildEvidenceStatusBlock(status, macState())
      expect(block).not.toBe('')
      expect(block).toContain('KHONG CO BANG CHUNG')
    },
  )

  it('stays silent when candidates DO exist — normal path is unchanged', () => {
    expect(buildEvidenceStatusBlock('candidates', macState())).toBe('')
  })

  it('is NOT gated on the candidate count — the old bug', () => {
    const s = macState()
    expect(s.candidates).toHaveLength(0)
    expect(buildEvidenceStatusBlock('none', s).length).toBeGreaterThan(0)
  })
})

describe('the directive names every fabrication actually observed', () => {
  const block = buildEvidenceStatusBlock('search_empty', macState())

  it('forbids inventing a product/place name', () => {
    expect(block).toMatch(/KHONG DUOC[\s\S]*ten mot san pham/)
  })

  it('forbids inventing a price or a price range', () => {
    expect(block).toMatch(/gia, khoang gia/)
  })

  it('forbids inventing specs, battery, warranty, rating, hours, address', () => {
    expect(block).toMatch(/cau hinh \(RAM, o cung, doi may\), tinh trang pin, bao hanh, danh gia, gio mo cua, dia chi/)
  })

  it('forbids comparing two options that do not exist', () => {
    expect(block).toMatch(/so sanh hai phuong an khong co that/)
  })

  it('forbids silently relaxing a stated requirement — and restates the requirements', () => {
    // The live failure downgraded 512GB to 256GB and argued it was fine.
    expect(block).toMatch(/Ha thap hay bo bot yeu cau user da neu/)
    expect(block).toContain('storage_gb >= 512')
    expect(block).toContain('ram_gb = 32')
  })

  it('caps the follow-up at ONE question', () => {
    expect(block).toMatch(/hoi DUNG MOT cau/)
  })
})

describe('search_empty and search_failed stay distinguishable', () => {
  it('an empty search may say nothing matched', () => {
    const block = buildEvidenceStatusBlock('search_empty', base())
    expect(block).toMatch(/KHONG CO KET QUA NAO XAC MINH DUOC/)
  })

  it('a FAILED search must not claim nothing exists', () => {
    const block = buildEvidenceStatusBlock('search_failed', base())
    expect(block).toMatch(/TIM KIEM THAT BAI/)
    expect(block).toMatch(/KHONG PHAI la "khong co san pham nao"/)
    expect(block).toMatch(/KHONG noi rang khong ton tai lua chon nao/)
  })

  it('the two produce different text — they are not one collapsed message', () => {
    expect(buildEvidenceStatusBlock('search_empty', base()))
      .not.toBe(buildEvidenceStatusBlock('search_failed', base()))
  })
})

describe('ranking cannot manufacture a candidate', () => {
  it('an empty candidate set ranks to an empty set and an empty block', () => {
    const out = rankCandidates([], macState())
    expect(out.ranked).toEqual([])
    expect(out.excluded).toEqual([])
  })

  it('everything filtered out leaves nothing to recommend', () => {
    const violating: Candidate = {
      candidateId: 'x', name: 'MacBook Air M1 16GB 256GB', type: 'product',
      source: 'search_products', retrievedAt: 0, facts: {},
    }
    const out = rankCandidates([violating], macState())

    expect(out.ranked).toEqual([])          // excluded, not downgraded into a suggestion
    expect(out.excluded).toHaveLength(1)
    expect(out.noFullMatch).toBe(true)
  })
})

describe('candidates that exist but lack facts (CASE D) are unchanged', () => {
  it('still marks the specific unverified field rather than claiming it', () => {
    const s = macState()
    s.candidates = [{
      candidateId: 'c1', name: 'MacBook Pro M1', type: 'product',
      source: 'search_products', retrievedAt: 0, facts: {},
    }]

    // CASE D is the candidates path, so the zero-evidence block stays silent…
    expect(buildEvidenceStatusBlock('candidates', s)).toBe('')
    // …and the per-candidate "no data" marker does the work instead.
    expect(buildStateContextBlock(s)).toContain('(khong co du lieu khac)')
  })
})

describe('security — the guard leaks nothing', () => {
  it('carries no ownerScope, storage key, conversation id or timestamps', () => {
    const s = macState()
    s.ownerScope = 'SECRET_OWNER_SCOPE'
    ;(s as unknown as Record<string, unknown>).authToken = 'SECRET_TOKEN'

    const block = buildEvidenceStatusBlock('search_failed', s)

    expect(block).not.toContain('SECRET_OWNER_SCOPE')
    expect(block).not.toContain('SECRET_TOKEN')
    expect(block).not.toContain('tappy:convstate')
    expect(block).not.toContain(s.conversationId)
    expect(block).not.toContain(String(s.expiresAt))
  })

  it('handles a null state without throwing', () => {
    expect(() => buildEvidenceStatusBlock('none', null)).not.toThrow()
    expect(buildEvidenceStatusBlock('none', null)).toContain('KHONG CO BANG CHUNG')
  })
})

describe('rejected candidates are withheld from the evidence the model reads', () => {
  it('a rejected candidate is not listed as available evidence', () => {
    // Ranking already excluded them ("DA LOAI"), but the evidence block still
    // presented all five as choices — contradictory input the model could act on.
    const s = createState(newConversationId(), OWNER)
    s.candidates = [
      { candidateId: 'a', name: 'Cà Phê Nola', type: 'place', source: 'search_places', retrievedAt: 0, facts: {} },
      { candidateId: 'b', name: 'Cà Phê HAN', type: 'place', source: 'search_places', retrievedAt: 0, facts: {} },
    ]
    s.rejections = [{ ref: 'Cà Phê Nola', turn: 2 }]

    const block = buildStateContextBlock(s)
    // It must still be named in the REJECTED line — the model needs to know it
    // was turned down — but must not appear in the evidence list below it.
    const evidence = block.slice(block.indexOf('BANG CHUNG'))

    expect(block).toContain('DA BI TU CHOI')
    expect(block).toContain('Cà Phê Nola')
    expect(evidence, 'a rejected place must not be listed as available evidence').not.toContain('Cà Phê Nola')
    expect(evidence).toContain('Cà Phê HAN')
  })
})
