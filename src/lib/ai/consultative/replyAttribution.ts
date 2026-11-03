// ── CONSULT_ANSWER_ATTRIBUTION (Wave 2, default OFF) · what a reply to a clarifying question IS ───────────────────────────────────────
//
// THE DEFECT (Finding 1, pinned by clarifyAnswer.measure.test.ts). When the previous Tappy turn asked a clarifying question, the NEXT user message was ALWAYS read as its
// answer: turn "pick", the thread's query, the same domain - whatever it said ("what is the capital of France?", "thanks", "write me a birthday wish"). The only exception was a
// reply that named another consultation domain strongly. Nothing checked whether the reply ANSWERED the question that was asked.
//
// THE FIX (owner decision, option B): ONE shared function labels the reply, from STRUCTURE, never from the topic of the question:
//   answer       it matches one of the options the card offered (a button, or its words typed), or it fills the information slot the question asked (budget, party size, date, time)
//   new_request  it does not answer, and it is a request of its own: a question of its own (a sentence of four or more words ending in "?"), or a greeting / closing / out-of-scope
//                message of two or more words that the router's own rules already recognise
//   unclear      anything else - a short fragment, a one-word acknowledgement, a delegation ("you choose"), or a reply that carries information without matching what was asked
// (A rule "a long sentence that carries no information is a new request" was measured and DROPPED: it read "whatever, you pick for me" as a new request.)
// Only `new_request` changes the behaviour: the reply is then read as what it is (a new request) instead of as the answer. `answer` and `unclear` keep the OLD behaviour exactly:
// an ambiguous reply is still read as the answer.
//
// This file does no routing and imports nothing from the router (the router injects what it knows: the slot reader and its own rules), so the router, the brain's
// "never two asks in a row" rule and the route all call the same function through consultRouter.isAnswerToAsk. No keyword list lives here.

export type AskReplyLabel = 'answer' | 'new_request' | 'unclear'
export interface AskReplyAttribution { label: AskReplyLabel; signal: string }

/** What the router lends: a folding function (lower case, no diacritics), the slot reader for the thread's domain (null when the domain is not known) and its own greeting/out-of-scope rule. */
export interface AttributionDeps {
  fold: (text: string) => string
  slotKnown: ((text: string) => { known: Record<string, string>; area?: string }) | null
  aloneIsRuleChat: (text: string) => boolean
  /** The reply points at something shown in this thread ("the second one ...", a shown name): it is about the thread, never a new request. */
  pointsAtThread: (text: string) => boolean
}

/** A sentence of this many words that ends in "?" is a question of its own. */
export const QUESTION_MIN_WORDS = 4
/** A greeting / closing the router recognises is a new request only from this many words (a single "ok" / "ừ" is the user accepting whatever Tappy picks). */
export const RULE_CHAT_MIN_WORDS = 2

/** The card's own question ids that name an information slot, and the slot keys the router's reader fills for them. */
const ASKED_SLOT_KEYS: Readonly<Record<string, readonly string[]>> = {
  budget: ['ngan_sach'], party: ['so_nguoi'], date: ['ngay', 'ngay_ve', 'thoi_gian'], time: ['gio', 'thoi_gian', 'ngay'],
}
/** The options and question ids of the [TAPPY_ASK] card in the previous Tappy message (empty when it has none or it cannot be read). */
export function shownAsk(prevAssistantText: string): { ids: string[]; options: string[] } {
  const m = /\[TAPPY_ASK\]([\s\S]*?)\[\/TAPPY_ASK\]/.exec(prevAssistantText ?? '')
  if (!m) return { ids: [], options: [] }
  try {
    const j = JSON.parse(m[1]) as { questions?: Array<{ id?: unknown; options?: unknown }> }
    const qs = Array.isArray(j.questions) ? j.questions : []
    return {
      ids: qs.map(q => (typeof q.id === 'string' ? q.id : '')).filter(Boolean),
      options: qs.flatMap(q => (Array.isArray(q.options) ? q.options : [])).filter((o): o is string => typeof o === 'string' && o.trim() !== ''),
    }
  } catch { return { ids: [], options: [] } }
}

const wordsOf = (folded: string): string[] => folded.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w))

/** Pure. Labels `reply` (a user message) given the previous Tappy message. */
export function attributeReply(prevAssistantText: string, reply: string, deps: AttributionDeps): AskReplyAttribution {
  const text = (reply ?? '').trim()
  if (!/[\p{L}\p{N}]/u.test(text)) return { label: 'unclear', signal: 'empty' }
  const f = deps.fold(text)
  const words = wordsOf(f)
  const asked = shownAsk(prevAssistantText)

  // 1. one of the options the card offered (the button text, or the same words typed)
  for (const o of asked.options) {
    const g = deps.fold(o).trim()
    if (g.length >= 2 && (f === g || f.includes(g) || (f.length >= 3 && g.includes(f)))) return { label: 'answer', signal: 'option' }
  }
  // 2. the information slot the question asked is filled by the reply (the slot reader is the router's own)
  const read = deps.slotKnown ? deps.slotKnown(text) : null
  if (read) {
    for (const id of asked.ids) {
      const keys = ASKED_SLOT_KEYS[id]
      if (keys && keys.some(k => (read.known[k] ?? '') !== '')) return { label: 'answer', signal: `asked_slot:${id}` }
      if (id === 'area' && read.area) return { label: 'answer', signal: 'asked_slot:area' }
    }
  }
  // 2b. a sentence that points at what the thread already showed is about it (the router's own deictic / shown-name rule)
  if (deps.pointsAtThread(text)) return { label: 'unclear', signal: 'points_at_thread' }
  // 3. a question of its own
  if (words.length >= QUESTION_MIN_WORDS && /[?？]\s*$/.test(text)) return { label: 'new_request', signal: 'own_question' }
  // 4. a greeting / closing / out-of-scope message the router's own rules already recognise - but not a bare one-word acknowledgement ("ok", "ừ"): after a question that is an answer
  //    ("whatever you choose"), and one word cannot tell it from a closing
  if (words.length >= RULE_CHAT_MIN_WORDS && deps.aloneIsRuleChat(text)) return { label: 'new_request', signal: 'rule_chat' }
  // everything else keeps the old reading (the reply is taken as the answer)
  return { label: 'unclear', signal: 'ambiguous' }
}
