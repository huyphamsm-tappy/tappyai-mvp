// ── LOC-DEFAULT-HCM-01 — the area question, by code ─────────────────────────────────────────────────
//
// Owner decision (Round 42, 14/10/2026): with no valid current location and no area the user named, Tappy
// never searches around a default city (TP.HCM) — it asks where to search. `search_places` refuses before any
// provider call (route.ts, `no_current_location`); the question itself is written HERE, a fixed sentence at the
// end of the final message, so it does not depend on the model restating the tool's note.
//
// A transform over the AI-SDK data stream, same shape as `askAfterStream`: the finish frames are held and, when the
// turn refused for want of a location, the sentence is streamed as the last text — also on a reply with no text at
// all. A failed turn (error frame) is never touched; a reply that already carries the sentence gets no second copy.

import { cityInText, VIETNAM_CITY_ENTRIES } from '../tools/vietnamCities'
import { statedDistrict } from '../districts'
import { maskStreetNames } from '../streetNames'
import { normalizeVN } from '../intent'

export const AREA_ASK_VI = 'Bạn muốn mình tìm ở đâu (khu vực/quận/thành phố)? Mình chưa có vị trí của bạn.'
export const AREA_ASK_EN = "Where should I search (area, district, or city)? I don't have your location yet."

/**
 * N5 (30/10): the one-brain route's `no_current_location` note. The place search still refuses (no default city), but the code writes
 * nothing into the answer: the model decides whether it can answer without an area or must ask, in its own words. Measured 30/10
 * (C3010 T08 "tính đi du lịch chơi, chưa biết đi đâu"): the fixed area question above followed the model's answer; ChatGPT suggested destinations.
 */
// Review 30/10: the note used to say "người dùng chưa nêu khu vực" - false when the area was named in an earlier turn, and it pushed the model to a
// generic answer. It now says what is true: THIS call carried no area the system can place.
export const ONE_BRAIN_NO_LOCATION_NOTE = 'Lần tìm địa điểm này không chạy: thiết bị không gửi vị trí và lời gọi không có khu vực (tham số location) mà hệ thống nhận ra. Không đoán khu vực, không tìm quanh một thành phố mặc định, không bịa tên quán hay địa chỉ. Nếu người dùng đã nêu tỉnh/thành, quận hay điểm đến ở bất kỳ lượt nào của cuộc trò chuyện, hãy gọi lại search_places với location là nơi đó. Nếu chưa nêu: phần nào trả lời được mà không cần vị trí (ý tưởng, điểm đến, tiêu chí chọn, kinh nghiệm) thì trả lời đầy đủ; nếu thật sự cần khu vực để gợi ý chỗ cụ thể thì hỏi người dùng bằng lời của bạn, một câu, ở cuối câu trả lời.'

export function areaAskSentence(lang: string): string {
  return lang === 'en' ? AREA_ASK_EN : AREA_ASK_VI
}

/**
 * The area the user gave IN ANSWER to the area question: only when the previous assistant message carried that question, read from the
 * user's reply — a district ("Quận 3" → "Quận 3, TP.HCM") or a city ("ở Đà Nẵng"). A street or dish named after a city ("bún bò Huế",
 * "Nguyễn Huệ") is not that city (streetNames.ts). Undefined otherwise: a city word in any other message is never turned into a search area.
 */
export function areaFromAnswer(previousAssistantText: string | null | undefined, userText: string): string | undefined {
  const prev = previousAssistantText ?? ''
  if (!prev.includes(AREA_ASK_VI) && !prev.includes(AREA_ASK_EN)) return undefined
  const d = statedDistrict(userText)
  if (d) return `${d.label}, ${d.city === 'hn' ? 'Hà Nội' : 'TP.HCM'}`
  const c = cityInText(maskStreetNames(normalizeVN((userText || '').toLowerCase())))
  return c ? c.query : undefined
}

// Words that carry no intent of their own around an area answer ("ở Đà Nẵng nhé", "tại Quận 3 thôi"). Deliberately short: a word NOT in
// this list keeps the message out of the merge ("đi", "muốn", "tìm", "đặt", "du lịch", "vé", "quán", "phở" …) — missing a merge only leaves
// the router to decide as it does today; a wrong merge would turn a new request into a place search.
const LIGHT_WORDS = new Set(['o', 'tai', 'quanh', 'khu', 'vuc', 'gan', 'thoi', 'nhe', 'nha', 'a', 'in', 'at', 'around', 'near'])
const CITY_ALIASES_LONGEST_FIRST = VIETNAM_CITY_ENTRIES.map(([alias]) => alias).sort((a, b) => b.length - a.length)

/**
 * Is this message ONLY an area — a district or a city, plus light words? "ở Đà Nẵng", "Quận 3", "Đà Nẵng nhé" → true.
 * "Thôi, tôi muốn đi du lịch Đà Nẵng", "đặt vé máy bay đi Đà Nẵng", "bún bò Huế", "View đẹp" → false. Folded, street / dish names masked.
 */
export function isPureAreaAnswer(userText: string): boolean {
  const folded = maskStreetNames(normalizeVN((userText || '').toLowerCase())).replace(/[^a-z0-9 ]+/g, ' ')
  const district = statedDistrict(folded)
  const city = cityInText(folded)
  if (!district && !city) return false
  let rest = ` ${folded} `.replace(/\b(?:quan|q|district)\s*\d{1,2}\b/g, ' ')
  if (district) rest = rest.replace(new RegExp(`\\b${normalizeVN(district.label.toLowerCase())}\\b`, 'g'), ' ')
  for (const alias of CITY_ALIASES_LONGEST_FIRST) rest = rest.replace(new RegExp(`\\b${alias}\\b`, 'g'), ' ')
  rest = rest.replace(/\b(?:thanh pho|tp|tinh|city)\b/g, ' ')
  return rest.split(/\s+/).filter(Boolean).every(w => LIGHT_WORDS.has(w))
}

const contentText = (c: unknown): string => typeof c === 'string' ? c
  : Array.isArray(c) ? c.map(p => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join(' ') : ''

/**
 * For ROUTING only (route.ts): when the previous assistant message is the area question and the user's reply is ONLY an area, the reply is
 * the missing part of the request before the question — [request, area question, "ở Đà Nẵng"] becomes one user turn "request ở Đà Nẵng".
 * Without this the router reads a bare "ở Đà Nẵng" as a new trip. Any other shape — a reply with its own intent, a question that is not the
 * previous turn, non-text content — returns the messages untouched.
 */
export function mergeAreaAnswer<T extends { role: string; content: unknown }>(messages: T[]): T[] {
  const n = messages.length
  if (n < 3) return messages
  const answer = messages[n - 1], asked = messages[n - 2], request = messages[n - 3]
  if (answer.role !== 'user' || asked.role !== 'assistant' || request.role !== 'user') return messages
  if (typeof answer.content !== 'string' || typeof request.content !== 'string') return messages
  const askedText = contentText(asked.content)
  if (!askedText.includes(AREA_ASK_VI) && !askedText.includes(AREA_ASK_EN)) return messages
  if (!isPureAreaAnswer(answer.content)) return messages
  return [...messages.slice(0, n - 3), { ...request, content: `${request.content.trim()} ${answer.content.trim()}` }]
}

export function areaAskStream(body: ReadableStream<Uint8Array>, needed: () => boolean, lang: string, log: (e: Record<string, unknown>) => void = (e) => console.log(JSON.stringify(e))): ReadableStream<Uint8Array> {
  const dec = new TextDecoder(), enc = new TextEncoder()
  const sentence = areaAskSentence(lang)
  let rest = '', text = '', failed = false
  const held: string[] = []
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, c) {
      rest += dec.decode(chunk, { stream: true })
      const lines = rest.split('\n'); rest = lines.pop() ?? ''
      for (const l of lines) {
        if (l.startsWith('d:')) { held.push(l); continue }
        if (l.startsWith('0:')) { try { text += JSON.parse(l.slice(2)) } catch { /* not ours */ } }
        if (l.startsWith('3:')) failed = true
        c.enqueue(enc.encode(l + '\n'))
      }
    },
    flush(c) {
      if (rest) { if (rest.startsWith('d:')) held.push(rest); else c.enqueue(enc.encode(rest + '\n')) }
      if (needed() && !failed) {
        if (!text.includes(sentence)) {
          c.enqueue(enc.encode(`0:${JSON.stringify(text.trim() ? `\n\n${sentence}` : sentence)}\n`))
          log({ type: 'tappyai_area_ask', appended: true, empty_body: !text.trim() })
        } else {
          log({ type: 'tappyai_area_ask', appended: false, reason: 'already_said' })
        }
      }
      for (const l of held) c.enqueue(enc.encode(l + '\n'))
    },
  }))
}
