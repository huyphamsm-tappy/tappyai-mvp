import { isVi } from '@/lib/ai/messages'

// ── Price Watch VI/EN (STEP 13) ────────────────────────────────────────────
//
// Price Watch was Vietnamese-only across all four surfaces — the REST route, the
// `save_price_watch` chat tool, the 6-hourly cron and the push notification. The
// Consultative V2 Definition of Done requires VI + EN, so this is the one shared
// translation layer for the feature.
//
// It follows the SHIPPED `src/lib/ai/messages.ts` convention exactly
// (`isVi(lang) ? VI : EN`, plain functions, no framework) rather than introducing
// a second localisation system. Deterministic and model-free.
//
// WHERE THE LANGUAGE COMES FROM — the split is the one the codebase already
// documents, not a new invention:
//
//   * chat tool  → the per-message `lang` the route already detects.
//     `add_user_language_preference.sql` states this deliberately: "AI response
//     language stays auto-detected per-message … and is not stored per-user".
//   * REST route and cron/push → `profiles.language`, the stored UI preference
//     from the same migration (constrained to 'vi' | 'en' at its write site in
//     api/profile/route.ts).
//
// No migration is needed and no new language parameter is added to the API.

export const PW_LANGS = ['vi', 'en'] as const
export type PwLang = (typeof PW_LANGS)[number]

/**
 * Narrow anything to a supported language.
 *
 * Defaults to Vietnamese, which is the load-bearing half of backward
 * compatibility: every existing caller sends nothing and receives Vietnamese
 * today, and that must not change.
 */
export function normalizePwLang(value: unknown): PwLang {
  return value === 'en' ? 'en' : 'vi'
}

/**
 * Money, rendered the way each language actually writes it.
 *
 * The shipped cron used `triệu` unconditionally, so an English push read
 * "Now 4.2 triệu — your target is 4.5 triệu".
 */
export function fmtPriceVnd(n: number, lang: PwLang): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    const num = m % 1 === 0 ? String(m) : m.toFixed(1)
    return isVi(lang) ? `${num} triệu` : `${num}M`
  }
  return `${(n / 1000).toFixed(0)}k`
}

export const pw = {
  // ── REST route ──────────────────────────────────────────────────────────
  unauthorized: (l: PwLang) => isVi(l) ? 'Bạn cần đăng nhập' : 'Unauthorized',
  missingFields: (l: PwLang) => isVi(l)
    ? 'Thiếu thông tin bắt buộc'
    : 'Missing required fields',
  missingId: (l: PwLang) => isVi(l) ? 'Thiếu mã theo dõi' : 'Missing watch id',
  dbError: (l: PwLang) => isVi(l) ? 'Lỗi cơ sở dữ liệu' : 'Database error',
  limitReached: (l: PwLang) => isVi(l)
    ? 'Tối đa 10 sản phẩm theo dõi cùng lúc'
    : 'You can watch at most 10 products at a time',
  cancelFailed: (l: PwLang) => isVi(l) ? 'Không thể huỷ theo dõi' : "Couldn't cancel this watch",
  notFound: (l: PwLang) => isVi(l) ? 'Không tìm thấy' : 'Not found',

  // ── save_price_watch chat tool ──────────────────────────────────────────
  needLogin: (l: PwLang) => isVi(l)
    ? 'Cần đăng nhập để theo dõi giá'
    : 'You need to sign in to track prices',
  saveError: (l: PwLang, cause: string) => isVi(l)
    ? `Lỗi lưu theo dõi: ${cause}`
    : `Couldn't save the price watch: ${cause}`,
  saved: (l: PwLang, product: string, targetVnd: number) => isVi(l)
    ? `Đã lưu! Tappy sẽ kiểm tra giá ${product} mỗi 6 tiếng và báo bạn khi xuống dưới ${fmtPriceVnd(targetVnd, 'vi')}.`
    : `Saved! Tappy will check the price of ${product} every 6 hours and let you know when it drops below ${fmtPriceVnd(targetVnd, 'en')}.`,

  // ── Push notification (cron) ────────────────────────────────────────────
  notifyTitle: (l: PwLang, product: string) => isVi(l)
    ? `🎯 Giá ${product} đã xuống!`
    : `🎯 ${product} just dropped in price!`,
  notifyBody: (l: PwLang, currentVnd: number, targetVnd: number) => isVi(l)
    ? `Hiện ${fmtPriceVnd(currentVnd, 'vi')} — mục tiêu của bạn là ${fmtPriceVnd(targetVnd, 'vi')}. Mở Tappy để mua ngay!`
    : `Now ${fmtPriceVnd(currentVnd, 'en')} — your target was ${fmtPriceVnd(targetVnd, 'en')}. Open Tappy to grab it!`,
} as const

/**
 * The narrow slice of a Supabase client this function actually uses.
 *
 * This used to be an inline `any` with a disable directive naming
 * `@typescript-eslint/no-explicit-any` — a rule the production ESLint config does
 * not register, so `next build` failed on the DIRECTIVE rather than on the code.
 *
 * Erased at the boundary with `unknown` rather than described in full: matching
 * Supabase's generic builder shape structurally makes the compiler instantiate it
 * (TS2589, "excessively deep"), which is why `any` was reached for in the first
 * place. One narrowing cast inside the function is cheaper, and still no `any`.
 */
type ProfileLanguageReader = { from: (table: string) => unknown }

/** The single call chain resolveUserLang depends on. */
type LanguageQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      single: () => PromiseLike<{ data: unknown }>
    }
  }
}

/**
 * The stored UI-language preference for a user, or 'vi' when unset.
 *
 * `profiles.language` is nullable ("not set yet"), so the fallback matters: it is
 * what keeps every existing user on today's Vietnamese behaviour. A failed lookup
 * is also 'vi' — a language read must never be able to fail a price-watch write.
 */
export async function resolveUserLang(
  supabase: ProfileLanguageReader,
  userId: string,
): Promise<PwLang> {
  try {
    const q = supabase.from('profiles') as LanguageQuery
    const { data } = await q.select('language').eq('id', userId).single()
    return normalizePwLang((data as { language?: unknown } | null)?.language)
  } catch {
    return 'vi'
  }
}
