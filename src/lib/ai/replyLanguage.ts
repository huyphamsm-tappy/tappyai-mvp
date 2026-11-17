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

/** A script nothing else writes: the message's own letters say its language whatever the conversation was in. */
const SCRIPT_LANG_CODES: ReadonlySet<string> = new Set(['zh', 'ja', 'ko', 'th', 'ar'])

/**
 * ONE language decision per turn (17/11). Every reader of the turn's language takes it from here; none runs a detector of its own.
 *   lang    the language the reply is written in when nothing else says (the app's default line, the cards, the code's own strings);
 *   source  what settled it;
 *   named   the language the turn states to the model BY NAME, or null. Set only when the latest message itself settles it
 *           (source 'message') and saying it adds something: a script of its own, or a conversation whose nearest settled earlier
 *           turn is NOT in this language (a switch: the pull of the earlier turns is what the name is there to beat). A first
 *           message and an ordinary Vietnamese or English thread name nothing, as before.
 */
export interface ReplyLanguageDecision { lang: string; source: ReplyLanguageSource; named: string | null }

export function resolveReplyLanguage(input: { lastText: string; priorUserTexts: readonly string[]; clientLocale: string | null }): ReplyLanguageDecision {
  const priorLang = (): string | null => {
    for (let i = input.priorUserTexts.length - 1; i >= 0; i--) {
      const t = input.priorUserTexts[i]
      const prior = detectExplicitLangRequest(t) ?? detectLangConfident(t)
      if (prior) return prior
    }
    return null
  }
  const explicit = detectExplicitLangRequest(input.lastText)
  if (explicit) return { lang: explicit, source: 'explicit', named: null }
  const clear = detectLangConfident(input.lastText)
  if (clear) {
    // A switch = there are earlier turns and the nearest one that settles a language is not this one (earlier turns that settle
    // nothing count as "not this one": the name costs one line, a reply in the wrong language costs the answer).
    const switched = input.priorUserTexts.length > 0 && priorLang() !== clear
    return { lang: clear, source: 'message', named: SCRIPT_LANG_CODES.has(clear) || switched ? clear : null }
  }
  const prior = priorLang()
  if (prior) return { lang: prior, source: 'conversation', named: null }
  if (input.clientLocale) return { lang: input.clientLocale, source: 'client', named: null }
  return { lang: detectLang(input.lastText), source: 'detect', named: null }
}
