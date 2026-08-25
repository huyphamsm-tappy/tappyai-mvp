import { describe, it, expect } from 'vitest'
import { buildSystem, FIRST_REPLY_WORD_CAP, CONTEXT_REPLY_WORD_CAP } from './promptBuilder'

// ── A shorter reply must still be a DECISION ────────────────────────────────
//
// Cutting a word cap is the easy half. The risk is the half nobody sees: under
// pressure a model sheds whatever is cheapest to cut, and the cheapest thing to
// cut is the reasoning — the one part that cannot be re-rendered from the
// structured card the UI already draws. A cap on its own would buy latency by
// quietly turning "here is what I recommend and why" into a shorter list.
//
// So these tests assert the SHAPE survives the cut, not just that the number
// moved. Every rule here is one the owner named as non-removable.

/** Flatten whatever buildSystem returns into the full prompt text. */
function prompt(...args: Parameters<typeof buildSystem>): string {
  const p = buildSystem(...args)
  if (typeof p === 'string') return p
  return Object.values(p as Record<string, unknown>).filter(v => typeof v === 'string').join('\n')
}

const FIRST = () => prompt(null, 'unknown', true, '', 'vi', '', null, null, false)
const CONTEXT = () => prompt(null, 'unknown', false, '', 'vi', '', null, null, false)

describe('the prose budget actually shrank', () => {
  it('halves the first-reply cap from the measured 150', () => {
    // 150 was the cap while prod measured 142 words (shopping) and 183 (food).
    expect(FIRST_REPLY_WORD_CAP).toBeLessThanOrEqual(100)
    expect(FIRST_REPLY_WORD_CAP).toBeGreaterThan(0)
  })

  it('halves the with-context cap from the measured 250', () => {
    expect(CONTEXT_REPLY_WORD_CAP).toBeLessThanOrEqual(160)
    expect(CONTEXT_REPLY_WORD_CAP).toBeGreaterThan(FIRST_REPLY_WORD_CAP)
  })

  it('states the new cap in the prompt the model actually reads', () => {
    // `toContain(String(cap))` alone is too weak — "90" appears in prices and
    // URLs. Anchor it to the sentence that carries the instruction.
    expect(FIRST()).toMatch(new RegExp(`toi da ${FIRST_REPLY_WORD_CAP} tu`))
    expect(CONTEXT()).toMatch(new RegExp(`toi da ${CONTEXT_REPLY_WORD_CAP} tu`))
  })

  it('no longer states the old cap for its own turn type', () => {
    // The regression that matters: leaving the old sentence in place beside the
    // new one, so the model sees two contradictory limits.
    //
    // Checked PER TURN TYPE, not across both: the new with-context cap (150)
    // is numerically the old first-reply cap, so a blanket "150 must not
    // appear" would fail on a correct prompt.
    expect(FIRST(), 'first reply must no longer say 150').not.toMatch(/toi da 150 tu/)
    expect(CONTEXT(), 'with-context must no longer say 250').not.toMatch(/toi da 250 tu/)
  })

  it('states exactly one cap per turn type', () => {
    const caps = (t: string) => (t.match(/toi da \d+ tu/g) || [])
    expect(caps(FIRST())).toEqual([`toi da ${FIRST_REPLY_WORD_CAP} tu`])
    expect(caps(CONTEXT())).toEqual([`toi da ${CONTEXT_REPLY_WORD_CAP} tu`])
  })
})

describe('what must survive the cut — every element the owner named', () => {
  const REQUIRED: Array<[string, RegExp]> = [
    ['recommendation comes first', /CHON TRUOC/],
    ['grounded reasons', /LY DO[\s\S]{0,80}CO CAN CU/],
    ['a real trade-off', /DANH DOI/],
    ['rejected alternatives', /LUA CHON KHAC/],
    ['reasons are tool-grounded, not invented', /tu ket qua tool/],
  ]

  it.each(REQUIRED)('%s — present in the first-reply prompt', (_label, re) => {
    expect(FIRST()).toMatch(re)
  })

  it.each(REQUIRED)('%s — present in the with-context prompt', (_label, re) => {
    // A follow-up is where a shorter reply is most tempting to flatten into a
    // one-liner. The shape rules must apply to BOTH turns, not just the first.
    expect(CONTEXT()).toMatch(re)
  })

  it('keeps alternatives as names + why-not, not as a dropped section', () => {
    expect(FIRST()).toMatch(/LUA CHON KHAC[\s\S]{0,120}KHONG chon/)
  })
})

describe('what the cut is supposed to remove', () => {
  it('forbids restating the result rows as a catalogue in prose', () => {
    expect(FIRST()).toMatch(/CAM[\s\S]{0,160}liet ke lai tung dong/)
  })

  it('forbids repeating a number more than once', () => {
    expect(FIRST()).toMatch(/Moi con so chi noi DUNG 1 LAN/)
  })

  it('forbids re-describing data the UI card already renders', () => {
    expect(FIRST()).toMatch(/du lieu ma the giao dien da hien thi/)
  })
})

describe('rules that were already load-bearing are untouched', () => {
  it('still excludes the CTA block from the word count', () => {
    // The cap counts DISPLAYED prose. If the CTA carve-out ever disappears, a
    // tighter cap starts truncating machine blocks — which is a correctness bug,
    // not a brevity win.
    for (const text of [FIRST(), CONTEXT()]) {
      expect(text).toMatch(/KHONG tinh block \[CTA_BUTTONS\]/)
    }
  })

  it('still tells the model the system injects photos and links', () => {
    for (const text of [FIRST(), CONTEXT()]) {
      expect(text).toMatch(/HE THONG tu chen/)
    }
  })

  it('still asks for a closing follow-up question', () => {
    expect(FIRST()).toMatch(/follow-up question/)
    expect(CONTEXT()).toMatch(/follow-up question/)
  })

  it('keeps both word-limit section markers', () => {
    expect(FIRST()).toContain('WORD LIMIT - REPLY DAU TIEN')
    expect(CONTEXT()).toContain('WORD LIMIT - CO CONTEXT')
  })
})
