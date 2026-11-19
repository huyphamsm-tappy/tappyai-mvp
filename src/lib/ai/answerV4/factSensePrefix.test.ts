// Final UAT 19/11: card points and table cells showed the check's own prefix: "Elon Musk: Doanh nghiệp - Sáng lập SpaceX", "Hàn Quốc: Cấu trúc - Thứ bậc và thâm niên rõ".
// The check asks about claims written "Name: label - fact"; when it trims a claim it hands the trimmed claim back, prefix included, and that text replaced the point.
import { describe, it, expect } from 'vitest'
import { verifyDeclaredFacts } from './factSense'

const presentation = () => ({
  v: 1,
  blocks: [
    { id: 'p1', type: 'profiles', items: [{ name: 'Elon Musk', points: [{ lead: 'Doanh nghiệp', text: 'Sáng lập SpaceX năm 2002 và nhiều công ty khác' }, { lead: 'Xe điện', text: 'CEO Tesla từ năm 2008' }] }] },
    { id: 'c1', type: 'compare', columns: ['Nhật Bản', 'Hàn Quốc'], rows: [{ label: 'Cấu trúc', cells: ['Đồng thuận', 'Thứ bậc và thâm niên rõ rệt trong công ty'] }] },
  ],
}) as never

describe('verifyDeclaredFacts: a trimmed claim does not carry the check\'s prefix into the card or the table', () => {
  it('strips "Name: label - " from a trimmed point and from a trimmed cell, keeps untouched ones as written', async () => {
    const check = async (claims: string[]) => claims.map((c, i) => (i === 0 ? c.replace('năm 2002 và nhiều công ty khác', 'năm 2002') : i === 3 ? c.replace(' rõ rệt trong công ty', ' rõ') : true))
    const out = await verifyDeclaredFacts(presentation(), 'evidence', check)
    const blocks = (out as unknown as { blocks: Array<{ type: string; items?: Array<{ points: Array<{ text: string }> }>; rows?: Array<{ cells: string[] }> }> }).blocks
    expect(blocks[0].items![0].points.map(p => p.text)).toEqual(['Sáng lập SpaceX năm 2002', 'CEO Tesla từ năm 2008'])
    expect(blocks[1].rows![0].cells).toEqual(['Đồng thuận', 'Thứ bậc và thâm niên rõ'])
  })
  it('a trimmed text that does not start with the prefix (the check already dropped it) is kept as given', async () => {
    const check = async (claims: string[]) => claims.map((_, i) => (i === 1 ? 'CEO Tesla' : true))
    const out = await verifyDeclaredFacts(presentation(), 'evidence', check)
    const blocks = (out as unknown as { blocks: Array<{ items?: Array<{ points: Array<{ text: string }> }> }> }).blocks
    expect(blocks[0].items![0].points[1].text).toBe('CEO Tesla')
  })
  it('a fully supported claim comes back unchanged', async () => {
    const out = await verifyDeclaredFacts(presentation(), 'evidence', async cs => cs.map(() => true))
    const blocks = (out as unknown as { blocks: Array<{ items?: Array<{ points: Array<{ text: string }> }> }> }).blocks
    expect(blocks[0].items![0].points[0].text).toBe('Sáng lập SpaceX năm 2002 và nhiều công ty khác')
  })
})
