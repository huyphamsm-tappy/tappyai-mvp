// Unwind step 3 (28/10/2026): freshness (S3A), length / shape / no pick frame on a non-pick turn (S3B), 3-4 options on a pick (S3C).
// Every flag OFF = HEAD 7e60081.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unwindWritingBlock, UNWIND_PICK_ROWS, UNWIND_PICK_ALTERNATIVES, UNWIND_MAX_TOKENS, UNWIND_MAX_SENTENCES } from './unwindWriting'
import { consultUnwindS3aOn, consultUnwindS3bOn, consultUnwindS3cOn, CONSULT_UNWIND_S3A_FLAG, CONSULT_UNWIND_S3B_FLAG, CONSULT_UNWIND_S3C_FLAG } from '@/lib/config/consultFlags'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('step 3 flags: exactly "1", never in production', () => {
  for (const [name, on] of [[CONSULT_UNWIND_S3A_FLAG, consultUnwindS3aOn], [CONSULT_UNWIND_S3B_FLAG, consultUnwindS3bOn], [CONSULT_UNWIND_S3C_FLAG, consultUnwindS3cOn]] as const) {
    it(name, () => {
      expect(on({})).toBe(false)
      expect(on({ [name]: 'true' })).toBe(false)
      expect(on({ [name]: '1' })).toBe(true)
      expect(on({ [name]: '1', VERCEL_ENV: 'production' })).toBe(false)
    })
  }
})

describe('the writing block', () => {
  const off = { writing: false, nonPick: false, wideShortlist: false, lang: 'vi' }
  it('every flag off: empty (the prompt is HEAD)', () => {
    expect(unwindWritingBlock(off)).toBe('')
    expect(unwindWritingBlock({ ...off, nonPick: true })).toBe('')
  })
  it('S3A: today, the source date, "chưa rõ ngày", the age judged against the question', () => {
    const b = unwindWritingBlock({ ...off, freshToday: '2026-10-28' })
    expect(b).toContain('hom nay la 2026-10-28')
    expect(b).toContain('published_at / date / age_days')
    expect(b).toContain('chua ro ngay')
    expect(b).toContain('nguon cu thi noi ro do cu')
    expect(b).not.toContain('Do dai theo do kho')
  })
  it('S3B: length by difficulty, headings / table / list, figures only from this turn, one caveat, one question', () => {
    const b = unwindWritingBlock({ ...off, writing: true })
    expect(b).toContain('GHI DE')
    expect(b).toContain('Do dai theo do kho')
    expect(b).toContain('bang hoac danh sach')
    expect(b).toContain('chi lay tu ket qua cong cu / trang da doc cua luot nay')
    expect(b).toContain('MOT cau hoi tiep')
    expect(b).not.toContain('Mình chọn')
  })
  it('S3B on a turn that picks nothing: no "Mình chọn"', () => {
    expect(unwindWritingBlock({ ...off, writing: true, nonPick: true })).toContain('KHONG viet cau "Mình chọn: ..."')
  })
  it('S3C: 3-4 options with price, hours and address when the data has them', () => {
    expect(unwindWritingBlock({ ...off, wideShortlist: true })).toContain('3-4 lua chon')
  })
  it('the limits are what the report states', () => {
    expect([UNWIND_PICK_ROWS, UNWIND_PICK_ALTERNATIVES, UNWIND_MAX_TOKENS, UNWIND_MAX_SENTENCES]).toEqual([4, 3, 4000, 20])
  })
})

describe('wiring', () => {
  it('route: the block goes after the voice layer on both prompt builds; the flags pick its parts', () => {
    const src = read('src/app/api/chat/route.ts')
    expect(src).toContain('+ styleBlock + voiceLayerBlock() + shareContextBlock + unwindWriting')
    expect(src).toContain('...w3.extra, unwindWriting],')
    expect(src).toContain("...(consultUnwindS3aOn() ? { freshToday: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) } : {}),")
    expect(src).toContain('writing: consultUnwindS3bOn(),')
    expect(src).toContain("nonPick: !consult || consult.turn === 'chat',")
    expect(src).toContain("wideShortlist: consultUnwindS3cOn() && !!consult && ['pick', 'more', 'reject'].includes(consult.turn),")
  })
  it('route: S3C rows and S3B ceiling (HEAD values when off)', () => {
    const src = read('src/app/api/chat/route.ts')
    expect(src).toContain('const consultTopRows = consultUnwindS3cOn() ? UNWIND_PICK_ROWS : 3')
    expect(src.match(/consultTop: consultTopRows/g)?.length).toBe(2)
    expect(src).not.toContain('consultTop: 3')
    expect(src).toContain('unwindToolTurnCeiling = consultUnwindS3bOn() && !!tools ? UNWIND_MAX_TOKENS : null')
    expect(src.match(/w3Structured \? levelLimits\.structuredMaxTokens : unwindToolTurnCeiling \?\? 2048/g)?.length).toBe(2)
  })
  it('streamEnrichment: the prose-shape guard keeps 3 alternatives / 20 sentences only with the flags', () => {
    const src = read('src/lib/ai/streamEnrichment.ts')
    expect(src).toContain('maxAlternatives: consultUnwindS3cOn() ? UNWIND_PICK_ALTERNATIVES : 2, maxSentences: consultUnwindS3bOn() ? UNWIND_MAX_SENTENCES : adviceEnabled() ? 13 : 9')
  })
})
