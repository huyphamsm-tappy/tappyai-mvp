import { describe, it, expect } from 'vitest'
import { afterOutbound, agentCalendar, codeResolvedDate, priorDateFromHistory } from './prompt'

// UAT 2026-10-05 (B03). Today is Monday 05/10/2026. Outbound Saturday 17/10; the user then asks
// "còn chuyến về chủ nhật thì sao?". "chủ nhật" resolved to the NEAREST Sunday, 11/10, which is BEFORE the
// departure. A return leg must land on or after the outbound date; everything else keeps today's behaviour.
const NOW = new Date('2026-10-05T10:00:00+07:00')
const OUTBOUND = '2026-10-17'

describe('return-leg date never precedes the outbound', () => {
  it('codeResolvedDate: "chuyến về chủ nhật" after a Saturday 17/10 outbound is Sunday 18/10', () => {
    expect(codeResolvedDate('còn chuyến về chủ nhật thì sao?', NOW, OUTBOUND)).toBe('2026-10-18')
  })

  it('the calendar line given to the model says Sunday 18/10, not 11/10', () => {
    const cal = agentCalendar(NOW, 'còn chuyến về chủ nhật thì sao?', OUTBOUND)
    expect(cal).toContain('"chu nhat" = Chủ nhật 18/10/2026')
    expect(cal).not.toContain('11/10/2026"')
  })

  it('without an outbound date nothing changes (nearest Sunday 11/10)', () => {
    expect(codeResolvedDate('còn chuyến về chủ nhật thì sao?', NOW)).toBe('2026-10-11')
  })

  it('a non-return phrase is not shifted even when a flight is under discussion', () => {
    expect(codeResolvedDate('còn chuyến chủ nhật thì sao?', NOW, OUTBOUND)).toBe('2026-10-11')
    expect(codeResolvedDate('thứ 3 tuần sau bay Đà Nẵng', NOW, OUTBOUND)).toBe('2026-10-13')
  })

  it('an explicit later return stays as the user said it', () => {
    expect(codeResolvedDate('chuyến về chủ nhật tuần sau', NOW, OUTBOUND)).toBe('2026-10-18')
    expect(codeResolvedDate('chuyến về thứ 2 tuần sau', NOW, OUTBOUND)).toBe('2026-10-19')
  })

  it('afterOutbound: khứ hồi / chiều về cues, same-day allowed, bad outbound ignored', () => {
    expect(afterOutbound('2026-10-11', 'khứ hồi chủ nhật', OUTBOUND)).toBe('2026-10-18')
    expect(afterOutbound('2026-10-10', 'chiều về thứ 7', OUTBOUND)).toBe('2026-10-17')
    expect(afterOutbound('2026-10-11', 'chuyến về chủ nhật', 'not-a-date')).toBe('2026-10-11')
    expect(afterOutbound(undefined, 'chuyến về chủ nhật', OUTBOUND)).toBeUndefined()
  })

  it('with no saved session state the outbound comes from the earlier user messages (the live B03 conversation)', () => {
    const history = ['bay Sài Gòn Phú Quốc thứ 7 tuần sau', 'còn chuyến về chủ nhật thì sao?']
    const outbound = priorDateFromHistory(history, NOW)
    expect(outbound).toBe('2026-10-17')
    expect(codeResolvedDate(history[1], NOW, outbound)).toBe('2026-10-18')
  })

  it('priorDateFromHistory skips the current turn and returns nothing when no earlier turn names a day', () => {
    expect(priorDateFromHistory(['còn chuyến về chủ nhật thì sao?'], NOW)).toBeUndefined()
    expect(priorDateFromHistory(['xin chào', 'còn chuyến về chủ nhật thì sao?'], NOW)).toBeUndefined()
    expect(priorDateFromHistory([], NOW)).toBeUndefined()
  })
})
