import { describe, it, expect } from 'vitest'
import {
  classifyShoppingGaps,
  shoppingEvidenceNote,
  deriveShoppingConstraints,
  budgetFromHistory,
  rejectCandidate,
  validateShoppingCandidates,
  unmetConstraintPayload,
  type ShoppingConstraints,
} from './shoppingConstraints'
import { extractBudget } from '../budget'
import type { Candidate } from './candidate'

// ─────────────────────────────────────────────────────────────────────────────
// Every rejection below is a listing MEASURED on localhost reaching the
// recommendation card. Nothing here is hypothetical, and nothing is matched on a
// specific product name — the rules read the title's head, the provider's price
// and the specs the title states.
// ─────────────────────────────────────────────────────────────────────────────

const cand = (name: string, priceVnd?: number): Candidate => ({
  id: name, name, domain: 'shopping',
  attrs: priceVnd === undefined ? {} : { priceVnd },
  link: 'https://shopee.vn/x', raw: { title: name, price_vnd: priceVnd },
})

const K = (over: Partial<ShoppingConstraints> = {}): ShoppingConstraints => ({
  productType: null, unknownType: null, brand: null, budget: null, ramGb: null, storageGb: null, size: null, variant: null, inStock: false, recipient: null, wantsAccessory: false, ...over,
})

const user = (...texts: string[]) => texts.map(content => ({ role: 'user', content }))

describe('constraints are folded from the whole conversation', () => {
  it('reads product type, brand and specs from what the user said', () => {
    const k = deriveShoppingConstraints(user('Laptop Dell 16GB RAM 512GB dưới 20 triệu'), extractBudget('dưới 20 triệu'))
    expect(k.productType).toBe('laptop')
    expect(k.brand).toBe('dell')
    expect(k.ramGb).toBe(16)
    expect(k.storageGb).toBe(512)
    expect(k.budget?.max).toBe(20_000_000)
  })

  it('🚨 a follow-up that names nothing keeps the subject', () => {
    // "Rẻ hơn thì có lựa chọn nào?" came back with laptop screens and a mouse
    // because nothing downstream still knew the conversation was about laptops.
    const k = deriveShoppingConstraints(
      user('Laptop khoảng 20 triệu để làm việc', 'Rẻ hơn thì có lựa chọn nào?'),
      null,
    )
    expect(k.productType).toBe('laptop')
  })

  it('🚨 "rẻ hơn" keeps the ceiling and drops the floor', () => {
    // The prior band was 16–24M. Carried whole it would reject the cheaper
    // options the user just asked for; dropped entirely it lets a 399k screen in.
    const prior = extractBudget('Laptop khoảng 20 triệu để làm việc')!
    expect(prior).toEqual({ min: 16_000_000, max: 24_000_000, type: 'around' })
    const k = deriveShoppingConstraints(
      user('Laptop khoảng 20 triệu để làm việc', 'Rẻ hơn thì có lựa chọn nào?'),
      prior,
    )
    expect(k.budget).toEqual({ min: 0, max: 24_000_000, type: 'under' })
  })

  it('carries a budget from an earlier turn when this one states none', () => {
    const msgs = user('Laptop khoảng 20 triệu để làm việc', 'Con nào tốt hơn?')
    expect(extractBudget('Con nào tốt hơn?')).toBeNull()
    expect(budgetFromHistory(msgs, extractBudget)?.max).toBe(24_000_000)
  })

  it('the latest statement wins when the user changes their mind', () => {
    const k = deriveShoppingConstraints(user('iPhone khoảng 20 triệu', 'Thôi mình xem laptop Dell đi'), null)
    expect(k.productType).toBe('laptop')
    expect(k.brand).toBe('dell')
  })
})

describe('rule 1 — an accessory, a part or a service is not the product', () => {
  const k = K({ productType: 'laptop' })

  it('🚨 rejects the parts a "laptop" query actually returned', () => {
    for (const title of [
      'MÀN HÌNH LAPTOP 13.3IN HD 40PIN DÀY',
      'Màn laptop 13’3 inch led dày 40 pin thay thế cho nhiều dòng laptop',
      'Thân máy laptop [cụm dưới - không màn hình - dùng thay thế PC máy tính để bàn]',
      'Chuột Máy Tính Không Dây Bluetooth Ziyou X2 PRO cho Máy tính, Laptop PC',
      'Túi Xách Nam Nữ Công Sở, Cặp Đựng Laptop 15.6 inch Chống Sốc',
      'Bàn phím cơ không dây cho laptop',
      'Sạc laptop Dell 65W chính hãng',
    ]) {
      expect(rejectCandidate(cand(title, 500_000), k), title).toMatchObject({ reason: 'accessory' })
    }
  })

  it('🚨 rejects a service listing', () => {
    for (const title of ['Dịch vụ cài đặt iPhone', 'Sửa chữa laptop tại nhà', 'Thay pin iPhone 13 chính hãng']) {
      expect(rejectCandidate(cand(title, 200_000), K({ productType: 'phone' })), title).toMatchObject({ reason: 'service' })
    }
  })

  it('🚨 does NOT reject a real product that merely mentions a screen', () => {
    // The rule reads the title's HEAD. Vietnamese listings lead with the product
    // noun, which is what makes this safe — a spec list further along is not an
    // accessory.
    for (const title of [
      'Laptop Dell 15 DC15250 i5-1334U/8GB/512GB/15.6" FHD Touch màn hình cảm ứng',
      'Laptop Asus Vivobook 16 A1607QA (16GB, 512GB, WUXGA, bàn phím có đèn)',
      'MacBook Air 13 M1 8GB 256GB — sạc nhanh, pin lâu',
      'Tai nghe Bluetooth chụp Tai Sony WH-CH720N',
    ]) {
      expect(rejectCandidate(cand(title, 18_000_000), k), title).toBeNull()
    }
  })

  it('stands down when the user is asking FOR the accessory', () => {
    const wants = K({ productType: 'laptop', wantsAccessory: true })
    expect(rejectCandidate(cand('Túi Xách Cặp Đựng Laptop 15.6 inch', 400_000), wants)).toBeNull()
    expect(deriveShoppingConstraints(user('Mua túi đựng laptop 15 inch'), null).wantsAccessory).toBe(true)
  })
})

describe('rule 2 — a brand the user named', () => {
  it('🚨 rejects a Samsung for an iPhone question', () => {
    const k = deriveShoppingConstraints(user('iPhone khoảng 20 triệu'), null)
    expect(k.brand).toBe('apple')
    expect(rejectCandidate(cand('Samsung Galaxy Note 20 5G (8GB - 256GB) Hàn Quốc Like New', 4_599_000), k))
      .toMatchObject({ reason: 'brand' })
    expect(rejectCandidate(cand('iPhone 13 128GB Chính Hãng', 11_790_000), k)).toBeNull()
  })

  it('accepts any brand when the user named none', () => {
    const k = K({ productType: 'laptop' })
    expect(rejectCandidate(cand('Laptop Acer Aspire Go 15', 18_990_000), k)).toBeNull()
    expect(rejectCandidate(cand('Laptop Dell 15 DC15250', 19_990_000), k)).toBeNull()
  })
})

describe('rule 3 — the budget the user said, without a courtesy margin', () => {
  it('🚨 "dưới 20 triệu" excludes 21.99M — the 10% tolerance let it through', () => {
    const k = deriveShoppingConstraints(user('Laptop 16GB RAM 512GB dưới 20 triệu'), extractBudget('dưới 20 triệu'))
    expect(rejectCandidate(cand('Laptop Dell 15 DC15250 CPH992 16GB 512GB', 21_990_000), k))
      .toMatchObject({ reason: 'budget' })
    expect(rejectCandidate(cand('Laptop Acer Aspire Go 15 16GB 512GB', 19_490_000), k)).toBeNull()
    expect(rejectCandidate(cand('Laptop Dell 16GB 512GB', 20_000_000), k), 'exactly at the bound').toBeNull()
  })

  it('🚨 "khoảng 20 triệu" has a FLOOR too — 1.5M is not around 20M', () => {
    const k = deriveShoppingConstraints(user('Laptop khoảng 20 triệu để làm việc'), extractBudget('khoảng 20 triệu'))
    for (const p of [1_500_000, 1_970_000, 2_190_000]) {
      expect(rejectCandidate(cand('laptop cũ giá rẻ học tập, làm việc', p), k), String(p)).toMatchObject({ reason: 'budget' })
    }
    expect(rejectCandidate(cand('Laptop Dell 15 DC15250', 20_990_000), k)).toBeNull()
    expect(rejectCandidate(cand('Laptop Dell 15 DC15250', 16_990_000), k), 'inside the ±20% band').toBeNull()
    // Generous downward: a genuinely cheaper machine is what "khoảng" allows for,
    // and rejecting it would over-filter. The floor is half the band's bottom.
    expect(rejectCandidate(cand('Laptop Dell Latitude 5320', 11_000_000), k), 'cheaper is still an answer').toBeNull()
    expect(rejectCandidate(cand('Laptop cũ', 7_900_000), k), 'a fifth of the budget is another product class')
      .toMatchObject({ reason: 'budget' })
  })

  it('🚨 a listing with NO price is not rejected — unknown stays unknown', () => {
    const k = deriveShoppingConstraints(user('Tai nghe chống ồn dưới 2 triệu'), extractBudget('dưới 2 triệu'))
    expect(rejectCandidate(cand('Tai nghe Sony WH-CH720N'), k)).toBeNull()
    // …and it is still not claimed to satisfy the bound: the card renders it as
    // "chưa rõ giá", which is the honest reading of an absent field.
  })
})

describe('rule 4 — a spec the listing states and the user contradicted', () => {
  const k = K({ productType: 'laptop', ramGb: 16, storageGb: 512 })

  it('🚨 rejects a listing that STATES 8GB when 16GB was asked for', () => {
    expect(rejectCandidate(cand('Laptop Dell 15 DC15250 i5-1334U/8GB/512GB', 16_990_000), k))
      .toMatchObject({ reason: 'ram' })
  })

  it('accepts the listing that states the requested configuration', () => {
    expect(rejectCandidate(cand('Laptop Acer Aspire Go 15 (Core 5, 16GB, 512GB)', 19_490_000), k)).toBeNull()
  })

  it('🚨 leaves a listing that states NOTHING alone — silence is not a mismatch', () => {
    expect(rejectCandidate(cand('Laptop Dell 15 DC15250', 19_990_000), k)).toBeNull()
  })

  it('rejects a stated storage mismatch the same way', () => {
    expect(rejectCandidate(cand('Laptop Asus 16GB 256GB SSD', 17_000_000), k)).toMatchObject({ reason: 'storage' })
  })
})

describe('validation as a whole', () => {
  it('keeps order, and separates what was asked for from what was not', () => {
    const k = deriveShoppingConstraints(user('Laptop khoảng 20 triệu để làm việc'), extractBudget('khoảng 20 triệu'))
    const { kept, rejected } = validateShoppingCandidates([
      cand('MÀN HÌNH LAPTOP 13.3IN HD 40PIN DÀY', 399_000),
      cand('Laptop Dell 15 DC15250', 16_990_000),
      cand('laptop cũ giá rẻ', 1_500_000),
      cand('Laptop Asus Vivobook 16 A1607QA', 19_490_000),
    ], k)
    expect(kept.map(c => c.name)).toEqual(['Laptop Dell 15 DC15250', 'Laptop Asus Vivobook 16 A1607QA'])
    expect(rejected.map(r => r.reason)).toEqual(['accessory', 'budget'])
  })

  it('🚨 fails closed: nothing satisfies the constraint, so nothing is kept', () => {
    const k = deriveShoppingConstraints(user('Tai nghe chống ồn dưới 500 nghìn'), extractBudget('dưới 500 nghìn'))
    const { kept, rejected } = validateShoppingCandidates([
      cand('Tai nghe Sony WH-1000XM5', 6_490_000),
      cand('Tai nghe Bose QC45', 5_990_000),
    ], k)
    expect(kept).toHaveLength(0)
    expect(rejected).toHaveLength(2)
    const payload = unmetConstraintPayload(k, rejected)
    expect(payload).toMatchObject({ budget: { max: 500_000, type: 'under' }, product_type: 'headphones', excluded_by: { budget: 2 } })
  })

  it('does nothing at all when the user stated no constraints', () => {
    const k = deriveShoppingConstraints(user('laptop'), null)
    const rows = [cand('Laptop A', 5_000_000), cand('Laptop B', 40_000_000)]
    expect(validateShoppingCandidates(rows, k).kept).toHaveLength(2)
  })
})

describe('rule 1b — the contaminants a "cheaper laptops?" follow-up returned', () => {
  const k = K({ productType: 'laptop' })

  it('🚨 a seller prefix does not smuggle a keyboard through', () => {
    // The head is SCANNED, not anchored: "TGMT - Bàn phím cơ…" opens with a shop
    // name, and an anchored rule let it become a laptop recommendation.
    expect(rejectCandidate(cand('TGMT - Bàn phím cơ không dây E-DRA EK398S Red Switch | 3 Mode', 820_000), k))
      .toMatchObject({ reason: 'accessory' })
  })

  it('🚨 rejects a shop catch-all that names no product', () => {
    for (const title of ['laptop cũ và mới nhiều sự lựa chọn.', 'máy tính cũ nhiều sự lựa chọn.']) {
      expect(rejectCandidate(cand(title, 1_000_000), k), title).toMatchObject({ reason: 'accessory' })
    }
  })

  it("🚨 rejects a child's toy that borrows the word", () => {
    expect(rejectCandidate(cand('Laptop của bé - Công chúa xinh đẹp', 286_894), k))
      .toMatchObject({ reason: 'accessory' })
  })

  it('🚨 rejects a DESKTOP for a laptop question', () => {
    expect(rejectCandidate(cand('Apple Mac mini', 14_099_000), k)).toMatchObject({ reason: 'accessory' })
    expect(rejectCandidate(cand('Máy tính để bàn Dell OptiPlex', 9_000_000), k)).toMatchObject({ reason: 'accessory' })
  })

  it('🚨 does NOT reject a laptop whose title never says "laptop"', () => {
    // Demanding the word would be a positive requirement, and these are laptops.
    for (const title of ['Surface Book 2 13.5" Core i7 / 16GB / 512GB (Like New)', 'MacBook Air 13 M1 8GB 256GB', 'LG GRAM 15 i5 1135G7']) {
      expect(rejectCandidate(cand(title, 15_000_000), k), title).toBeNull()
    }
  })
})

describe('rule 1c — the short lexicon stays anchored, and that is deliberate', () => {
  const k = K({ productType: 'laptop' })

  it('🚨 "RAM 16GB" early in a real laptop title is not an accessory', () => {
    // `ram` scanned anywhere would reject this. It is anchored for exactly that.
    expect(rejectCandidate(cand('Laptop Dell 15 DC15250 RAM 16GB SSD 512GB', 19_990_000), k)).toBeNull()
    expect(rejectCandidate(cand('LG GRAM 15 i5 1135G7', 17_590_000), k)).toBeNull()
    expect(rejectCandidate(cand('Laptop Asus Vivobook 16 A1607QA', 19_490_000), k)).toBeNull()
  })

  it('still rejects the bare part when it IS the head', () => {
    expect(rejectCandidate(cand('RAM Laptop DDR4 16GB Kingston', 900_000), k)).toMatchObject({ reason: 'accessory' })
    expect(rejectCandidate(cand('Ổ cứng SSD 512GB Samsung', 1_200_000), k)).toMatchObject({ reason: 'accessory' })
  })
})

describe('rule 1d — an aggregate link is not a product either', () => {
  it('🚨 rejects a "link tổng hợp" spanning every brand', () => {
    // Measured on the same follow-up: one listing was a shop's index page with a
    // nominal price, naming no machine at all.
    expect(rejectCandidate(cand('(Link tổng hợp) Laptop cao cấp các hãng, hiệu năng cao, bền bỉ, BH12T', 9_440_000), K({ productType: 'laptop' })))
      .toMatchObject({ reason: 'accessory' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 "giá 500k" — THE MOST NATURAL WAY TO STATE A PRICE, AND IT PARSED TO NULL.
//
// MEASURED on localhost: "muốn mua ốp lưng iphone 17pm giá 500k" returned six
// cases at 620k, 719k, 1.05M, 1.09M and 1.33M. Nothing was rejected and nothing
// was flagged, because extractBudget saw no "dưới" / "khoảng" / "ngân sách" and
// returned null — so the filter, the ranker and validateShoppingCandidates all
// had nothing to enforce. One parser feeds all three (budgetFromHistory takes
// extractBudget as its extractor), so the gap was silent in every one of them.
// ─────────────────────────────────────────────────────────────────────────────

describe('🚨 a stated price is a budget', () => {
  it('parses "giá 500k" as a target, with the ±20% band', () => {
    const b = extractBudget('muốn mua ốp lưng iphone 17pm giá 500k')
    expect(b).not.toBeNull()
    expect(b!.type).toBe('around')
    expect(b!.min).toBe(400_000)
    expect(b!.max).toBe(600_000)
  })

  it('🚨 the measured listings are now rejected against it', () => {
    const b = extractBudget('muốn mua ốp lưng iphone 17pm giá 500k')!
    const k = deriveShoppingConstraints(user('muốn mua ốp lưng iphone 17pm giá 500k'), b)
    const priced = (name: string, price: number): Candidate => ({
      id: name, name, domain: 'shopping', attrs: { priceVnd: price },
      link: 'https://x.test/' + encodeURIComponent(name), raw: { title: name, price },
    })
    const rows = [
      priced('Ốp lưng iPhone 17 Pro Max Ringke Fusion', 620_000),
      priced('Ốp lưng UNIQ COEHL iPhone 17 Pro Max', 719_000),
      priced('Ốp lưng iPhone 17 Pro Uag Plyo', 1_050_000),
      priced('Ốp lưng nhựa Apple MagSafe iPhone 17 Pro Max', 1_329_000),
    ]
    const { kept, rejected } = validateShoppingCandidates(rows, k)
    expect(kept).toHaveLength(0)
    expect(rejected).toHaveLength(4)
    for (const r of rejected) expect(r.reason).toBe('budget')
  })

  it('keeps a listing that actually sits in the band', () => {
    const b = extractBudget('ốp lưng iphone 17pm giá 500k')!
    const k = deriveShoppingConstraints(user('ốp lưng iphone 17pm giá 500k'), b)
    const ok: Candidate = {
      id: 'ok', name: 'Ốp lưng iPhone 17 Pro Max MagSafe', domain: 'shopping',
      attrs: { priceVnd: 480_000 }, link: 'https://x.test/ok',
      raw: { title: 'Ốp lưng iPhone 17 Pro Max MagSafe', price: 480_000 },
    }
    expect(validateShoppingCandidates([ok], k).kept).toHaveLength(1)
  })

  it('🚨 "giá rẻ" and "giá tốt" carry no number and must not become budgets', () => {
    // The money unit is the guard that makes the keyword safe.
    for (const q of ['laptop giá rẻ', 'tìm quán giá tốt', 'giá hợp lý không']) {
      expect(extractBudget(q), q).toBeNull()
    }
  })

  it('an explicit ceiling still wins over the price form', () => {
    // "dưới" is checked first and stays a hard cap, not a ±20% band.
    const b = extractBudget('ốp lưng giá tầm 500k nhưng dưới 400k')!
    expect(b.type).toBe('under')
    expect(b.max).toBe(400_000)
  })

  it('English "price 20 million" parses the same way', () => {
    const b = extractBudget('phone case price 2 million')
    expect(b).not.toBeNull()
    expect(b!.type).toBe('around')
    expect(b!.max).toBe(2_400_000)
  })
})

// ── B2 (2026-09-20): the widened lexicon and the new constraints ────────────────────────────
describe('B2 — product families beyond electronics, and constraints beyond RAM', () => {
  it('perfume, robot vacuum and air purifier resolve to a family (they resolved to null before)', () => {
    expect(deriveShoppingConstraints(user('nước hoa nữ tầm 2 triệu'), null).productType).toBe('perfume')
    expect(deriveShoppingConstraints(user('robot hút bụi lau nhà dưới 10 triệu'), null).productType).toBe('robot_vacuum')
    expect(deriveShoppingConstraints(user('máy lọc không khí cho phòng 30m2'), null).productType).toBe('air_purifier')
    expect(deriveShoppingConstraints(user('giày chạy bộ size 42'), null).productType).toBe('shoes')
  })
  it('an unknown type is kept as a gap with a warning source, never silence', () => {
    const k = deriveShoppingConstraints(user('mua máy sấy tóc tầm 800k'), null)
    expect(k.productType).toBeNull()
    expect(k.unknownType).toBe('may say toc')
    expect(classifyShoppingGaps(k, [{ title: 'Máy sấy tóc Panasonic' }]).gaps).toContain('unknown_type')
  })
  it('size, colour / volume, stock and recipient are read from the request', () => {
    const k = deriveShoppingConstraints(user('giày Nike size 42 màu đen còn hàng cho bạn trai'), null)
    expect(k).toMatchObject({ productType: 'shoes', size: '42', variant: 'den', inStock: true, recipient: 'ban trai' })
    expect(deriveShoppingConstraints(user('nước hoa 100ml cho mẹ'), null)).toMatchObject({ productType: 'perfume', variant: '100ml', recipient: 'me' })
  })
  it('a listing that STATES another size or colour is rejected; one that states none is kept (silence is not a rejection)', () => {
    const k = K({ productType: 'shoes', size: '42', variant: 'den' })
    expect(rejectCandidate(cand('Giày Nike Air size 41 màu đen'), k)?.reason).toBe('size')
    expect(rejectCandidate(cand('Giày Nike Air size 42 màu trắng'), k)?.reason).toBe('variant')
    expect(rejectCandidate(cand('Giày Nike Air size 42 màu đen'), k)).toBeNull()
    expect(rejectCandidate(cand('Giày Nike Air Zoom'), k)).toBeNull()
    expect(rejectCandidate(cand('Nước hoa Chanel 50ml'), K({ productType: 'perfume', variant: '100ml' }))?.reason).toBe('variant')
  })
  it('the gate gaps: what no kept listing proves — stock and recipient are ALWAYS gaps when asked', () => {
    const k = K({ productType: 'shoes', brand: 'sony', size: '42', variant: 'den', inStock: true, recipient: 'me' })
    const { gaps, rowBackedBy } = classifyShoppingGaps(k, [{ title: 'Giày Sony size 42' }, { title: 'Giày khác' }])
    expect(gaps).toEqual(['variant', 'in_stock', 'recipient'])
    expect(rowBackedBy.brand).toEqual(['Giày Sony size 42'])
    expect(rowBackedBy.size).toEqual(['Giày Sony size 42'])
    expect(shoppingEvidenceNote(gaps, 'vi')).toContain('KHONG listing nao xac nhan')
    expect(shoppingEvidenceNote([], 'vi')).toBeNull()
  })
})
