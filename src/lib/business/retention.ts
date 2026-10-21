// Tappy Business — how long order data must be kept, and why.
//
// ============================================================================
// 🚨 CORRECTION (P5 legal decision pack). THE SME CARVE-OUT DOES NOT APPLY.
// ============================================================================
// An earlier version of this module encoded a 1-year floor for an "SME_STARTUP"
// tier. Reading the enacted text of Luật Thương mại điện tử số 122/2025/QH15
// (official gazette no. 41, 22/01/2026) shows that carve-out lives in
// Điều 16 khoản 2 điểm c, which governs a nền tảng thương mại điện tử KINH
// DOANH TRỰC TIẾP — a platform its own owner sells on. Tappy is not that.
//
//   Điều 3 khoản 4: a nền tảng thương mại điện tử TRUNG GIAN is one that lets
//   OTHER organisations and individuals register accounts to introduce and sell
//   goods or services on that same platform. That is exactly Tappy.
//
//   Điều 17 khoản 2 điểm i then reads, in full:
//   "Bảo đảm khả năng truy cập thông tin, dữ liệu liên quan đến hợp đồng giao
//   kết trong thời gian ít nhất 03 năm từ thời điểm giao kết hợp đồng trên nền
//   tảng" — with NO reduced period for any size of operator.
//
// So the floor is THREE YEARS, flat. There is no 1-year option to elect.
//
// ============================================================================
// 🚨 AND "90 DAYS" WAS NOT MERELY UNRATIFIED — IT POINTED THE WRONG WAY.
// ============================================================================
// P0 §8 and P4 both carried "customer PII nulled 90 days after an order reaches
// a terminal state". A job doing that would have destroyed records the platform
// is required to keep, and would have measured from the wrong event: Điều 17
// khoản 2 điểm i runs from GIAO KẾT HỢP ĐỒNG — conclusion of the contract.
//
// ============================================================================
// THE DATA-PROTECTION LAW DOES NOT CONFLICT — IT DEFERS
// ============================================================================
// Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (in force 01/01/2026), detailed by
// Nghị định 356/2025/NĐ-CP which replaced Nghị định 13/2023/NĐ-CP:
//
//   Điều 3 khoản 3  personal data is stored "trong khoảng thời gian phù hợp với
//                   mục đích xử lý dữ liệu cá nhân, TRỪ TRƯỜNG HỢP PHÁP LUẬT CÓ
//                   QUY ĐỊNH KHÁC" — unless otherwise prescribed by law.
//   Điều 14 khoản 1 delete or destroy when: the subject asks and accepts the
//                   consequences (a); the purpose is complete (b); THE LEGALLY
//                   PRESCRIBED RETENTION PERIOD HAS EXPIRED (c); a competent
//                   authority so decides (d); by agreement (đ); or otherwise by
//                   law (e).
//   Điều 14 khoản 5 where deletion is impossible for a legitimate reason, the
//                   controller MUST NOTIFY the data subject. This is the lawful
//                   answer to an erasure request inside the retention window.
//   Điều 2 khoản 1  "Dữ liệu cá nhân sau khi khử nhận dạng không còn là dữ liệu
//                   cá nhân" — de-identified data is no longer personal data.
//
// So the sectoral duty sets the floor and the privacy duty begins where the
// floor ends. There is no conflict to resolve — only an order of operations.
//
// ============================================================================
// 🔑 WHY THIS MODULE STILL CONTAINS NO DELETION FUNCTION
// ============================================================================
//   1. The floor (3 years from contract) is longer than this product has
//      existed. Nothing is eligible; a job would have nothing lawful to do.
//   2. Whether "thông tin, dữ liệu liên quan đến hợp đồng" reaches the
//      customer's name, phone and address — i.e. whether the PII may be
//      de-identified while the contract record is kept — is a question of
//      statutory scope for Vietnamese counsel, not for engineering.
//   3. Điều 14 khoản 6 điểm b forbids re-identifying data once de-identified.
//      De-identification is therefore irreversible in law as well as in fact:
//      exactly the kind of act that must not be automated on an assumption.
//
// The schema already enforces the floor by construction: `service_role` holds
// no DELETE on any Business order table. Order data cannot be destroyed by any
// code path that exists. See docs/tappy-business/P5_LEGAL_DECISION_PACK.md.

/** The instruments this module encodes. Kept beside the numbers on purpose. */
export const RETENTION_SOURCES = {
  ecommerce: {
    law: 'Luật Thương mại điện tử',
    number: '122/2025/QH15',
    passed: '2025-12-10',
    effective: '2026-07-01',
    article: 'Điều 17 khoản 2 điểm i',
    requirement:
      'Chủ quản nền tảng thương mại điện tử trung gian có chức năng đặt hàng trực tuyến phải bảo đảm khả năng truy cập thông tin, dữ liệu liên quan đến hợp đồng giao kết trong thời gian ít nhất 03 năm từ thời điểm giao kết hợp đồng trên nền tảng. No reduced period applies to an intermediary platform.',
  },
  /** The carve-out that does NOT apply to Tappy — recorded so nobody re-adds it. */
  ecommerceDirectSellingCarveOut: {
    law: 'Luật Thương mại điện tử',
    number: '122/2025/QH15',
    article: 'Điều 16 khoản 2 điểm c',
    requirement:
      'Doanh nghiệp nhỏ và vừa khởi nghiệp sáng tạo, doanh nghiệp siêu nhỏ, hộ kinh doanh: ít nhất 01 năm, thời gian áp dụng không quá 05 năm từ ngày được thành lập. Applies to a nền tảng thương mại điện tử KINH DOANH TRỰC TIẾP (Điều 16), not to an intermediary platform (Điều 17).',
  },
  ecommerceListing: {
    law: 'Luật Thương mại điện tử',
    number: '122/2025/QH15',
    article: 'Điều 17 khoản 1 điểm e',
    requirement:
      'Bảo đảm khả năng truy cập thông tin, dữ liệu về hàng hóa, dịch vụ đã đăng tải trên nền tảng trong thời gian ít nhất 01 năm từ thời điểm đăng tải.',
  },
  ecommerceSellerExport: {
    law: 'Luật Thương mại điện tử',
    number: '122/2025/QH15',
    article: 'Điều 17 khoản 2 điểm đ',
    requirement:
      'Where a seller account is suspended or terminated, the seller must still be able to sign in and download data on contracts already concluded, for 03 years from the suspension or termination.',
  },
  personalData: {
    law: 'Luật Bảo vệ dữ liệu cá nhân',
    number: '91/2025/QH15',
    passed: '2025-06-26',
    effective: '2026-01-01',
    article: 'Điều 3 khoản 3, Điều 14',
    requirement:
      'Stored for a period appropriate to the processing purpose unless otherwise prescribed by law (Điều 3 khoản 3); deleted or destroyed once the legally prescribed retention period has expired (Điều 14 khoản 1 điểm c); where deletion is impossible for a legitimate reason the data subject must be notified (Điều 14 khoản 5).',
  },
  personalDataDecree: {
    law: 'Nghị định quy định chi tiết một số điều và biện pháp thi hành Luật Bảo vệ dữ liệu cá nhân',
    number: '356/2025/NĐ-CP',
    passed: '2025-12-31',
    effective: '2026-01-01',
    article: 'Điều 5; Điều 42',
    requirement:
      'Replaces Nghị định 13/2023/NĐ-CP. A deletion request is acknowledged within 02 working days and actioned within 20 days (30 where third parties are involved), extendable once.',
  },
} as const

/**
 * Which duty applies to a platform under Law 122/2025.
 *
 * ⚠️ Tappy's classification is a legal question (decision pack Q1), but only one
 * answer changes the number, and it is not the SME carve-out: that belongs to
 * `DIRECT_SELLING` platforms and is unavailable to an intermediary either way.
 */
export type PlatformRole =
  /** Điều 3 khoản 4 — others register accounts and sell on the platform. Tappy. */
  | 'INTERMEDIARY'
  /** Điều 3 khoản 3 — the owner sells its own goods. Not Tappy; kept for contrast. */
  | 'DIRECT_SELLING'

/**
 * Contract-data floor in days, by platform role.
 *
 * 🚨 `INTERMEDIARY` has no SME variant. Điều 17 khoản 2 điểm i states one period
 * for every operator; the 01-year figure exists only at Điều 16 khoản 2 điểm c.
 */
export const CONTRACT_FLOOR_DAYS: Readonly<Record<PlatformRole, number>> = Object.freeze({
  INTERMEDIARY: 3 * 365,
  DIRECT_SELLING: 3 * 365,
})

/** Điều 17 khoản 1 điểm e — posted goods/service data, from the moment of posting. */
export const LISTING_FLOOR_DAYS = 365

/** Điều 17 khoản 2 điểm đ — seller download access after suspension/termination. */
export const SELLER_EXPORT_FLOOR_DAYS = 3 * 365

/** Tappy's role, on the reading in the decision pack. Conservative either way. */
export const DEFAULT_ROLE: PlatformRole = 'INTERMEDIARY'

const DAY_MS = 86_400_000

/**
 * The earliest instant at which an order's data may even be CONSIDERED for
 * de-identification — measured from the contract date, which for Tappy is the
 * moment the order was created.
 *
 * Note the clock: Điều 17 khoản 2 điểm i runs from GIAO KẾT HỢP ĐỒNG, not from
 * the order reaching a terminal state. The provisional policy measured from the
 * terminal state, which starts the clock late for a PENDING order and early for
 * everything else — wrong in both directions.
 */
export function statutoryFloor(contractDate: Date, role: PlatformRole = DEFAULT_ROLE): Date {
  return new Date(contractDate.getTime() + CONTRACT_FLOOR_DAYS[role] * DAY_MS)
}

export type RetentionState =
  /** Inside the statutory window. The record must be kept, intact. */
  | 'STATUTORY_RETENTION'
  /**
   * Past the floor. NOT "delete now" — it means the sectoral duty no longer
   * compels retention, so the purpose-limitation question under PDPL Điều 3
   * khoản 3 becomes live and a human has to answer it.
   */
  | 'REVIEW_ELIGIBLE'

export function retentionState(
  contractDate: Date,
  now: Date = new Date(),
  role: PlatformRole = DEFAULT_ROLE
): RetentionState {
  return now >= statutoryFloor(contractDate, role) ? 'REVIEW_ELIGIBLE' : 'STATUTORY_RETENTION'
}

/**
 * Days remaining before the statutory floor is reached. Zero once past it.
 *
 * For an operator answering "when could this order's data be reviewed?" — not
 * for a scheduler. There is no scheduler.
 */
export function daysUntilReviewEligible(
  contractDate: Date,
  now: Date = new Date(),
  role: PlatformRole = DEFAULT_ROLE
): number {
  const remaining = statutoryFloor(contractDate, role).getTime() - now.getTime()
  return remaining <= 0 ? 0 : Math.ceil(remaining / DAY_MS)
}

// 🚨 DELIBERATELY ABSENT: anonymiseOrder(), deleteOrder(), a cron route, a
// scheduler, a `retention_hold` column. Adding any of them requires the legal
// answers recorded in docs/tappy-business/P5_LEGAL_DECISION_PACK.md first.
