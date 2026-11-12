// R13 §7.1 the four language layers, as data (pure, browser-safe, no model):
//   1. Source Language: the language(s) the ORIGINAL data about the target is written in (a hint from the target's country, never a measurement).
//   2. Query Language: what the person wrote in (the instruction "answer in English" is cut out first, so "用中文回答：Phở Thìn..." is a Vietnamese question).
//   3. Processing Language: advisory only. No internal reasoning language is forced and nothing here claims to control what the model thinks.
//   4. Response Locale: the person's EXPLICIT request ("answer in English", "用中文回答", "trả lời bằng tiếng Anh") wins, then the locale the person CHOSE (a saved setting),
//      then the language the question is clearly in, then the conversation's, then a client hint, then the configured default. Detection never beats a choice.
// A location fact is never read from the language: this file returns no place.

import { detectExplicitLangRequest, detectLang, detectLangConfident } from '@/lib/ai/intent'
import { reportQuestionLang, VI_BARE } from '@/lib/ai/research/reportLang'
import { COUNTRIES } from './geoGazetteer'
import { withoutNoTranslate } from './noTranslate'

export type LocaleTag = string

export type ResponseLocaleSource = 'EXPLICIT_REQUEST' | 'USER_CHOICE' | 'QUERY' | 'CONVERSATION' | 'CLIENT_HINT' | 'DEFAULT'

export interface LanguageLayers {
  /** languages the original sources about the target are probably written in (empty when no target) */
  sourceLanguages: LocaleTag[]
  /** the language of the question, null when the text settles none; `confident` false = only the whole-sentence fallback */
  queryLanguage: { code: LocaleTag; confident: boolean } | null
  /** advisory prompt-format language; `controlsModel` is always false: never claimed */
  processingLanguage: { code: LocaleTag; advisory: true; controlsModel: false }
  responseLocale: { code: LocaleTag; source: ResponseLocaleSource }
}

const ZH_LANG: Array<[RegExp, string]> = [
  [/中文|汉语|漢語|普通话|普通話|国语|國語|华语/, 'zh'], [/英文|英语|英語/, 'en'], [/越南语|越南文|越语|越南話|越南话/, 'vi'],
  [/日语|日文|日語/, 'ja'], [/韩语|韩文|韓語|韩国语/, 'ko'], [/泰语|泰文|泰語/, 'th'],
]
// 用中文回答 / 请用英文回复 / 以越南语回答 / 中文回答 / 请说中文
const ZH_USE = /(?:用|以|請用|请用|使用|改用|换成|換成|切换到|切換到|讲|講|说|說)\s*(中文|汉语|漢語|普通话|普通話|国语|國語|华语|英文|英语|英語|越南语|越南文|越语|越南話|越南话|日语|日文|日語|韩语|韩文|韓語|韩国语|泰语|泰文|泰語)/
const ZH_ANSWER = /(中文|汉语|漢語|普通话|普通話|英文|英语|英語|越南语|越南文|越语|日语|日文|韩语|韩文|泰语|泰文)\s*(?:回答|回复|回覆|作答|答复|答覆)/

function zhCode(word: string): string | null {
  for (const [re, code] of ZH_LANG) if (re.test(word)) return code
  return null
}

export interface ExplicitRequest { code: LocaleTag; /** the instruction itself, so the question can be read without it */ matched: string }

/** An explicit "answer in <language>" in Vietnamese, English or Chinese; null when the text carries none. Pure. */
export function explicitLanguageRequest(text: string): ExplicitRequest | null {
  const zh = ZH_USE.exec(text) ?? ZH_ANSWER.exec(text)
  if (zh) { const code = zhCode(zh[1]); if (code) return { code, matched: zh[0] } }
  const code = detectExplicitLangRequest(text)
  return code ? { code, matched: '' } : null
}

// the instruction clause cut from the question: "Trả lời bằng tiếng Anh: giá thuê..." / "Answer in English - ..." / "用中文回答：..."
const INSTRUCTION_CLAUSE: RegExp[] = [
  /(?:^|[\s,;.])(?:vui\s+lòng\s+|hãy\s+|xin\s+)?(?:trả\s*lời|tra\s*loi|nói|noi|dùng|dung|viết|viet)\s+(?:bằng|bang|sang|b[aằ]ng)?\s*(?:tiếng|tieng)\s*(?:việt|viet|anh|trung|nhật|nhat|hàn|han|thái|thai)\s*[:：,\-–—]?/giu,
  /(?:please\s+)?\b(?:answer|respond|reply|speak|write)\b[^.!?\n:：]{0,24}\b(?:english|vietnamese|chinese|mandarin|japanese|korean|thai)\b\s*(?:please)?\s*[:：,\-–—]?/giu,
  /(?:请|請)?\s*(?:用|以|使用|改用)\s*(?:中文|汉语|漢語|普通话|英文|英语|英語|越南语|越南文|日语|韩语|泰语)\s*(?:回答|回复|回覆|作答|说|讲)?\s*[:：,，]?/gu,
  /(?:中文|英文|英语|越南语|越南文)\s*(?:回答|回复|回覆|作答)\s*[:：,，]?/gu,
]

/** The text without its "answer in X" clause (what the question itself is written in). Pure. */
export function stripLanguageInstruction(text: string): string {
  let t = text
  for (const re of INSTRUCTION_CLAUSE) t = t.replace(re, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/** The language of the question: `reportQuestionLang` first (accents, script, function words), the whole-sentence detector only as a low-confidence fallback. Pure. */
export function queryLanguageOf(text: string): { code: LocaleTag; confident: boolean } | null {
  const stripped = stripLanguageInstruction(text)
  if (!/\p{L}/u.test(stripped)) return null
  const sure = reportQuestionLang(stripped) ?? detectLangConfident(stripped)
  if (sure) return { code: sure, confident: true }
  // names of places, dishes and brands are not the person's language ("Best bún chả in Hà Nội" is English): read the rest
  const masked = withoutNoTranslate(stripped)
  if (masked !== stripped && /\p{L}/u.test(masked)) {
    const rest = reportQuestionLang(masked) ?? detectLangConfident(masked)
    if (rest) return { code: rest, confident: true }
    // what is left after the names (two or more plain words, none of them Vietnamese) is English: "Best in" from "Best bún chả in Hanoi"
    if (guessIsPlainEnglish(masked, masked.match(/[A-Za-z]{2,}/g) ?? [], 2)) return { code: 'en', confident: true }
  }
  // three or more plain ASCII words with no un-accented Vietnamese word among them are English; one or two words ("ok") settle nothing
  const ascii = stripped.match(/[A-Za-z]{2,}/g) ?? []
  if (guessIsPlainEnglish(stripped, ascii)) return { code: 'en', confident: true }
  return { code: detectLang(stripped), confident: false }
}

function guessIsPlainEnglish(text: string, asciiWords: string[], minWords = 3): boolean {
  if (asciiWords.length < minWords || /[^\x00-\x7F]/.test(text.replace(/[?!.,;:'"()\-–—…]/g, ''))) return false
  return !asciiWords.some(w => VI_BARE.has(w.toLowerCase())) && detectLang(text) === 'en'
}

export interface LanguageInput {
  text: string
  /** the person's earlier turns, oldest first */
  priorUserTexts?: readonly string[]
  /** the locale the person CHOSE (a saved setting): beats detection, loses to an explicit request in the conversation */
  chosenLocale?: LocaleTag | null
  /** the client's UI locale: a hint, the weakest source */
  uiLocale?: LocaleTag | null
  /** the configured product default */
  defaultLocale?: LocaleTag
  /** where the target lies (ISO country), for the Source Language hint */
  targetCountry?: string | null
}

export function resolveLanguageLayers(input: LanguageInput): LanguageLayers {
  const prior = input.priorUserTexts ?? []
  const query = queryLanguageOf(input.text)

  let response: LanguageLayers['responseLocale'] | null = null
  const here = explicitLanguageRequest(input.text)
  if (here) response = { code: here.code, source: 'EXPLICIT_REQUEST' }
  if (!response) {
    // "answer in English" holds for the thread until the person says otherwise (ADR-027): the nearest earlier explicit request
    for (let i = prior.length - 1; i >= 0; i--) {
      const e = explicitLanguageRequest(prior[i])
      if (e) { response = { code: e.code, source: 'EXPLICIT_REQUEST' }; break }
    }
  }
  if (!response && input.chosenLocale) response = { code: input.chosenLocale.split('-')[0].toLowerCase(), source: 'USER_CHOICE' }
  if (!response && query?.confident) response = { code: query.code, source: 'QUERY' }
  if (!response) {
    for (let i = prior.length - 1; i >= 0; i--) {
      const q = queryLanguageOf(prior[i])
      if (q?.confident) { response = { code: q.code, source: 'CONVERSATION' }; break }
    }
  }
  if (!response && input.uiLocale) response = { code: input.uiLocale.split('-')[0].toLowerCase(), source: 'CLIENT_HINT' }
  // nothing the person wrote settles a language (a bare "ok"): the configured default; the whole-sentence fallback guess is NOT promoted to a reply language
  if (!response) response = { code: input.defaultLocale ?? 'vi', source: 'DEFAULT' }

  const sourceLanguages = input.targetCountry ? [...(COUNTRIES[input.targetCountry]?.languages ?? [])] : []
  return {
    sourceLanguages,
    queryLanguage: query,
    processingLanguage: { code: query?.code ?? response.code, advisory: true, controlsModel: false },
    responseLocale: response,
  }
}
