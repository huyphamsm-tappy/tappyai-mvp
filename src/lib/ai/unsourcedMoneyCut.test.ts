// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { shieldSupported, type GuardEvidence, type GuardSource } from './guardEvidence'

// Petrol, live 2026-10-11: the evidence guard labelled "28.250 / 29.050 đồng/lít [S1]" as "cited value not in source" and only the other guards
// decided (they kept it). With CONSULTATIVE_IN_AGENT a cited money amount that NO page of the turn states is cut; one a page states stays.

const PAGE: GuardSource = {
  id: 'S1', host: 'vnexpress.net', sourceType: 'news',
  passages: ['Từ 15h chiều nay, xăng E10 RON 95-III giá bán lẻ tối đa 28.250 đồng một lít, E10 RON 95-V là 29.050 đồng một lít.'],
}
const OTHER: GuardSource = { id: 'S2', host: 'petrolimex.com.vn', sourceType: 'official', passages: ['Dầu diesel 0,05S giá 19.800 đồng một lít.'] }
const ev = (sources: GuardSource[]): GuardEvidence => ({ sources, conflicts: [], carried: [], constraintsSig: null, userText: '' })
const run = (text: string, sources: GuardSource[], on: boolean, retrievedTexts: string[] = []) => { const s = shieldSupported(text, ev(sources), { cutUnsourcedMoney: on, retrievedTexts }); return { out: s.restore(s.text), report: s.report } }

describe('a cited money amount no page states is cut (flag on)', () => {
  const FAKE = 'Hôm nay xăng RON 95 giá 31.500 đồng/lít [S1]. Giá có thể khác theo khu vực.'
  it('the amount is in NO read page → the sentence goes, the unrelated sentence stays', () => {
    const { out, report } = run(FAKE, [PAGE, OTHER], true)
    expect(out).not.toContain('31.500')
    expect(out).toContain('Giá có thể khác theo khu vực')
    expect(report.reasons.unsourced_money_cut).toBe(1)
  })
  it('the amount IS stated by a read page → kept (both directions)', () => {
    const REAL = 'Hôm nay xăng E10 RON 95-III giá 28.250 đồng/lít [S1].'
    const { out, report } = run(REAL, [PAGE, OTHER], true)
    expect(out).toContain('28.250')
    expect(report.reasons.unsourced_money_cut ?? 0).toBe(0)
  })
  it('the amount is in ANOTHER read page than the cited one → kept (that is a misattribution the marker rule handles, not a made-up figure)', () => {
    const { out } = run('Dầu diesel giá 19.800 đồng/lít [S1].', [PAGE, OTHER], true)
    expect(out).toContain('19.800')
  })
  it('the amount is in no read page but a retrieved SEARCH SNIPPET states it → kept (Philips kettle, live 2026-10-11: the page holds only 8 passages)', () => {
    const text = 'Philips HD9350 giá 895.000 đồng tại Điện Máy Xanh [S1].'
    expect(run(text, [PAGE], true, ['Ấm đun siêu tốc Philips HD9350/90 1.7 lít - 895.000đ - Điện máy XANH']).out).toContain('895.000')
    expect(run(text, [PAGE], true, ['Ấm Philips HD9350 giá liên hệ']).out).not.toContain('895.000') // no snippet states it → cut
  })
  it('CONTROL — flag off: the made-up amount is NOT cut here (labelled only, as before)', () => {
    const { out } = run(FAKE, [PAGE, OTHER], false)
    expect(out).toContain('31.500')
  })
})
