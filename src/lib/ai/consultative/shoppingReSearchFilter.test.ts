import { describe, it, expect } from 'vitest'
import { deriveShoppingConstraints, rejectCandidate } from './shoppingConstraints'
import type { Candidate } from './candidate'

// Owner 29/09 (last root fix, shopping): a re-search ("xem thêm", a "bác" with a new need) keeps only the PRODUCT
// TYPE being asked for. Titles below are VERBATIM from the 29/09 replay cards (SHOP-2 / SHOP-3).
const cand = (name: string): Candidate => ({ id: name, name, domain: 'shopping', attrs: {}, raw: { title: name } } as unknown as Candidate)
const u = (...texts: string[]) => texts.map(content => ({ role: 'user', content }))

describe('SHOP-3 — laptop for a design student: services, bags and store pages are not laptops', () => {
  const k = deriveShoppingConstraints(u('laptop cho sinh viên', 'học thiết kế, dưới 20 triệu, mới', 'xem thêm lựa chọn'), null)
  it.each([
    ['Bảng Giá Sửa Laptop Lấy Liền Tại TPHCM -Giá Từ', 'service'],
    ['【Bảng Giá Sửa Laptop Lấy Liền】 ️Hiển Laptop', 'service'],
    ['Địa Chỉ Sửa Laptop Uy Tín HCM', 'service'],
    ['Địa Chỉ Sửa Laptop Khởi Động Chậm TPHCM | Giá Rẻ, Gần Đây', 'service'],
    ['Bảng Giá Sửa Laptop -Default Title', 'service'],
    ['Ba lô Rivacase 5563 Laptop 13.3', 'accessory'],
    ['Laptop | Máy tính xách tay giá rẻ, trả góp 0%, giảm 15 triệu', 'accessory'],
    ['Jack DC Chân Sạc Laptop Sony VPCEB PCG-71311N', 'accessory'],
    ['ZIN QUA SỬ DỤNG BỘ NGUỒN Cục sạc ADAPTER laptop', 'accessory'],
  ])('%s → %s', (title, reason) => {
    expect(rejectCandidate(cand(title), k)?.reason).toBe(reason)
  })
  it.each([
    'Laptop Aspire Lite 14',
    'Laptop Dell 15 DC15250 Core i5-1334U - Thái Long Computer',
    'Laptop Lenovo 20296 Pentium 3556U- Giá Rẻ, Chính Hãng',
  ])('a real laptop stays: %s', title => {
    expect(rejectCandidate(cand(title), k)).toBeNull()
  })
  it('asking FOR a laptop bag keeps the bag', () => {
    const bag = deriveShoppingConstraints(u('mua balo laptop 14 inch'), null)
    expect(rejectCandidate(cand('Ba lô Rivacase 5563 Laptop 13.3'), bag)).toBeNull()
  })
})

describe('SHOP-2 — gift for a male boss who likes coffee: gifts aimed at women are not it', () => {
  const k = deriveShoppingConstraints(u('quà tặng sếp', 'sếp nam 40 tuổi, thích cà phê, dưới 500k'), null)
  it('reads the recipient gender', () => expect(k.recipientGender).toBe('nam'))
  it.each([
    'Set Quà Tặng Nàng 14/2 – Set Dâu Yêu Thương',
    'Bộ Quà Tặng cho Bạn gái, Người Yêu, Tặng mẹ - Set Trang Điểm, Makeup đầy đủ kèm túi, thiệp - Quà Tặng Nữ',
    'Set Quà Tặng Bạn Gái Dễ Thương - Quà Tặng Sinh Nhật Dịp Kỉ Niệm Cho Nữ/Bạn Thân Helo Kiti/Capybara SAKA',
  ])('dropped: %s', title => {
    expect(rejectCandidate(cand(title), k)?.reason).toBe('recipient')
  })
  it.each([
    'Hộp quà tặng cao cấp Hạt A Cafe Premium Gift Box Coffee 3 loại cà phê hòa tan 288g - 16 stick',
    'Quà Tặng Cà Phê Hộp Quà GIÀU CÓ Trung Nguyên Legend Hộp Sáng Tạo 8 Phin Nhôm Bạc Trống Đồng',
    'Set quà tặng sinh nhật, tốt nghiệp cho nam & nữ - Combo quà tặng sổ gỗ, cốc tre, ống hút và hộp quà',
  ])('kept: %s', title => {
    expect(rejectCandidate(cand(title), k)).toBeNull()
  })
})

describe('SHOP-1 — "không thích màu đen" turns black DOWN, it never requires it', () => {
  const k = deriveShoppingConstraints(u('ốp UAG iPhone 17 Pro Max monarch magsafe', 'không thích màu đen'), null)
  it('an exclusion, not a variant', () => {
    expect(k.variant).toBeNull()
    expect(k.excludeVariants).toEqual(['den'])
  })
  it('the black case goes, other colours stay', () => {
    expect(rejectCandidate(cand('Ốp UAG Monarch Pro MagSafe iPhone 17 Pro Max màu đen'), k)?.reason).toBe('variant')
    expect(rejectCandidate(cand('Ốp UAG Monarch Pro MagSafe iPhone 17 Pro Max màu xanh'), k)).toBeNull()
  })
  it('"muốn màu đen" still asks for black', () => {
    expect(deriveShoppingConstraints(u('ốp UAG iPhone 17 Pro Max', 'muốn màu đen'), null).variant).toBe('den')
  })
})
