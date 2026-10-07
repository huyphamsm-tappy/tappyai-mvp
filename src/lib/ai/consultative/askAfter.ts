// ── ANSWER FIRST, ASK AFTER — the one question at the end of the answer ─────────────────────
//
// Owner decision 2026-09-28: a place request with a kind of service and an area is searched
// straight away; a missing budget / party size is asked as ONE question at the END of the answer.
// The V1 block tells the model so (rule 8), and measured live the model followed it on one turn in
// three ("Tối nay đi xem phim…" asked; "ăn gì ngon giờ" and "massage" ended on the pick with the
// chips only). So the question is guaranteed here, deterministically: the finish frame is held and,
// when the reply does not already END on a question, the gate's question is streamed as its last
// line (and its options as follow-up chips when the reply has none). One question at most — a
// reply that already ends asking is left alone. A failed turn (error frame) is never touched.

import type { ClarifyQuestion } from './actionability'

const BLOCK_RE = /\[(FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/\1\]/g

/** The question as a sentence (the gate's short label, "Tầm giá?", is a chip header, not a sentence). */
export function askAfterSentence(q: ClarifyQuestion, lang: string): string {
  const en = lang === 'en'
  const opts = q.options.length ? ` (${q.options.join(' / ')})` : ''
  if (q.q === 'Tầm giá?') return `Bạn muốn tầm giá khoảng bao nhiêu${opts}?`
  if (q.q === 'Mấy người?') return `Bạn đi mấy người${opts}?`
  if (q.q === 'Ngày bay?') return 'Bạn muốn bay ngày nào để mình xem giá đúng ngày đó?'
  if (q.q === 'Which date?') return 'Which day do you want to fly, so I can check that exact date?'
  if (q.q === 'Budget?') return `What budget do you have in mind${opts}?`
  if (q.q === 'How many people?') return `How many of you are going${opts}?`
  if (q.q === 'Tầm giá sản phẩm?') return 'Bạn muốn tầm giá khoảng bao nhiêu để mình lọc sát hơn?'
  if (q.q === 'Product budget?') return 'What price range should I narrow it to?'
  // A trip plan answered first; what it still needs to book anything is WHEN and FROM WHERE / HOW.
  if (q.q === 'Ngày đi?') return 'Bạn định đi ngày nào, xuất phát từ đâu và muốn bay hay đi xe? Mình sẽ tìm vé và phòng đúng ngày cho bạn.'
  if (q.q === 'Ngày đi, bay hay xe?') return 'Bạn định đi ngày nào và muốn bay hay đi xe? Mình sẽ tìm vé và phòng đúng ngày cho bạn.'
  if (q.q === 'Travel dates?') return 'Which dates are you going, from where, and would you rather fly or take the bus? I will find tickets and rooms for those exact days.'
  return en ? `${q.q}${opts}` : `${q.q}${opts}`
}

/** Does the visible reply already end by asking something (last ~200 chars)? */
export function endsWithQuestion(text: string): boolean {
  // Links carry "?" in their query strings ("…/deep_link/…?url=…") — measured on the flight reply,
  // where a trailing booking link read as a question and the date question was not asked.
  const visible = text.replace(BLOCK_RE, '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/https?:\/\/\S+/g, '').trim()
  return /\?[\s)"'”»*_🙂😊💬👇]*$/u.test(visible) || /\?[^.!?]{0,40}$/u.test(visible.slice(-200))
}

export function askAfterStream(body: ReadableStream<Uint8Array>, q: ClarifyQuestion | null, lang: string, log: (e: Record<string, unknown>) => void = (e) => console.log(JSON.stringify(e))): ReadableStream<Uint8Array> {
  if (!q) return body
  const dec = new TextDecoder(), enc = new TextEncoder()
  let rest = '', text = '', failed = false, answered = false
  const held: string[] = []
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, c) {
      rest += dec.decode(chunk, { stream: true })
      const lines = rest.split('\n'); rest = lines.pop() ?? ''
      for (const l of lines) {
        if (l.startsWith('d:')) { held.push(l); continue }
        if (l.startsWith('0:')) { try { text += JSON.parse(l.slice(2)) } catch { /* not ours */ } }
        if (l.startsWith('3:')) failed = true
        if (l.startsWith('9:') || l.startsWith('a:')) answered = true
        c.enqueue(enc.encode(l + '\n'))
      }
    },
    flush(c) {
      if (rest) { if (rest.startsWith('d:')) held.push(rest); else c.enqueue(enc.encode(rest + '\n')) }
      // Only AFTER an answer: a turn that searched nothing (golden B2: the model asked instead) must not
      // get a second question stacked on its own.
      if (!failed && answered && text.replace(BLOCK_RE, '').trim().length > 0 && !endsWithQuestion(text)) {
        const chips = /\[FOLLOWUPS\]/.test(text) || q.options.length === 0 ? '' : `\n\n[FOLLOWUPS]${q.options.slice(0, 3).join('|')}[/FOLLOWUPS]`
        c.enqueue(enc.encode(`0:${JSON.stringify(`\n\n${askAfterSentence(q, lang)}${chips}`)}\n`))
        log({ type: 'tappyai_ask_after', appended: true, q: q.q })
      } else {
        log({ type: 'tappyai_ask_after', appended: false, q: q.q, reason: failed ? 'error' : !answered ? 'no_answer' : 'model_asked' })
      }
      for (const l of held) c.enqueue(enc.encode(l + '\n'))
    },
  }))
}
