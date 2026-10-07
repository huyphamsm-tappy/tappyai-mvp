import { describe, it, expect } from 'vitest'
import { statedDistrict, districtsOfAddress, districtRelation } from './districts'

// PRELAUNCH 5b: a district the user states constrains the results by the venue's ACTUAL address.
// Addresses below are the real Google/Serper shapes recorded in the golden runs (post-2025 wards).

describe('statedDistrict — what the USER names', () => {
  it.each([
    ['Quán phở ngon ở Quận 3', 'hcm:q3'],
    ['quan pho ngon q3', 'hcm:q3'],
    ['cafe Q.10 yên tĩnh', 'hcm:q10'],
    ['District 1 street food', 'hcm:q1'],
    ['Quán cà phê yên tĩnh để làm việc ở Bình Thạnh', 'hcm:binh-thanh'],
    ['ăn tối ở Phú Nhuận', 'hcm:phu-nhuan'],
    ['bún chả Cầu Giấy', 'hn:cau-giay'],
    ['spa ở Thủ Đức', 'hcm:thu-duc'],
  ])('%s → %s', (text, key) => expect(statedDistrict(text)?.key).toBe(key))

  it.each([
    'Quán phở ngon gần đây',
    'quán 3 món cho 2 người',
    'quán ăn cho 5 người',
    'quán 1 ngày tuổi',
    'Mình muốn đi Đà Nẵng 3 ngày',
  ])('no district in %j', (text) => expect(statedDistrict(text)).toBeNull())
})

describe('districtsOfAddress — the venue\'s actual district', () => {
  it.each([
    ['112 Lý Tự Trọng, Bến Thành, Hồ Chí Minh 700000, Việt Nam', 'hcm:q1'],
    ['10 Đặng Tất, Tân Định, Hồ Chí Minh, Việt Nam', 'hcm:q1'],
    ['138 Nam Kỳ Khởi Nghĩa, Sài Gòn, Hồ Chí Minh 700000, Việt Nam', 'hcm:q1'],
    ['135/30 Trần Hưng Đạo, Cầu Ông Lãnh, Hồ Chí Minh, Việt Nam', 'hcm:q1'],
    ['103BIS Võ Thị Sáu, Xuân Hòa, Hồ Chí Minh, Việt Nam', 'hcm:q3'],
    ['160 Pasteur, Quận 1, Hồ Chí Minh, Việt Nam', 'hcm:q1'],
    ['14 Đ. Tân Mỹ, Quận 7, Hồ Chí Minh 700000, Việt Nam', 'hcm:q7'],
    ['19 Đ. Số 42, P. Phú Thuận, Tân Hưng, Hồ Chí Minh 700000, Việt Nam', 'hcm:q7'],
    ['12 Quốc Hương, An Khánh, Hồ Chí Minh, Việt Nam', 'hcm:q2'],
  ])('%s → %s', (addr, key) => expect(districtsOfAddress(addr).map(d => d.key)).toContain(key))

  it.each([
    '02 Đ. Trần Nhân Tông, Lâm Viên - Đà Lạt, Lâm Đồng, Việt Nam',
    '05 Huỳnh Thúc Kháng, Hải Châu, Đà Nẵng 550000, Việt Nam',
    '1 Đường Không Tên, Phường Lạ, Hồ Chí Minh, Việt Nam',
    '',
  ])('unknown (never guessed) for %j', (addr) => expect(districtsOfAddress(addr)).toEqual([]))

  it('a same-named ward in another province is not read as Ho Chi Minh City', () => {
    expect(districtsOfAddress('12 Lê Lợi, Phú Thuận, Thừa Thiên Huế, Việt Nam')).toEqual([])
  })
})

describe('districtRelation — in / out / unknown', () => {
  const q3 = statedDistrict('Quận 3')!
  it('a Quận 1 venue is OUT of Quận 3, with its real district', () => {
    const r = districtRelation(q3, '112 Lý Tự Trọng, Bến Thành, Hồ Chí Minh 700000, Việt Nam')
    expect(r.relation).toBe('out')
    expect(r.actual?.label).toBe('Quận 1')
  })
  it('a Xuân Hòa venue is IN Quận 3', () => {
    expect(districtRelation(q3, '103BIS Võ Thị Sáu, Xuân Hòa, Hồ Chí Minh, Việt Nam').relation).toBe('in')
  })
  it('an unreadable address is UNKNOWN, never out', () => {
    expect(districtRelation(q3, '1 Đường Không Tên, Phường Lạ, Hồ Chí Minh, Việt Nam').relation).toBe('unknown')
  })
  it('the Thủ Đức umbrella covers the former Quận 2', () => {
    expect(districtRelation(statedDistrict('ở Thủ Đức')!, '12 Quốc Hương, An Khánh, Hồ Chí Minh, Việt Nam').relation).toBe('in')
  })
})
