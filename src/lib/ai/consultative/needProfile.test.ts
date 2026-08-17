import { describe, it, expect } from 'vitest'
import { deriveNeedProfile, type NeedProfile } from './needProfile'

// ── NP-01…06 — Phase 2 Need Profile contract ────────────────────────────────
//
// These assert STATE CONTINUITY across turns, never field existence. A test that
// only checked `budget.max === 35_000_000` after turn 4 would pass while every
// other constraint was silently dropped — the exact failure the contract forbids.
//
// The profile is derived per turn by folding the whole `messages[]` array. There
// is no table, no migration, no persistence: all three clients already send the
// full history, and refinement IS "fold the history".

/** Build the message array a client would send after N user turns, with an
 *  assistant turn interleaved — a refinement needs something to refine. */
function turns(...userMessages: string[]): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = []
  for (const [i, content] of userMessages.entries()) {
    out.push({ role: 'user', content })
    if (i < userMessages.length - 1) out.push({ role: 'assistant', content: 'Đây là vài lựa chọn cho bạn.' })
  }
  return out
}

const weightOf = (p: NeedProfile, key: string) => p.priorities.find(x => x.key === key)?.weight

// Continuity is asserted on `budgetStated` — the amount the user actually said —
// not on `budget.max`. `budget` keeps the SHIPPED Budget semantics untouched
// (`around` still widens ±20%, which is what applyBudgetFilter and the hotel tool
// description already depend on), so `max` is 36M for a stated 30M and comparing
// it across phrasings would compare tolerances rather than intent.

// ── The EN scenario, built up one turn at a time ────────────────────────────
const EN_1 = 'I need a laptop around 30M VND for coding and AI.'
const EN_2 = 'I travel frequently.'
const EN_3 = 'Battery is more important than GPU.'
const EN_4 = 'Actually increase my budget to 35M.'

// ── The VI scenario — the SAME decision, expressed natively ────────────────
const VI_1 = 'Mình cần laptop khoảng 30 triệu để code và làm AI.'
const VI_2 = 'Mình hay đi công tác.'
const VI_3 = 'Pin quan trọng hơn GPU.'
const VI_4 = 'Thôi nâng ngân sách lên 35 triệu.'

describe('NP-01 — a first turn produces a structured need', () => {
  const p = deriveNeedProfile(turns(EN_1))

  it('extracts the budget from an ENGLISH phrasing — "around 30M VND"', () => {
    // Discovered in Phase 3: the shipped extractBudget is Vietnamese-only. Its
    // units are k|tr|trieu|ngan|nghin (no M, no "million") and its markers are
    // tu/den, duoi/khong qua/toi da, tam/khoang/xap xi (no around/under/up to).
    // An English budget request therefore carried NO budget into the budget
    // block or applyBudgetFilter — part of why 14-en measured 0/3 in the corpus.
    expect(p.budget).not.toBeNull()
    expect(p.budgetStated).toBe(30_000_000)
  })

  it('keeps the shipped Budget semantics — "around" still widens ±20%', () => {
    expect(p.budget!.type).toBe('around')
    expect(p.budget!.max).toBe(36_000_000)
    expect(p.budget!.min).toBe(24_000_000)
  })

  it('extracts the subject being chosen', () => {
    expect(p.subject).toBe('laptop')
  })

  it('extracts BOTH use cases, not just the first', () => {
    expect(p.useCases).toContain('coding')
    expect(p.useCases).toContain('ai')
  })

  it('routes to the shopping domain', () => {
    expect(p.domain).toBe('shopping')
  })

  it('records provenance — one user turn observed', () => {
    expect(p.turnsObserved).toBe(1)
  })
})

describe('NP-02 — a preference turn ADDS without destroying', () => {
  const p = deriveNeedProfile(turns(EN_1, EN_2))

  it('every NP-01 field survives', () => {
    expect(p.budgetStated).toBe(30_000_000)
    expect(p.subject).toBe('laptop')
    expect(p.useCases).toEqual(expect.arrayContaining(['coding', 'ai']))
    expect(p.domain).toBe('shopping')
  })

  it('gains a portability priority from "I travel frequently"', () => {
    expect(weightOf(p, 'portability')).toBeGreaterThan(0)
  })

  it('counts both turns', () => {
    expect(p.turnsObserved).toBe(2)
  })
})

describe('NP-03 — a comparative reorders priorities and keeps everything else', () => {
  const p = deriveNeedProfile(turns(EN_1, EN_2, EN_3))

  it('battery now outweighs gpu — the comparative is DIRECTIONAL', () => {
    expect(weightOf(p, 'battery')).toBeDefined()
    expect(weightOf(p, 'gpu')).toBeDefined()
    expect(weightOf(p, 'battery')!).toBeGreaterThan(weightOf(p, 'gpu')!)
  })

  it('budget, subject, use cases and the travel priority ALL survive', () => {
    expect(p.budgetStated).toBe(30_000_000)
    expect(p.subject).toBe('laptop')
    expect(p.useCases).toEqual(expect.arrayContaining(['coding', 'ai']))
    expect(weightOf(p, 'portability')).toBeGreaterThan(0)
  })
})

describe('NP-04 — a budget change changes EXACTLY ONE field', () => {
  const before = deriveNeedProfile(turns(EN_1, EN_2, EN_3))
  const p = deriveNeedProfile(turns(EN_1, EN_2, EN_3, EN_4))

  it('the budget updates', () => {
    expect(p.budgetStated).toBe(35_000_000)
    // "increase my budget to 35M" states a CEILING, not a midpoint — it must not
    // be widened to 42M the way "around 35M" would be.
    expect(p.budget!.max).toBe(35_000_000)
    expect(p.budget!.type).toBe('under')
  })

  it('"Actually" does NOT read as a task switch — the subject is unchanged', () => {
    expect(p.subject).toBe('laptop')
    expect(p.domain).toBe('shopping')
  })

  it('use cases survive a budget change', () => {
    expect(p.useCases).toEqual(expect.arrayContaining(['coding', 'ai']))
  })

  it('BOTH priorities survive — travel and battery>gpu', () => {
    expect(weightOf(p, 'portability')).toBeGreaterThan(0)
    expect(weightOf(p, 'battery')!).toBeGreaterThan(weightOf(p, 'gpu')!)
  })

  it('nothing OTHER than the budget moved — asserted field by field', () => {
    // The strongest form of the continuity claim: everything except `budget`,
    // `turnsObserved` and the budget's own change-stamp is byte-identical.
    expect({ ...p, budget: null, budgetStated: null, turnsObserved: 0, changedAtTurn: {} })
      .toEqual({ ...before, budget: null, budgetStated: null, turnsObserved: 0, changedAtTurn: {} })
  })
})

describe('NP-05 — Vietnamese produces the SAME profile as English', () => {
  const en = deriveNeedProfile(turns(EN_1, EN_2, EN_3, EN_4))
  const vi = deriveNeedProfile(turns(VI_1, VI_2, VI_3, VI_4))

  it('same budget — VI "nâng ngân sách lên 35 triệu" is also a ceiling', () => {
    expect(vi.budgetStated).toBe(35_000_000)
    expect(vi.budget!.max).toBe(35_000_000)
  })

  it('same subject and domain', () => {
    expect(vi.subject).toBe('laptop')
    expect(vi.domain).toBe('shopping')
  })

  it('same use cases', () => {
    expect(vi.useCases).toEqual(expect.arrayContaining(['coding', 'ai']))
  })

  it('same priority ordering — "Pin quan trọng hơn GPU" is directional too', () => {
    expect(weightOf(vi, 'battery')!).toBeGreaterThan(weightOf(vi, 'gpu')!)
    expect(weightOf(vi, 'portability')).toBeGreaterThan(0)
  })

  it('the two languages agree on every ranking-relevant field', () => {
    const strip = (p: NeedProfile) => ({
      domain: p.domain,
      subject: p.subject,
      budgetStated: p.budgetStated,
      budgetMax: p.budget?.max,
      budgetType: p.budget?.type,
      useCases: [...p.useCases].sort(),
      priorities: [...p.priorities].map(x => `${x.key}:${x.weight}`).sort(),
      mustHave: [...p.mustHave].sort(),
      avoid: [...p.avoid].sort(),
    })
    expect(strip(vi)).toEqual(strip(en))
  })
})

describe('NP-06 — a genuine task switch RESETS, it does not inherit', () => {
  const p = deriveNeedProfile(turns(EN_1, EN_2, EN_3, EN_4, 'Actually, help me find a hotel in Da Nang instead.'))

  it('switches domain', () => {
    expect(p.domain).toBe('hotel')
  })

  it('does NOT carry the laptop budget into the hotel task', () => {
    // 35M is a laptop budget. Inheriting it as a hotel budget would silently
    // pass every hotel in Da Nang through the hard filter — an invisible defect.
    expect(p.budgetStated).not.toBe(35_000_000)
  })

  it('does NOT carry laptop use cases or GPU/battery priorities', () => {
    expect(p.useCases).not.toContain('coding')
    expect(weightOf(p, 'gpu')).toBeUndefined()
    expect(weightOf(p, 'battery')).toBeUndefined()
  })

  it('picks up the new location', () => {
    expect((p.location.text || '').toLowerCase()).toContain('da nang')
  })

  it('the VI equivalent resets too', () => {
    const v = deriveNeedProfile(turns(VI_1, VI_2, VI_3, VI_4, 'Thôi tìm giúp mình khách sạn ở Đà Nẵng đi.'))
    expect(v.domain).toBe('hotel')
    expect(v.useCases).not.toContain('coding')
  })
})

describe('precision-first — silence beats a false signal', () => {
  it('an ordinary request yields an empty-but-valid profile, never a throw', () => {
    const p = deriveNeedProfile(turns('Chào bạn'))
    expect(p.priorities).toEqual([])
    expect(p.mustHave).toEqual([])
    expect(p.budget).toBeNull()
  })

  it('never throws on odd input', () => {
    for (const odd of [[], [{ role: 'assistant', content: 'hi' }], [{ role: 'user', content: '' }]]) {
      expect(() => deriveNeedProfile(odd as Array<{ role: string; content: string }>)).not.toThrow()
    }
  })

  it('is a pure fold — the same messages always give the same profile', () => {
    const a = deriveNeedProfile(turns(EN_1, EN_2, EN_3, EN_4))
    const b = deriveNeedProfile(turns(EN_1, EN_2, EN_3, EN_4))
    expect(a).toEqual(b)
  })

  it('reads USER turns only — an assistant message cannot set a constraint', () => {
    const withAssistantNoise = [
      { role: 'user', content: EN_1 },
      { role: 'assistant', content: 'I travel frequently and battery is more important than GPU.' },
    ]
    const p = deriveNeedProfile(withAssistantNoise)
    expect(weightOf(p, 'portability')).toBeUndefined()
    expect(weightOf(p, 'battery')).toBeUndefined()
  })
})

describe('durable preferences are a LOW-WEIGHT prior, never an override', () => {
  it('a stored cuisine preference cannot outrank what the user just said', () => {
    const p = deriveNeedProfile(turns('Mình muốn ăn đồ Nhật ở Quận 1'), {
      storedPreferences: { cuisine_likes: ['korean'] },
    })
    const korean = p.priorities.find(x => x.key === 'cuisine:korean')
    const japanese = p.priorities.find(x => x.key === 'cuisine:japanese')
    expect(japanese, 'the current turn must be represented').toBeDefined()
    if (korean) expect(korean.weight).toBeLessThan(japanese!.weight)
    if (korean) expect(korean.source).toBe('preference')
  })

  it('a stored dietary restriction becomes a HARD avoid, not a soft priority', () => {
    const p = deriveNeedProfile(turns('Gợi ý quán ăn ngon ở Quận 1'), {
      storedPreferences: { dietary_restrictions: 'ăn chay' },
    })
    expect(p.avoid).toContain('non-vegetarian')
  })
})
