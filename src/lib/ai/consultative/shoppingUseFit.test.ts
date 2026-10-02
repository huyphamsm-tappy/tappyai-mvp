import { describe, it, expect } from 'vitest'
import { deriveShoppingConstraints, validateShoppingCandidates } from './shoppingConstraints'
import { parseProductSpecs } from '../productSpecs'

// Owner 30/09 (3b), replay SHOP-3 t5 on Luna (level B): "học thiết kế, dưới 20 triệu, mới" → the pick was a 4 GB laptop
// while 16 GB machines within budget were on the list. A listing that STATES too little RAM for the stated use is not
// offered while another candidate states enough; the user's own words and the real listings below are verbatim.
const HP4 = 'HP 15s-du1055tu 6405U Notebook 39,6 cm (15.6") HD Intel Pentium Gold 4 GB DDR4-SDRAM 256 GB SSD Wi-Fi 5 (802.11ac) Windows 11 Home Màu đen'
const MSI16 = 'Laptop MSI Modern 15 F1MG-1264VN (Core 5 120U | 16GB | 512GB | Intel Graphics | 15.6inch FHD | Win 11 Home | Xám)'
const SILENT = 'Laptop Asus Vivobook Go 15 E1504FA R5 7520U'
const cand = (name: string, price: number) => ({ name, raw: { title: name }, attrs: { priceVnd: price } }) as never
const msgs = (...t: string[]) => t.map(content => ({ role: 'user', content }))
const k = deriveShoppingConstraints(msgs('laptop cho sinh viên', 'học thiết kế, dưới 20 triệu, mới', 'xem thêm lựa chọn'), { min: 0, max: 20_000_000, type: 'under' } as never)

describe('the pick fits the stated use (SHOP-3 t5)', () => {
  it('"4 GB DDR4-SDRAM" is read as RAM', () => {
    expect(parseProductSpecs(HP4).ram_gb).toBe(4)
    expect(parseProductSpecs(MSI16).ram_gb).toBe(16)
  })
  it('design study needs at least 8 GB: the 4 GB listing goes while a 16 GB one fits the budget; a silent one stays', () => {
    expect(k.minRamGb).toBe(8)
    const r = validateShoppingCandidates([cand(HP4, 8_700_000), cand(MSI16, 15_990_000), cand(SILENT, 12_000_000)], k)
    expect(r.kept.map(c => (c as { name: string }).name)).toEqual([MSI16, SILENT])
    expect(r.rejected.map(x => x.reason)).toContain('ram')
  })
  it('nothing states enough (or the one that does is over budget) → nothing is dropped for RAM', () => {
    expect(validateShoppingCandidates([cand(HP4, 8_700_000), cand(SILENT, 12_000_000)], k).kept).toHaveLength(2)
    const over = validateShoppingCandidates([cand(HP4, 8_700_000), cand(MSI16, 25_000_000)], k)
    expect(over.kept.map(c => (c as { name: string }).name)).toEqual([HP4])
  })
  it('only for the demanding use, and never over a RAM figure the user named', () => {
    expect(deriveShoppingConstraints(msgs('laptop cho sinh viên văn phòng'), null).minRamGb ?? null).toBeNull()
    expect(deriveShoppingConstraints(msgs('laptop học thiết kế 4gb là được'), null).minRamGb ?? null).toBeNull()
    expect(deriveShoppingConstraints(msgs('tai nghe chơi game'), null).minRamGb ?? null).toBeNull()
  })
})
