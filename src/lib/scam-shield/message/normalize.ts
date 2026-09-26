import { neutralizeFenceMarkers } from '@/lib/ai/security/fence'
import { MESSAGE_MAX_CHARS } from './config'

// Scam Shield · message analysis — input normalisation.
//
// Everything the user pastes is adversarial by definition: it is the scam. This is the one place
// its SHAPE is tamed before any rule, extractor or model sees it. Meaning is preserved —
// Vietnamese diacritics, Chinese characters and emoji all survive — only the tricks do not.

/** Control characters other than tab / newline, plus the invisible formatting family scammers use
 *  to break keyword matching (zero-width space/joiner/non-joiner, word joiner, soft hyphen, BOM,
 *  bidi overrides). Written as escapes: exotic code points typed literally into source is how the
 *  fence module twice produced a binary file. */
const STRIP = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u00AD\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\uFEFF]',
  'g',
)

/** Full-width punctuation that CJK-keyboard scams use inside otherwise Vietnamese text (the
 *  full-width colon in the Telegram sample). Mapped to ASCII so a colon is a colon to every rule.
 *  Built from code points for the same reason as STRIP. */
const FULLWIDTH: Record<string, string> = {
  [String.fromCodePoint(0xff1a)]: ':',  // ：
  [String.fromCodePoint(0xff0c)]: ',',  // ，
  [String.fromCodePoint(0x3002)]: '.',  // 。
  [String.fromCodePoint(0xff01)]: '!',  // ！
  [String.fromCodePoint(0xff1f)]: '?',  // ？
  [String.fromCodePoint(0xff08)]: '(',  // （
  [String.fromCodePoint(0xff09)]: ')',  // ）
  [String.fromCodePoint(0x3010)]: '[',  // 【
  [String.fromCodePoint(0x3011)]: ']',  // 】
  [String.fromCodePoint(0x201c)]: '"',  // “
  [String.fromCodePoint(0x201d)]: '"',  // ”
  [String.fromCodePoint(0x2018)]: "'",  // ‘
  [String.fromCodePoint(0x2019)]: "'",  // ’
  [String.fromCodePoint(0xff1c)]: '<',  // ＜
  [String.fromCodePoint(0xff1e)]: '>',  // ＞
  [String.fromCodePoint(0xff0f)]: '/',  // ／
  [String.fromCodePoint(0xff20)]: '@',  // ＠
}

const FULLWIDTH_RE = new RegExp(`[${Object.keys(FULLWIDTH).join('')}]`, 'g')

export interface NormalizedMessage {
  /** The text every downstream stage works on. */
  text: string
  /** True when the input exceeded the cap and was cut. Surfaced, never silent. */
  truncated: boolean
  /** Letters in the text (any script). Cheap proxy for "how much prose is here". */
  letterCount: number
}

export function normalizeMessage(raw: string | undefined | null): NormalizedMessage {
  let text = typeof raw === 'string' ? raw : ''
  // NFC so composed and decomposed Vietnamese compare equal; NOT NFKC, which would also fold
  // full-width Latin and break Chinese quoting conventions in ways we do not need.
  text = text.normalize('NFC')
  text = text.replace(STRIP, '')
  text = text.replace(FULLWIDTH_RE, ch => FULLWIDTH[ch] ?? ch)
  // The fence is what keeps this text from impersonating an instruction; a message that already
  // contains the markers would otherwise reach the prompt looking like it closed its own span.
  text = neutralizeFenceMarkers(text)
  text = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

  let truncated = false
  if (text.length > MESSAGE_MAX_CHARS) {
    text = text.slice(0, MESSAGE_MAX_CHARS)
    truncated = true
  }

  const letterCount = (text.match(/\p{L}/gu) ?? []).length
  return { text, truncated, letterCount }
}
