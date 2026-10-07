// ── ADR-027 (amended 2026-09-28): the reply follows the CONVERSATION's language ─────────────
//
// Owner decision 2026-09-28. Measured on the Android emulator (UI in English): a Vietnamese thread
// got Vietnamese replies until the short, unaccented "len ke hoach 2 ngay 1 dem" — which no text
// detector can settle — and that turn was answered in ENGLISH, because the client's UI locale was
// the tie-breaker. The UI language is not the conversation's language. Order now:
//
//   1. an explicit request in the message ("Answer in English", "Trả lời bằng tiếng Việt");
//   2. the language the message is CLEARLY in (detectLangConfident — accents, script, function words);
//   3. the conversation: the nearest earlier USER turn that settles a language (an explicit request
//      there counts too — "answer in English" holds for the thread until the user says otherwise);
//   4. the client's locale — only when nothing the user wrote settles it (a first turn "ok");
//   5. whole-sentence detection (defensive tail).
//
// Stateless per request, as ADR-016 §8 requires: it reads only the messages the client sent.

import { detectExplicitLangRequest, detectLangConfident, detectLang } from './intent'

export type ReplyLanguageSource = 'explicit' | 'message' | 'conversation' | 'client' | 'detect'

export function resolveReplyLanguage(input: { lastText: string; priorUserTexts: readonly string[]; clientLocale: string | null }): { lang: string; source: ReplyLanguageSource } {
  const explicit = detectExplicitLangRequest(input.lastText)
  if (explicit) return { lang: explicit, source: 'explicit' }
  const clear = detectLangConfident(input.lastText)
  if (clear) return { lang: clear, source: 'message' }
  for (let i = input.priorUserTexts.length - 1; i >= 0; i--) {
    const t = input.priorUserTexts[i]
    const prior = detectExplicitLangRequest(t) ?? detectLangConfident(t)
    if (prior) return { lang: prior, source: 'conversation' }
  }
  if (input.clientLocale) return { lang: input.clientLocale, source: 'client' }
  return { lang: detectLang(input.lastText), source: 'detect' }
}
