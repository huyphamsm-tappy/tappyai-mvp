import type { RequestLocale } from './requestLocale'

/**
 * User-facing text that the SERVER produces, in both languages.
 *
 * ============================================================================
 * WHY A CATALOGUE AND NOT A TERNARY AT EACH CALL SITE — B04
 * ============================================================================
 * The strings here are the ones a user reads at their least patient moment: they hit a limit, an
 * upload failed, a provider was down. Written inline as `locale === 'en' ? … : …` they drift, and
 * three of the four routes that needed them simply never got the ternary at all — which is how an
 * English user came to read a Vietnamese sentence about their daily message limit.
 *
 * 🚨 Everything here is deliberately GENERIC. Server error text is the easiest place in a codebase
 * to leak an implementation detail to an attacker, so nothing in this file names a provider, a
 * model, a policy id, an internal state or a stack. The machine-readable `error` code in the JSON
 * body is what a client branches on; this is only what a human reads.
 */
type Message = { vi: string; en: string }

/** `{n}` is substituted by `serverMessage`; nothing else is interpolated. */
const MESSAGES = {
  // Rate limiting / quotas
  'rate.retryShortly': {
    vi: 'Vui lòng thử lại sau giây lát.',
    en: 'Please try again in a moment.',
  },
  'rate.retryTomorrow': {
    vi: 'Vui lòng thử lại vào ngày mai.',
    en: 'Please try again tomorrow.',
  },
  'chat.anonLimit': {
    vi: 'Bạn đã dùng hết {n} câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy!',
    en: "You've used all {n} free questions for today. Sign in to keep chatting with Tappy!",
  },
  'chat.freeLimit': {
    vi: 'Bạn đã dùng hết {n} tin nhắn miễn phí hôm nay. Hẹn gặp lại bạn vào ngày mai nhé!',
    en: "You've used all {n} free messages for today. See you again tomorrow!",
  },
  'chat.tooLong': {
    vi: 'Tin nhắn quá dài. Vui lòng rút gọn.',
    en: 'That message is too long. Please shorten it.',
  },
  'translate.dailyLimit': {
    vi: 'Bạn đã dịch quá {n} lần hôm nay. Vui lòng quay lại vào ngày mai.',
    en: "You've used all {n} translations for today. Please come back tomorrow.",
  },
  'translate.tooLong': {
    vi: 'Văn bản quá dài (tối đa 2000 ký tự).',
    en: 'That text is too long (2000 characters maximum).',
  },
  'translate.failed': {
    vi: 'Lỗi dịch thuật. Vui lòng thử lại.',
    en: "Translation didn't work. Please try again.",
  },
} as const satisfies Record<string, Message>

export type ServerMessageKey = keyof typeof MESSAGES

/**
 * The message for a key in the request's language.
 *
 * `vars` fills `{name}` placeholders. Absent keys are left in place rather than blanked, so a
 * typo shows up as a visible `{n}` in testing instead of a sentence with a hole in it.
 */
export function serverMessage(
  key: ServerMessageKey,
  locale: RequestLocale,
  vars?: Record<string, string | number>,
): string {
  let text: string = MESSAGES[key][locale]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v))
  }
  return text
}

/** Exposed for the parity guard, which asserts every key carries both languages and differs. */
export const SERVER_MESSAGES: Record<string, Message> = MESSAGES
