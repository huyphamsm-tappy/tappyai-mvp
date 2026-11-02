// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { relativeDateIso } from './consultative/consultTravel'
import { agentCalendar } from './agent/prompt'
import { agentSystemV2For } from './agent/runtime/consultativeVoice'

// Round 23 item 2 (read-only investigation → characterisation, nothing changed): what "cuối tuần" / "cuối tuần sau" resolve to, from the system date.
// 2026-10-12 is a MONDAY (GMT+7). The code reads "cuối tuần sau" as the weekend of NEXT calendar week (Mon→Sun weeks), not "the weekend after the coming one".
const at = (isoVn: string) => new Date(`${isoVn}T10:00:00+07:00`)

describe('"cuối tuần" / "cuối tuần sau" from each weekday (system date → Saturday of the weekend the code picks)', () => {
  it('Monday 12/10/2026: this weekend = Sat 17/10, "cuối tuần sau" = Sat 24/10 (so a 3-day trip is 24–26/10)', () => {
    expect(relativeDateIso('cuối tuần', at('2026-10-12'))).toBe('2026-10-17')
    expect(relativeDateIso('cuối tuần này', at('2026-10-12'))).toBe('2026-10-17')
    expect(relativeDateIso('cuối tuần sau', at('2026-10-12'))).toBe('2026-10-24')
    expect(relativeDateIso('cuối tuần tới', at('2026-10-12'))).toBe('2026-10-24')
  })
  it('Friday 16/10 → this weekend Sat 17/10, next Sat 24/10', () => {
    expect(relativeDateIso('cuối tuần này', at('2026-10-16'))).toBe('2026-10-17')
    expect(relativeDateIso('cuối tuần sau', at('2026-10-16'))).toBe('2026-10-24')
  })
  it('Saturday 17/10 → "cuối tuần" is today; "cuối tuần sau" is the next Saturday 24/10', () => {
    expect(relativeDateIso('cuối tuần', at('2026-10-17'))).toBe('2026-10-17')
    expect(relativeDateIso('cuối tuần sau', at('2026-10-17'))).toBe('2026-10-24')
  })
  it('Sunday 18/10 → "cuối tuần" is today (Sunday); "cuối tuần sau" is Sat 24/10', () => {
    expect(relativeDateIso('cuối tuần', at('2026-10-18'))).toBe('2026-10-18')
    expect(relativeDateIso('cuối tuần sau', at('2026-10-18'))).toBe('2026-10-24')
  })
  it('the calendar block the model receives states the resolved day for the phrase', () => {
    const cal = agentCalendar(at('2026-10-12'), 'lên kế hoạch đi Nha Trang 3 ngày 2 đêm cuối tuần sau')
    expect(cal).toContain('"cuoi tuan sau" = Thứ bảy 24/10/2026')
    expect(cal).toContain('Thứ hai 12/10')
  })
})

describe('prompt-only behaviours (no code path to unit-test): the instruction is present when the flag is on and absent when off', () => {
  const on = agentSystemV2For(true)
  const off = agentSystemV2For(false)
  it('Tesla: a count about a person / organisation / product ("bao nhiêu bằng sáng chế") forces web_search', () => {
    expect(on).toContain('bao nhiêu bằng sáng chế')
    expect(off).not.toContain('bao nhiêu bằng sáng chế')
  })
  it('xưng hô: tui/ông is answered with tui/ông, mình/bạn with mình/bạn', () => {
    expect(on).toContain('họ nói "tui/ông" thì đáp "tui/ông", nói "mình/bạn" thì đáp "mình/bạn"')
    expect(off).not.toContain('họ nói "tui/ông"')
  })
})
