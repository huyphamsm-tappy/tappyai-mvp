import { describe, it, expect } from 'vitest'
import { detectLocationIntent } from './intent'

// ── C3-B.2 Phase 4: "ở đâu" is a question, not an address ────────────────────
//
// detectLocationIntent decides whether the user wants a PHYSICAL store or an
// ONLINE purchase. Its 'offline' verdict is not advisory: the chat route drops
// `search_products` from the model's tool set entirely when it fires
// (route.ts), and the prompt additionally says "TUYỆT ĐỐI KHÔNG dùng
// search_products". So a false 'offline' does not merely bias the answer — it
// removes the shopping capability from the turn.
//
// Measured 2026-08-11 against the stored C3-A/C3-B benchmarks: scenario 12-vi
// ("Mua tai nghe bluetooth ở đâu") called NO tool at all in both runs, while
// 12-en ("Where can I buy bluetooth headphones") called search_products. The
// only difference is this detector: "ở đâu" normalizes to "o dau" and matched
// the offline pattern, while English has no equivalent marker.
//
// "ở đâu" / "chỗ nào" ask WHERE. That is equally satisfied by a marketplace
// link and by a shop address, so on its own it cannot mean "physical store".
// The real offline markers — a district, a street, "gần đây", "cửa hàng",
// "tiệm", "chi nhánh", "siêu thị" — are unchanged and still decide on their own.

describe('detectLocationIntent — a bare "where" must not delete the shopping tool', () => {
  describe('Vietnamese: buying a product, location unstated → not offline', () => {
    for (const t of [
      'Mua tai nghe bluetooth ở đâu',
      'Mua iPhone ở đâu',
      'Tìm chỗ mua Samsung',
      'Có bán tai nghe ở đâu?',
      'Mua Galaxy S24 ở đâu rẻ',
      'Sản phẩm này bán ở đâu',
      'Mua chỗ nào tốt',
    ]) {
      it(`"${t}" keeps search_products available`, () =>
        expect(detectLocationIntent(t)).not.toBe('offline'))
    }
  })

  describe('English: same requests already behaved — locked as regression', () => {
    for (const t of [
      'Where can I buy Bluetooth headphones?',
      'Where can I buy an iPhone?',
      'Where can I buy Samsung phones?',
    ]) {
      it(`"${t}" keeps search_products available`, () =>
        expect(detectLocationIntent(t)).not.toBe('offline'))
    }
  })

  describe('genuine physical-store intent stays offline', () => {
    for (const t of [
      'Cửa hàng Samsung gần đây',
      'Tiệm bán tai nghe ở Quận 1',
      'Có chi nhánh nào ở Hà Nội không',
      'Siêu thị điện máy gần nhà mình',
      // A bare "where" PLUS a real location marker is still a physical-store ask.
      'Đến mua ở đâu tại Quận 3',
      'Mua iPhone ở đâu gần đây',
      'Mua tai nghe ở đâu khu vực Cầu Giấy',
    ]) {
      it(`"${t}"`, () => expect(detectLocationIntent(t)).toBe('offline'))
    }
  })

  describe('non-shopping place questions keep their offline reading', () => {
    // No purchase is involved, so "ở đâu" carries its usual place meaning and
    // the offline hint stays useful. The fix must not broaden past shopping.
    for (const t of [
      'Quán ăn ngon ở đâu',
      'Quán cafe nào gần đây',
      'Spa tốt ở đâu',
      'Chỗ nào chơi vui cuối tuần',
    ]) {
      it(`"${t}"`, () => expect(detectLocationIntent(t)).toBe('offline'))
    }
  })

  describe('explicit online intent is unchanged', () => {
    for (const t of [
      'Mua tai nghe online giao hàng nhanh',
      'Đặt hàng trên Shopee',
      'Mua iPhone trên Tiki ở đâu rẻ',
      // A "where" alongside an online marker and NO purchase word: these pin
      // the ORDER of the two checks. Without them, moving the weak-"where"
      // reading above the online one changes nothing observable — a mutation
      // that survived until these were added.
      'Voucher Shopee ở đâu',
      'Giao hàng tận nơi chỗ nào',
    ]) {
      it(`"${t}"`, () => expect(detectLocationIntent(t)).toBe('online'))
    }
  })
})
