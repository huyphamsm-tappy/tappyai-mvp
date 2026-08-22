import { searchParam } from '@/lib/http/searchParams'

/**
 * The language a REQUEST is asking to be answered in.
 *
 * ============================================================================
 * WHY THIS EXISTS — B04
 * ============================================================================
 * Server-generated user-facing text was hardcoded Vietnamese. An English user who hit the free
 * message cap on `/api/chat` got
 *
 *     "Bạn đã dùng hết 5 câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy!"
 *
 * — in production, in the middle of an otherwise entirely English session. Same for the anonymous
 * rate limiter and every translate error.
 *
 * The plumbing to fix it already existed and was already correct: `?lang=` first, then the first
 * tag of `Accept-Language`, then Vietnamese. But it was COPIED into four route files, so the
 * routes that happened to have it localized their text and the routes that did not, did not —
 * and nothing pointed at the difference. Copying it a fifth time would have fixed three strings
 * and left the next route to make the same choice again.
 *
 * 🚨 Resolution order is `?lang=` BEFORE `Accept-Language`, and that is not arbitrary. The app
 * keeps its locale in `localStorage`, not in the browser's language settings, so a user who
 * switched TappyAI to English inside a Vietnamese-configured browser sends `?lang=en` with
 * `Accept-Language: vi`. The explicit parameter is the user's actual choice; the header is only a
 * guess about their device.
 */
export type RequestLocale = 'vi' | 'en'

/** The app's default, and the language its server-rendered markup is written in. */
export const DEFAULT_LOCALE: RequestLocale = 'vi'

interface LocaleBearingRequest {
  readonly url?: string
  readonly nextUrl?: { readonly searchParams: URLSearchParams }
  readonly headers?: { get?: (name: string) => string | null }
}

/**
 * Narrow any language tag to a locale this app actually has strings for.
 *
 * `en-US`, `en-GB` and `EN` are all English; everything else — including an unknown or malformed
 * tag — is Vietnamese, because falling back to the default is the only answer that is always
 * renderable.
 */
export function normalizeLocale(tag: string | null | undefined): RequestLocale {
  return tag?.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LOCALE
}

/**
 * Never throws and never returns undefined.
 *
 * A wording lookup must not be able to take down the endpoint it is decorating: the optional
 * chaining on `headers` is deliberate, because not every caller in this codebase's tests passes a
 * header bag, and a missing `Accept-Language` has to mean "use the default" rather than "500".
 */
export function requestLocale(req: LocaleBearingRequest): RequestLocale {
  const explicit = searchParam(req as never, 'lang')
  if (explicit) return normalizeLocale(explicit)
  const header = req?.headers?.get?.('accept-language')?.split(',')[0]?.trim()
  return normalizeLocale(header)
}
