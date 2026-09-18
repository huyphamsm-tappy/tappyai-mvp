// ── Turns that need no model (cost optimization item 8, 2026-09-18) ─────────
//
// Two shapes of turn are answered deterministically, in the same data-stream
// format the clients already parse, so nothing changes for them:
//
//   1. A pure greeting / thanks / acknowledgement / goodbye — the exact set the
//      chitchat classifier already isolates (`CHITCHAT_ONLY`), minus the identity
//      questions ("bạn là ai", "TappyAI là gì"), which keep the model.
//   2. A follow-up that asks ONE concrete fact (hours, phone, address) about ONE
//      venue the previous reply named, when that reply already STATED the fact —
//      the answer is the carried fact, verbatim. Anything else (a fact the prior
//      prose lacks, a comparison, a new search) still goes to the model, which
//      may re-search by name.
//
// Measured: a canned turn costs $0 in tokens against ≈$0.011 for the cheapest
// model turn; the replies are shorter than the model's, never less accurate.

import { normalizeVN } from './intent'
import type { CarriedFacts, FactAsked, PriorVenue } from './consultative/referenceResolver'

const fold = (s: string) => normalizeVN(s.toLowerCase().trim())

const GREETING = /^(xin chao|chao|hello|hi|alo)(\s+(ban|tappy|tappyai|nhe|nha|a|oi|you|there))*\s*[!.,?~…]*$/
const THANKS = /^(cam on|thank you|thanks|thank)(\s+(ban|tappy|tappyai|nhe|nha|nhieu|lam|a|oi|you|so much))*\s*[!.,?~…]*$/
const ACK = /^(oke|okie|ok|uh|um|u)(\s+(ban|tappy|nhe|nha|a|oi))*\s*[!.,?~…]*$/
const BYE = /^(tam biet|bye)(\s+(ban|tappy|tappyai|nhe|nha|a|oi|you|bye))*\s*[!.,?~…]*$/
const LAUGH = /^(haha|hehe|hihi)(\s+(ban|tappy|nhe|nha|a|oi))*\s*[!.,?~…]*$/

const COPY = {
  vi: {
    greeting: 'Chào bạn! Mình là Tappy 👋 Bạn muốn tìm quán ăn, spa, chỗ đi chơi, mua gì hay lên kế hoạch đi đâu? Cứ nói tự nhiên nhé.',
    thanks: 'Không có gì! Cần gì cứ hỏi mình nhé 😊',
    ack: 'Ok! Bạn cần mình tìm gì tiếp không?',
    bye: 'Tạm biệt, hẹn gặp lại bạn 👋',
    laugh: '😄 Cần mình gợi ý gì không?',
    chips: '[FOLLOWUPS]Tìm quán ăn gần đây|Lên kế hoạch cuối tuần|Gợi ý spa[/FOLLOWUPS]',
  },
  en: {
    greeting: "Hi! I'm Tappy 👋 Looking for a place to eat, a spa, something to do, something to buy, or a trip plan? Just ask.",
    thanks: "You're welcome! Ask me anything else 😊",
    ack: 'Ok! Anything else you want me to find?',
    bye: 'Bye, see you soon 👋',
    laugh: '😄 Want a suggestion?',
    chips: '[FOLLOWUPS]Food near me|Plan my weekend|Spa ideas[/FOLLOWUPS]',
  },
} as const

/** The canned reply for a pure greeting-class message, or null when the model is needed. */
export function cannedChitchat(text: string, lang: string): string | null {
  const t = fold(text)
  if (!t || t.length > 40) return null
  const c = lang === 'en' ? COPY.en : COPY.vi
  if (GREETING.test(t)) return `${c.greeting}\n\n${c.chips}`
  if (THANKS.test(t)) return c.thanks
  if (ACK.test(t)) return c.ack
  if (BYE.test(t)) return c.bye
  if (LAUGH.test(t)) return c.laugh
  return null
}

/**
 * A follow-up about ONE venue asking only facts the carried prose states.
 * Returns the reply text, or null (the model answers).
 */
export function cannedCarriedFact(
  facts: readonly FactAsked[],
  referenced: readonly PriorVenue[],
  carried: readonly CarriedFacts[],
  lang: string,
): string | null {
  if (referenced.length !== 1 || facts.length === 0) return null
  const venue = referenced[0]
  const c = carried.find(x => x.name === venue.name)
  if (!c) return null
  const answerable = new Set<FactAsked>(['hours', 'phone', 'address'])
  if (!facts.every(f => answerable.has(f))) return null
  const lines: string[] = []
  for (const f of facts) {
    if (f === 'hours') {
      if (!c.hours) return null
      lines.push(lang === 'en' ? `**${venue.name}** is open ${c.hours}.` : `**${venue.name}** mở cửa ${c.hours}.`)
    } else if (f === 'phone') {
      if (!c.phone) return null
      lines.push(lang === 'en' ? `**${venue.name}** — phone: **${c.phone}**.` : `Số điện thoại của **${venue.name}**: **${c.phone}**.`)
    } else if (f === 'address') {
      if (!c.address) return null
      lines.push(lang === 'en' ? `**${venue.name}** — address: ${c.address}.` : `Địa chỉ **${venue.name}**: ${c.address}.`)
    }
  }
  const tail = lang === 'en'
    ? '(From the details I found earlier — worth a quick call before you go.)'
    : '(Theo thông tin mình tìm được ở lượt trước — nên gọi xác nhận trước khi đi nhé.)'
  return `${lines.join(' ')}\n\n${tail}`
}

/** The reply as the AI SDK data stream the clients parse: one text frame, then the finish frame. */
export function cannedDataStreamResponse(text: string, headers: Record<string, string> = {}): Response {
  const body = `0:${JSON.stringify(text)}\nd:${JSON.stringify({ finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } })}\n`
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}
