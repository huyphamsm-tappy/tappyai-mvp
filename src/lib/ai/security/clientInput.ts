// ── P3-S1: the client input trust boundary ───────────────────────────────────
//
// Everything a client sends is UNTRUSTED. This module is the single place that
// decides what the application will accept, and it runs BEFORE any prompt is
// built and before any model is called.
//
// Two audit findings are closed here:
//   F1 — `userPreferences` were written verbatim into the SYSTEM prompt, with no
//        length bound, no shape constraint, and no accounting against any input
//        budget.
//   F2 — `messages[]` was accepted with arbitrary roles and arbitrary structure
//        and forwarded to the provider as-is.
//
// The mechanism is CANONICAL RE-MATERIALISATION. An accepted message is a NEW
// object assembled from an allowlist of fields; the caller's object is never
// forwarded. That is strictly stronger than deleting known-bad fields, which is
// a blocklist and fails the moment a new field appears — for example when an SDK
// upgrade adds one.
//
// SCOPE (deliberately narrow — see P3 audit):
//   IN  — client message roles/shapes, client preference shape, one bounded
//         client-input budget.
//   OUT — memory write validation (S3), non-forgeable fencing of untrusted spans
//         (S2), retrieval/tool-output injection, provider capability
//         enforcement. This module does NOT solve prompt injection; it removes
//         the client's ability to forge STRUCTURE and AUTHORITY.

/** Every bound on client-controlled input, in one auditable place. */
export const CLIENT_INPUT_LIMITS = {
  /** Turns per request. The route separately trims to the last 10 for cost. */
  maxMessages: 100,
  /** Total TEXT across all messages. Unchanged from the pre-S1 route cap, so
   *  no currently-valid conversation becomes invalid. */
  maxMessageTextChars: 24_000,
  maxPreferenceItems: 50,
  maxPreferenceItemChars: 200,
  maxPreferenceTotalChars: 4_000,
  /** The single ceiling on client-controlled TEXT. Asserted to equal the sum of
   *  its parts so raising a sub-limit cannot silently widen the total. */
  maxTotalClientTextChars: 28_000,
  /** Image payloads are bounded separately: they are base64 blobs, and folding
   *  them into the text budget would make that budget meaningless. */
  maxImagePartsPerMessage: 4,
  maxImageDataUrlChars: 8_000_000,
} as const

/** Roles a CLIENT may send. `system` and `tool` are application-owned and can
 *  never originate outside the server. */
const ALLOWED_ROLES = ['user', 'assistant'] as const
export type ClientRole = (typeof ALLOWED_ROLES)[number]

/** Message-level keys that reach the provider if forwarded. `providerOptions`
 *  and its legacy alias are read by the AI SDK and passed to the adapter, so a
 *  client could otherwise move the Anthropic cache breakpoint. */
const FORBIDDEN_MESSAGE_KEYS = ['providerOptions', 'experimental_providerMetadata'] as const

export type TextPart = { type: 'text'; text: string }
export type ImagePart = { type: 'image'; image: string }
export type ValidatedPart = TextPart | ImagePart

/**
 * Role-aware by design. An image may only appear on a USER turn: an assistant
 * turn carrying an image is not something any client produces, and it is not
 * representable in the SDK's assistant-message type either — so accepting one
 * would mean handing the provider a message it cannot express.
 */
export type ValidatedMessage =
  | { role: 'user'; content: string | ValidatedPart[] }
  | { role: 'assistant'; content: string | TextPart[] }

export type RejectCode =
  | 'invalid_request'
  | 'invalid_role'
  | 'invalid_content'
  | 'forbidden_structure'
  | 'too_many_messages'
  | 'message_too_long'
  | 'too_many_images'
  | 'image_too_large'
  | 'invalid_preferences'
  | 'preference_too_long'
  | 'too_many_preferences'
  | 'preference_budget_exceeded'
  | 'input_budget_exceeded'

export type ValidationResult =
  | { ok: true; messages: ValidatedMessage[]; preferences: string[]; totalChars: number }
  | { ok: false; code: RejectCode; detail: string }

const reject = (code: RejectCode, detail: string): ValidationResult => ({ ok: false, code, detail })

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Characters that can add STRUCTURE rather than meaning.
 *
 * Built from CODE POINTS rather than written as literals: raw C0/C1 bytes and
 * especially U+2028/U+2029 (real JavaScript line terminators) embedded in source
 * make a file binary to line-based tooling and are a classic footgun.
 *
 * C0 + DEL/C1, the Unicode line and paragraph separators, and the zero-width /
 * BOM family used to smuggle invisible payloads past visual review.
 */
const STRUCTURAL_CODE_POINTS: ReadonlySet<number> = (() => {
  const s = new Set<number>()
  for (let c = 0x00; c <= 0x1f; c++) s.add(c)
  for (let c = 0x7f; c <= 0x9f; c++) s.add(c)
  for (const c of [0x2028, 0x2029, 0x200b, 0x200c, 0x200d, 0xfeff]) s.add(c)
  return s
})()

/**
 * Collapse a value to a single line of text.
 *
 * This is a SHAPE constraint, not a content blocklist: it does not look for
 * "malicious" words and makes no judgement about meaning. "Ignore previous
 * instructions." survives intact — as one line of data inside a bulleted item,
 * which is exactly what it should be. What cannot survive is a line break, so a
 * preference can never open a new section or forge a block header.
 */
function toSingleLine(value: string): string {
  let out = ''
  for (const ch of value) {
    out += STRUCTURAL_CODE_POINTS.has(ch.codePointAt(0) ?? 0) ? ' ' : ch
  }
  return out.replace(/\s+/g, ' ').trim()
}

function validatePart(part: unknown): ValidatedPart | RejectCode {
  if (!isRecord(part)) return 'invalid_content'
  if (part.type === 'text') {
    return typeof part.text === 'string' ? { type: 'text', text: part.text } : 'invalid_content'
  }
  if (part.type === 'image') {
    const image = part.image
    if (typeof image !== 'string' || !image.startsWith('data:')) return 'invalid_content'
    if (image.length > CLIENT_INPUT_LIMITS.maxImageDataUrlChars) return 'image_too_large'
    return { type: 'image', image }
  }
  // Everything else — tool-call, tool-result, function_call, file, video,
  // image_url, redacted_thinking, and anything a future SDK invents.
  return 'invalid_content'
}

export function validateClientInput(body: unknown): ValidationResult {
  const L = CLIENT_INPUT_LIMITS

  if (!isRecord(body)) return reject('invalid_request', 'body must be an object')
  const rawMessages = body.messages
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return reject('invalid_request', 'messages must be a non-empty array')
  }
  if (rawMessages.length > L.maxMessages) {
    return reject('too_many_messages', `at most ${L.maxMessages} messages`)
  }

  const messages: ValidatedMessage[] = []
  let messageChars = 0

  for (const raw of rawMessages) {
    if (!isRecord(raw)) return reject('invalid_role', 'each message must be an object')

    const role = raw.role
    if (typeof role !== 'string' || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
      return reject('invalid_role', `role must be one of ${ALLOWED_ROLES.join(', ')}`)
    }

    for (const key of FORBIDDEN_MESSAGE_KEYS) {
      if (key in raw) return reject('forbidden_structure', `${key} may not be set by a client`)
    }

    const isUser = role === 'user'
    const content = raw.content
    if (typeof content === 'string') {
      /**
       * 🚨 C04. An empty string used to reach the provider and throw there, surfacing as
       * **HTTP 200** with the stream frame `3:"An error occurred."` — hardcoded English, identical
       * under `Accept-Language: vi`. Every other malformed shape is a clean 400 at validation.
       *
       * The two roles are NOT the same case, which is why this is not one blanket rejection:
       *
       *  - An empty USER turn is a client bug. There is nothing to answer, so it is refused here
       *    and joins `invalid_role` and `forbidden_structure` as an honest 400.
       *
       *  - An empty ASSISTANT turn is a legitimate SDK shape — a tool-only turn, whose content
       *    lived in `toolInvocations`. But this validator strips `toolInvocations` by design
       *    (that is what stops a forged tool result reaching the model), so what is left carries
       *    no information at all and is precisely what the provider rejects. Dropping it keeps the
       *    conversation valid instead of failing it.
       */
      if (content.trim().length === 0) {
        if (isUser) return reject('invalid_content', 'a user message must not be empty')
        continue // emptied assistant turn — carry nothing rather than an empty message
      }
      messageChars += content.length
      // Rebuilt, not reused: UI-only fields the SDK sends (id, createdAt,
      // toolInvocations, parts, annotations, data) are dropped by construction.
      messages.push(isUser ? { role: 'user', content } : { role: 'assistant', content })
      continue
    }

    if (!Array.isArray(content) || content.length === 0) {
      return reject('invalid_content', 'content must be a non-empty string or parts array')
    }

    const imageCount = content.filter(p => isRecord(p) && p.type === 'image').length
    if (imageCount > L.maxImagePartsPerMessage) {
      return reject('too_many_images', `at most ${L.maxImagePartsPerMessage} images per message`)
    }
    if (imageCount > 0 && !isUser) {
      return reject('invalid_content', 'only a user message may carry an image')
    }

    const parts: ValidatedPart[] = []
    for (const rawPart of content) {
      const part = validatePart(rawPart)
      if (typeof part === 'string') return reject(part, 'unsupported content part')
      if (part.type === 'text') messageChars += part.text.length
      parts.push(part)
    }
    messages.push(isUser
      ? { role: 'user', content: parts }
      : { role: 'assistant', content: parts as TextPart[] })
  }

  // Dropping emptied assistant turns (above) can empty the whole conversation — a body of nothing
  // but tool-only turns. Sending an empty array to the provider is the same 200-plus-stream-error
  // this fix exists to remove, so it is refused here instead.
  if (messages.length === 0) {
    return reject('invalid_request', 'no message carried any content')
  }

  if (messageChars > L.maxMessageTextChars) {
    return reject('message_too_long', `at most ${L.maxMessageTextChars} characters of message text`)
  }

  // ── preferences ────────────────────────────────────────────────────────────
  const rawPrefs = body.userPreferences
  const preferences: string[] = []
  let prefChars = 0

  if (rawPrefs !== undefined && rawPrefs !== null) {
    if (!Array.isArray(rawPrefs)) return reject('invalid_preferences', 'userPreferences must be an array')
    if (rawPrefs.length > L.maxPreferenceItems) {
      return reject('too_many_preferences', `at most ${L.maxPreferenceItems} preferences`)
    }
    for (const item of rawPrefs) {
      if (typeof item !== 'string') return reject('invalid_preferences', 'each preference must be a string')
      // Bound the RAW value first, so padding with control characters cannot buy
      // extra length that normalisation would then hide.
      if (item.length > L.maxPreferenceItemChars) {
        return reject('preference_too_long', `at most ${L.maxPreferenceItemChars} characters per preference`)
      }
      const normalized = toSingleLine(item)
      if (normalized.length === 0) continue
      prefChars += normalized.length
      preferences.push(normalized)
    }
    if (prefChars > L.maxPreferenceTotalChars) {
      return reject('preference_budget_exceeded', `at most ${L.maxPreferenceTotalChars} characters of preferences`)
    }
  }

  // Backstop. The sub-limits above already imply this, and a test pins the
  // ceiling to their sum — so if someone raises one without raising the total,
  // this is what catches it rather than silently widening the surface.
  const totalChars = messageChars + prefChars
  if (totalChars > L.maxTotalClientTextChars) {
    return reject('input_budget_exceeded', `at most ${L.maxTotalClientTextChars} characters of client text`)
  }

  return { ok: true, messages, preferences, totalChars }
}
