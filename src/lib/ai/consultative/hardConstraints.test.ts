import { describe, it, expect, vi, afterEach } from 'vitest'
import { classifyHardGaps, hardConstraintGaps, hardGroupOf, evidenceNote, HARD_GROUP, HARD_GAP_WORDS, rowSupportedHards } from './hardConstraints'
import { extractAttributes } from './reviewAttributes'
import type { Hard } from './situationFrame'

// Owner decision 2026-09-19: three groups, in code, nothing silent.
const texts = new Map<string, string[]>([
  ['Cơm Niêu', ['Không gian yên tĩnh, hợp gia đình, có chỗ đậu xe ô tô']],
  ['Ốc Đào', ['Quán rất đông, xếp hàng chờ lâu nhưng ốc ngon rẻ']],
])
const attrs = extractAttributes(texts)

describe('HARD_GROUP', () => {
  it('covers every Hard value with exactly one group, and every value has gap words', () => {
    const all: Hard[] = ['quiet', 'parking', 'kids', 'vegetarian', 'outdoor', 'private_room', 'late_open', 'delivery', 'air_con', 'view', 'live_music', 'wheelchair']
    for (const h of all) {
      expect(['EVIDENCE_REQUIRED', 'ASSUME_PRESENT', 'ROW_FLAG_BACKED']).toContain(HARD_GROUP[h])
      expect(HARD_GAP_WORDS[h][0]).toBeTruthy()
      expect(HARD_GAP_WORDS[h][1]).toBeTruthy()
    }
    expect(HARD_GROUP.private_room).toBe('EVIDENCE_REQUIRED')
    expect(HARD_GROUP.wheelchair).toBe('EVIDENCE_REQUIRED')
    expect(HARD_GROUP.air_con).toBe('ASSUME_PRESENT')
    expect(HARD_GROUP.delivery).toBe('ROW_FLAG_BACKED')
  })
})

describe('classifyHardGaps — EVIDENCE_REQUIRED', () => {
  it('lexicon-backed constraint with evidence is supported; without evidence it is a gap', () => {
    const r = classifyHardGaps(['quiet', 'parking', 'vegetarian'], attrs)
    expect(r.gaps).toEqual(['vegetarian'])
    expect(r.assumed).toEqual([]); expect(r.contrary).toEqual([]); expect(r.rowBacked).toEqual([]); expect(r.unclassified).toEqual([])
  })
  it('a constraint the lexicon cannot read (private_room, wheelchair) is a gap — never skipped', () => {
    expect(classifyHardGaps(['private_room'], attrs).gaps).toEqual(['private_room'])
    expect(classifyHardGaps(['wheelchair'], attrs).gaps).toEqual(['wheelchair'])
  })
})

describe('classifyHardGaps — ASSUME_PRESENT', () => {
  it('air_con with no evidence either way produces NO gap (assumed)', () => {
    const r = classifyHardGaps(['air_con'], attrs, { texts })
    expect(r.gaps).toEqual([])
    expect(r.assumed).toEqual(['air_con'])
    expect(evidenceNote(r, 'vi')).toBeNull()
  })
  it('air_con with contrary fetched text is reported as contrary, not as a gap', () => {
    const t = new Map([['Quán nóng', ['Quán không có máy lạnh, ngồi nóng quá']]])
    const r = classifyHardGaps(['air_con'], extractAttributes(t), { texts: t })
    expect(r.gaps).toEqual([])
    expect(r.contrary).toEqual(['air_con'])
    expect(evidenceNote(r, 'vi')).toMatch(/KHONG co \/ kem: máy lạnh/)
  })
})

describe('classifyHardGaps — ROW_FLAG_BACKED', () => {
  it('delivery is vouched for by a row flag, otherwise a gap', () => {
    expect(classifyHardGaps(['delivery'], attrs, { rows: [{ has_delivery: true }] })).toMatchObject({ gaps: [], rowBacked: ['delivery'] })
    expect(classifyHardGaps(['delivery'], attrs, { rows: [{ has_order: true }] })).toMatchObject({ gaps: [], rowBacked: ['delivery'] })
    expect(classifyHardGaps(['delivery'], attrs, { rows: [{ has_delivery: false }, null, 'x'] })).toMatchObject({ gaps: ['delivery'], rowBacked: [] })
    expect(rowSupportedHards([{ has_delivery: false }])).toEqual([])
  })
})

describe('unclassified constraint', () => {
  afterEach(() => vi.restoreAllMocks())
  it('is treated as EVIDENCE_REQUIRED and logged with its value — once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(hardGroupOf('sauna_zzz')).toBe('EVIDENCE_REQUIRED')
    expect(hardGroupOf('sauna_zzz')).toBe('EVIDENCE_REQUIRED')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('"hard":"sauna_zzz"')
    const r = classifyHardGaps(['sauna_zzz' as Hard], attrs)
    expect(r.gaps).toEqual(['sauna_zzz'])
    expect(r.unclassified).toEqual(['sauna_zzz'])
  })
})

describe('evidenceNote + back-compat hardConstraintGaps', () => {
  it('names every gap in one sentence, vi and en', () => {
    const r = classifyHardGaps(['private_room', 'vegetarian'], attrs)
    expect(evidenceNote(r, 'vi')).toMatch(/bang chung ve: phòng riêng, món chay\. Noi ro trong MOT cau/)
    expect(evidenceNote(r, 'en')).toMatch(/evidence about: a private room, vegetarian options/)
  })
  it('hardConstraintGaps keeps its old signature', () => {
    expect(hardConstraintGaps(['quiet', 'parking', 'wheelchair', 'vegetarian'], attrs)).toEqual(['wheelchair', 'vegetarian'])
    expect(hardConstraintGaps(['delivery'], attrs, ['delivery'])).toEqual([])
    expect(hardConstraintGaps(['air_con'], attrs)).toEqual([])
  })
})
