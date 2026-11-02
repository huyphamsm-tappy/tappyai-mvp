// @vitest-environment node
// Owner UAT 02/11 (approved, option a): "Hỏi spa cho Nam có gợi ý giá tiền thông tin các kiểu, nhưng card lại không có thông tin mà tappy
// đề xuất". The answer told why each spa and what it costs (from the web it read); the cards carried only the map's name, stars and address.
// Each card the answer names now carries what the answer said about it - the model's own words right after its bold name, figures and
// all (they are the guarded prose itself), links removed - on every named card, not only the first.
import { describe, it, expect } from 'vitest'
import { rankingFromProse } from './proseRanking'
import { applyRankingToRecs } from '@/lib/ai/agent/runtime/rankingContract'
import type { Recommendation } from '@/lib/recommendation/recommendation'

const SPA_ANSWER = [
  'Nếu muốn đúng kiểu spa cho nam thì mình nghiêng về **3.SOME Spa For Men**; còn ưu tiên đánh giá cao thì **CHARM SPA Garden** cũng đáng cân nhắc.',
  '',
  '- **3.SOME Spa For Men**: Spa chuyên cho nam, ở 29/5 Nguyễn Bỉnh Khiêm, mở 11:00–22:00; Google Maps ghi 4,7/5 từ 880 đánh giá. [Google Maps](https://maps.google.com/x) · [BookingCare](https://bookingcare.vn/y)',
  '- **CHARM SPA Garden**: 116 Trần Đình Xu, mở 10:00–00:00; gói gội đầu & massage trên Klook hiện 585.000đ. [Klook](https://www.klook.com/z)',
].join('\n')
const SPAS = [{ name: '3.SOME Spa For Men' }, { name: 'CHARM SPA Garden' }, { name: 'Spa Khác Quận 1' }]

describe('a named card carries what the answer said about it', () => {
  it('the words after the name on its own line, figures kept, links and markup removed', () => {
    const c = rankingFromProse(SPA_ANSWER, SPAS)!
    expect(c.picks.map(p => p.name)).toEqual(['3.SOME Spa For Men', 'CHARM SPA Garden'])
    expect(c.picks[0].said).toBe('Spa chuyên cho nam, ở 29/5 Nguyễn Bỉnh Khiêm, mở 11:00–22:00; Google Maps ghi 4,7/5 từ 880 đánh giá.')
    expect(c.picks[1].said).toBe('116 Trần Đình Xu, mở 10:00–00:00; gói gội đầu & massage trên Klook hiện 585.000đ.')
  })
  it('a name only mentioned in passing (no line of its own) says nothing more', () => {
    const c = rankingFromProse('Mình chọn **CHARM SPA Garden** vì yên tĩnh.', SPAS)!
    expect(c.picks[0].said).toBeNull()
  })
  it('every named card shows it as its reason, the first one crowned as before', () => {
    const recs = SPAS.map((s, i) => ({ entity: { id: `p${i}`, identity: { name: s.name } }, rank: i, recommended: false, reasons: [], tradeOff: null } as unknown as Recommendation))
    const applied = applyRankingToRecs(recs, rankingFromProse(SPA_ANSWER, SPAS)!)!
    expect(applied.items.map(r => r.recommended)).toEqual([true, false])
    expect(applied.items[0].reasons).toEqual([{ attribute: 'rationale', evidence: 'Spa chuyên cho nam, ở 29/5 Nguyễn Bỉnh Khiêm, mở 11:00–22:00; Google Maps ghi 4,7/5 từ 880 đánh giá.' }])
    expect(applied.items[1].reasons).toEqual([{ attribute: 'rationale', evidence: '116 Trần Đình Xu, mở 10:00–00:00; gói gội đầu & massage trên Klook hiện 585.000đ.' }])
  })
})
