// -- OUTBOUND TEXT SANITIZER: what the model writes is shown as text, never as hidden structure --------------------------------------
//
// Live UAT 3 (3027, 14/10/2026, turn M6.1): the reply ended with the model's own citation marker -- U+E200 "cite" U+E202
// "turn0search0" U+E201 -- and the user saw "citeturn0search0". Nothing on the way out filtered it: the client-input boundary
// (clientInput.ts) strips invisible characters from what the CLIENT sends; the model's reply reached the user as written.
//
// Removed from the reply text (`stripModelArtifacts`, one rule for the stream AND for the reply text kept in the session):
//   - the model's citation marker, whole (U+E200 ... U+E201, at most 200 characters inside), with the spaces before it -- live evidence;
//   - a marker opened and never closed before the text ends (a cut-off marker), with the spaces before it;
//   - the visible text of that same marker when its private-use characters are gone: "citeturn0search0", "citeturn0search0turn1news2";
//   - the bracket citation with its dagger, "\u{3010}3\u{2020}source\u{3011}" / "\u{3010}4:0\u{2020}file.pdf\u{3011}" (owner-named example).
//     A bracket WITHOUT the dagger ("\u{3010}1\u{3011}") is ordinary text and stays;
//   - private-use characters (U+E000-U+F8FF, planes 15-16);
//   - Unicode TAG characters (U+E0000-U+E007F), except inside an emoji tag sequence (U+1F3F4 + tags = a subdivision flag);
//   - bidirectional controls (U+202A-U+202E, U+2066-U+2069, U+200E, U+200F, U+061C);
//   - zero-width / BOM characters (U+200B, U+200C, U+2060, U+FEFF, U+180E), and ZERO WIDTH JOINER outside an emoji sequence;
//   - C0 / C1 control characters other than tab and line breaks.
// Kept: every script (Vietnamese included, precomposed or not), emoji with their joiners, skin tones and variation selectors, markdown.
//
// SOURCE RULE: this file is ASCII. Non-printing code points are written as \u{...} escapes or numbers, never as raw characters
// (sourceInvisibleChars.test.ts enforces it).
// Owner decision 14/10/2026: this output filter first, behind CONSULT_LUNA_ONE; the full security mechanism for Tappy after Phase 8.
// Pure; no network.

const CITE_MARKER = /[ \t]*\u{E200}[^\u{E200}\u{E201}]{0,200}\u{E201}/gu
const CITE_CUT_OFF = /[ \t]*\u{E200}[^\u{E200}\u{E201}]{0,200}$/u
const CITE_TEXT = /[ \t]*(?<![A-Za-z0-9_])cite(?:turn\d+[a-z]+\d+)+(?![A-Za-z0-9_])/gu
const CITE_BRACKET = /[ \t]*\u{3010}\d+(?::\d+)?\u{2020}[^\u{3011}\n]{1,60}\u{3011}/gu

const isPictographic = (cp: number | undefined) => cp !== undefined && /\p{Extended_Pictographic}/u.test(String.fromCodePoint(cp))
const isEmojiModifier = (cp: number | undefined) => cp !== undefined && ((cp >= 0x1f3fb && cp <= 0x1f3ff) || cp === 0xfe0f)

/** Is this code point (at index i of the text's code points) one the reply must not carry? */
function dropCodePoint(cps: readonly number[], i: number): boolean {
  const c = cps[i]
  if (c === 0x09 || c === 0x0a || c === 0x0d) return false
  if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true
  if ((c >= 0xe000 && c <= 0xf8ff) || c >= 0xf0000) return true
  if (c >= 0xe0000 && c <= 0xe007f) {
    let j = i
    while (j > 0 && cps[j - 1] >= 0xe0000 && cps[j - 1] <= 0xe007f) j--
    return cps[j - 1] !== 0x1f3f4
  }
  if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0x200e || c === 0x200f || c === 0x061c) return true
  if (c === 0x200b || c === 0x200c || c === 0x2060 || c === 0xfeff || c === 0x180e) return true
  if (c === 0x200d) return !((isPictographic(cps[i - 1]) || isEmojiModifier(cps[i - 1])) && isPictographic(cps[i + 1]))
  return false
}

/** The reply text with the model's citation markers and every hidden / reordering character removed. The same rule everywhere. */
export function stripModelArtifacts(text: string): string {
  if (!text) return text
  const t = text.replace(CITE_MARKER, '').replace(CITE_CUT_OFF, '').replace(CITE_TEXT, '').replace(CITE_BRACKET, '')
  const cps = Array.from(t, ch => ch.codePointAt(0)!)
  let out = ''
  let changed = t !== text
  for (let i = 0; i < cps.length; i++) {
    if (dropCodePoint(cps, i)) { changed = true; continue }
    out += String.fromCodePoint(cps[i])
  }
  return changed ? out : text
}

// The END of a text that cannot be decided yet (more text may still arrive): its result depends on what follows.
const HOLD_OPEN_MARKER = /[ \t]*\u{E200}[^\u{E200}\u{E201}]{0,200}$/u
const HOLD_CITE_TEXT = /[ \t]*(?:(?<![A-Za-z0-9_])cite(?:turn\d+[a-z]+\d+)*(?:t|tu|tur|turn|turn\d+|turn\d+[a-z]+)?|(?<![A-Za-z0-9_])(?:c|ci|cit))$/u
const HOLD_BRACKET = /[ \t]*\u{3010}[^\u{3011}\n]{0,70}$/u
const HOLD_SPACES = /[ \t]+$/u
const HOLD_JOINER = /\u{200D}$/u

/** How many characters at the end of `text` must wait: the longest of the undecided endings above (0 when the text can all be sent). */
export function undecidedTail(text: string): number {
  let n = 0
  for (const re of [HOLD_OPEN_MARKER, HOLD_CITE_TEXT, HOLD_BRACKET, HOLD_SPACES, HOLD_JOINER]) {
    const m = re.exec(text)
    if (m && m[0].length > n) n = m[0].length
  }
  return n
}

/**
 * The data stream, sanitized: the text of all `0:` frames is treated as ONE text. Each time a text frame arrives the whole decided
 * prefix is sanitized again with `stripModelArtifacts` and only what is new is sent, so what the client ends up with is exactly
 * `stripModelArtifacts(all the text)` -- the same result the session keeps -- wherever the frames were split. The undecided end waits
 * (across `9:` / `a:` / `8:` frames too) and is settled at the finish frame `d:` or at the end of the stream. Every frame that is not
 * text passes byte for byte.
 */
export function outboundTextSanitizer(log: (e: Record<string, unknown>) => void = e => console.warn(JSON.stringify(e))): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let partial = ''
  let raw = ''
  let sent = ''
  let rawSent = 0
  const emitText = (controller: TransformStreamDefaultController<Uint8Array>, text: string) => {
    if (text) controller.enqueue(encoder.encode('0:' + JSON.stringify(text) + '\n'))
  }
  const settle = (controller: TransformStreamDefaultController<Uint8Array>, final: boolean) => {
    const end = final ? raw.length : raw.length - undecidedTail(raw)
    if (end <= rawSent) return
    const clean = stripModelArtifacts(raw.slice(0, end))
    if (clean.startsWith(sent)) {
      emitText(controller, clean.slice(sent.length))
      sent = clean
    } else {
      // Not expected (the undecided end is held back so that a decided prefix never changes); measured, and the new part is still
      // sanitized on its own.
      log({ type: 'tappyai_guard', guard: 'outbound_sanitizer', kind: 'prefix_mismatch', sent_chars: sent.length, clean_chars: clean.length })
      const piece = stripModelArtifacts(raw.slice(rawSent, end))
      emitText(controller, piece)
      sent += piece
    }
    rawSent = end
  }
  const line = (controller: TransformStreamDefaultController<Uint8Array>, l: string, eol: string) => {
    if (l.startsWith('0:')) {
      let s: unknown
      try { s = JSON.parse(l.slice(2)) } catch { s = undefined }
      if (typeof s === 'string') { raw += s; settle(controller, false); return }
    }
    // The finish frame closes the text: everything before it is settled first, so the client has the whole reply before "done".
    if (l.startsWith('d:')) settle(controller, true)
    controller.enqueue(encoder.encode(l + eol))
  }
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      partial += decoder.decode(chunk, { stream: true })
      let nl = partial.indexOf('\n')
      while (nl >= 0) {
        line(controller, partial.slice(0, nl), '\n')
        partial = partial.slice(nl + 1)
        nl = partial.indexOf('\n')
      }
    },
    flush(controller) {
      partial += decoder.decode()
      if (partial) { line(controller, partial, ''); partial = '' }
      settle(controller, true)
    },
  })
}
