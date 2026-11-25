import { describe, it, expect } from 'vitest'
import { verifyReport, verifierClean, type VerifierSource } from './claimVerifier'

const src = (id: number, text: string, over: Partial<VerifierSource> = {}): VerifierSource => ({ id, title: `Nguồn ${id}`, snippet: '', text, ...over })
const S = [src(1, 'Thị trường đạt 2,26 tỷ USD năm 2024, tăng 35%.'), src(2, 'Công ty có 1.200 cửa hàng tại 40 tỉnh.')]

describe('verifyReport', () => {
  it('a figure written in the cited source is supported (any usual way of writing the number)', () => {
    const r = verifyReport('Thị trường đạt 2.26 tỷ USD [1]. Mức tăng là 35% [1].', S)
    expect(r.counts.supported).toBe(2); expect(r.flagged).toEqual([]); expect(verifierClean(r)).toBe(true)
  })
  it('a figure that is in ANOTHER source but not the cited one is flagged (not "somewhere in the pool")', () => {
    const r = verifyReport('Công ty có 1.200 cửa hàng [1].', S)
    expect(r.flagged).toEqual([{ sentence: 1, status: 'number_not_in_source', figures: ['1.200'], cited: [1] }])
    expect(verifierClean(r)).toBe(false)
  })
  it('a citation to a source the report does not list is a bad citation', () => {
    const r = verifyReport('Thị trường tăng 35% [7].', S)
    expect(r.flagged[0]).toMatchObject({ status: 'bad_citation', cited: [7] })
  })
  it('a figure with no citation is reported as uncited; a bare year and small integers are not figures', () => {
    expect(verifyReport('Doanh thu là 500 triệu đồng.', S).flagged[0]).toMatchObject({ status: 'uncited_number', figures: ['500'] })
    const r = verifyReport('Năm 2024 có 3 đối thủ chính.', S)
    expect(r.checked).toBe(0); expect(r.flagged).toEqual([])
  })
  it('a cited source with no readable text can neither confirm nor refute: unreadable, and it does not fail the report', () => {
    const r = verifyReport('Doanh thu 900 triệu [3].', [src(3, '', { title: 'Trang trống' })])
    expect(r.counts.source_unreadable).toBe(1); expect(verifierClean(r)).toBe(true)
  })
  it('a snippet alone counts as readable', () => {
    const r = verifyReport('Doanh thu 900 triệu [3].', [src(3, '', { snippet: 'doanh thu 900 triệu đồng' })])
    expect(r.counts.supported).toBe(1)
  })
  it('several citations: a figure in any of the cited sources is enough', () => {
    expect(verifyReport('Có 40 tỉnh và 2,26 tỷ USD [1][2].', S).counts.supported).toBe(1)
  })
  it('cited sentences without figures are not flagged; the result states its own scope and never holds sentence text', () => {
    const r = verifyReport('Quán này nổi tiếng [1]. Bí mật kinh doanh 12345 [1].', S)
    expect(r.scope).toBe('numbers_and_citation_ids_only')
    expect(JSON.stringify(r)).not.toContain('Bí mật')
    expect(r.checked).toBe(2); expect(r.counts.number_not_in_source).toBe(1)
  })
  it('empty and junk input do nothing', () => {
    expect(verifyReport('', S).checked).toBe(0)
    expect(verifyReport(null as unknown as string, S).sentences).toBe(0)
  })
})
