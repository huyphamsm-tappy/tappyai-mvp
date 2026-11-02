import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONTRACT_FLOOR_DAYS,
  DEFAULT_ROLE,
  LISTING_FLOOR_DAYS,
  RETENTION_SOURCES,
  SELLER_EXPORT_FLOOR_DAYS,
  daysUntilReviewEligible,
  retentionState,
  statutoryFloor,
} from './retention'

// Tappy Business — the retention floor, and the two numbers that were wrong.
//
// 🚨 (1) The provisional policy was "customer PII nulled 90 days after an order
// reaches a terminal state". Luật Thương mại điện tử 122/2025/QH15 Điều 17
// khoản 2 điểm i requires an intermediary platform to keep contract data for at
// least 03 years. A 90-day job would have destroyed records the platform must
// keep — so the first test is that 90 days is never eligible.
//
// 🚨 (2) The first correction encoded a 1-year "SME_STARTUP" floor. That
// carve-out is at Điều 16 khoản 2 điểm c and governs DIRECT-SELLING platforms
// only. An intermediary platform has no reduced period at all.

const CONTRACT = new Date('2026-09-01T00:00:00Z')
const plus = (days: number) => new Date(CONTRACT.getTime() + days * 86_400_000)

describe('the floor comes from the E-Commerce Law, not from practice', () => {
  it('🔑 90 days after the contract is NEVER eligible', () => {
    expect(retentionState(CONTRACT, plus(90))).toBe('STATUTORY_RETENTION')
    expect(retentionState(CONTRACT, plus(90), 'INTERMEDIARY')).toBe('STATUTORY_RETENTION')
  })

  it('🔑 an intermediary platform has NO 1-year SME carve-out', () => {
    // Điều 17 khoản 2 điểm i states one period for every operator. If someone
    // re-adds a 365-day intermediary floor, this fails.
    expect(CONTRACT_FLOOR_DAYS.INTERMEDIARY).toBe(3 * 365)
    expect(Object.values(CONTRACT_FLOOR_DAYS)).not.toContain(365)
    expect(retentionState(CONTRACT, plus(365))).toBe('STATUTORY_RETENTION')
    expect(retentionState(CONTRACT, plus(365), 'DIRECT_SELLING')).toBe('STATUTORY_RETENTION')
  })

  it('defaults to the intermediary duty — the role Tappy actually plays', () => {
    expect(DEFAULT_ROLE).toBe('INTERMEDIARY')
    expect(retentionState(CONTRACT, plus(400))).toBe('STATUTORY_RETENTION')
  })

  it('becomes review-eligible exactly at the floor, not before', () => {
    expect(retentionState(CONTRACT, plus(3 * 365 - 1))).toBe('STATUTORY_RETENTION')
    expect(retentionState(CONTRACT, plus(3 * 365))).toBe('REVIEW_ELIGIBLE')
  })

  it('🔑 runs the clock from the CONTRACT date, not from the terminal state', () => {
    // Điều 17 khoản 2 điểm i measures from giao kết hợp đồng. The provisional
    // policy measured from the terminal state — late for a PENDING order that
    // sits 72 hours, early for everything else.
    expect(statutoryFloor(CONTRACT).toISOString()).toBe(plus(3 * 365).toISOString())
    // One required parameter — the contract date. `role` has a default, so it
    // is not counted. There is no terminal-state parameter to pass, which is
    // the point: the clock cannot be started from the wrong event.
    expect(statutoryFloor.length).toBe(1)
  })

  it('reports the remaining days for an operator, and floors at zero', () => {
    expect(daysUntilReviewEligible(CONTRACT, plus(0))).toBe(3 * 365)
    expect(daysUntilReviewEligible(CONTRACT, plus(90))).toBe(3 * 365 - 90)
    expect(daysUntilReviewEligible(CONTRACT, plus(9999))).toBe(0)
  })

  it('REVIEW_ELIGIBLE means a human decides, not that anything is deleted', () => {
    // The state name is load-bearing. `EXPIRED` or `DELETABLE` would invite a
    // scheduler; past the floor only means the sectoral duty stops compelling
    // retention and PDPL Điều 3 khoản 3 purpose-limitation becomes the live
    // question.
    expect(retentionState(CONTRACT, plus(3 * 365))).toBe('REVIEW_ELIGIBLE')
  })

  it('carries the two other floors Điều 17 imposes', () => {
    // Listings (khoản 1 điểm e) and post-termination seller export (khoản 2
    // điểm đ) are separate duties from the contract floor and are easy to miss.
    expect(LISTING_FLOOR_DAYS).toBe(365)
    expect(SELLER_EXPORT_FLOOR_DAYS).toBe(3 * 365)
  })
})

describe('the citations travel with the numbers', () => {
  it('names the current instruments, with their numbers and effective dates', () => {
    expect(RETENTION_SOURCES.ecommerce.number).toBe('122/2025/QH15')
    expect(RETENTION_SOURCES.ecommerce.effective).toBe('2026-07-01')
    expect(RETENTION_SOURCES.ecommerce.article).toBe('Điều 17 khoản 2 điểm i')
    expect(RETENTION_SOURCES.personalData.number).toBe('91/2025/QH15')
    expect(RETENTION_SOURCES.personalData.effective).toBe('2026-01-01')
    expect(RETENTION_SOURCES.personalDataDecree.number).toBe('356/2025/NĐ-CP')
  })

  it('🔑 records the direct-selling carve-out as the thing that does NOT apply', () => {
    // Recording it is cheaper than re-deriving it the next time somebody reads
    // "01 năm" in a summary of this law and reaches for a shorter floor.
    const carveOut = RETENTION_SOURCES.ecommerceDirectSellingCarveOut
    expect(carveOut.article).toBe('Điều 16 khoản 2 điểm c')
    expect(carveOut.requirement).toContain('not to an intermediary platform')
  })

  it('🔑 records that Decree 13/2023 has been superseded', () => {
    // Every earlier Tappy document reasoned from Decree 13/2023. It is no
    // longer the framework, and a reader of this module must not be left
    // reasoning from it either.
    expect(RETENTION_SOURCES.personalDataDecree.requirement).toContain('13/2023')
    expect(RETENTION_SOURCES.personalDataDecree.requirement).toContain('Replaces')
  })
})

describe('no deletion capability exists, by design', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/business/retention.ts'), 'utf8')

  it('🔑 this module exports no anonymise or delete function', () => {
    // The legal questions in the decision pack must be answered before one is
    // written. A test is the cheapest place to record that.
    const exported = [...source.matchAll(/export (?:function|const|type) (\w+)/g)].map((m) => m[1])
    for (const forbidden of ['anonymiseOrder', 'anonymizeOrder', 'deleteOrder', 'purgeOrders']) {
      expect(exported, forbidden).not.toContain(forbidden)
    }
  })

  it('🔑 the schema still grants no DELETE on any order table', () => {
    // The floor is enforced by construction, not by a job remembering not to
    // run. If someone grants DELETE, this fails before the data does.
    const p0 = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260908_tappy_business_p0.sql'),
      'utf8'
    )
    const orderTables = ['_orders', '_order_items', '_order_status_history']
    for (const table of orderTables) {
      const grants = [...p0.matchAll(new RegExp(`GRANT ([^;]+) ON TABLE business${table} `, 'g'))]
      expect(grants.length, table).toBeGreaterThan(0)
      for (const g of grants) expect(g[1], `business${table}`).not.toContain('DELETE')
    }
  })
})
