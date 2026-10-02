// [TAPPY_ASK]{"v":1,"questions":[{id,q,options[]}]}[/TAPPY_ASK] — the consult ASK turn (owner 2026-09-29):
// 2–3 questions, each with its own quick-reply options. Parsed and ALWAYS stripped from the text, so a
// malformed block never reaches the reader as raw JSON.

export interface AskQuestionView { id: string; q: string; options: string[] }

const BLOCK = /\[TAPPY_ASK\]([\s\S]*?)\[\/TAPPY_ASK\]/

export function parseAsk(content: string): { text: string; questions: AskQuestionView[] } {
  const m = content.match(BLOCK)
  if (!m) return { text: content, questions: [] }
  const text = (content.slice(0, m.index) + content.slice((m.index ?? 0) + m[0].length)).replace(/\n{3,}/g, '\n\n').trim()
  let questions: AskQuestionView[] = []
  try {
    const j = JSON.parse(m[1]) as { questions?: unknown }
    questions = (Array.isArray(j.questions) ? j.questions : []).map((q, i) => {
      const r = q as Record<string, unknown>
      const options = (Array.isArray(r?.options) ? r.options : []).filter((o): o is string => typeof o === 'string' && o.trim().length > 0).map(o => o.trim()).slice(0, 4)
      return typeof r?.q === 'string' && options.length >= 2 ? { id: typeof r.id === 'string' ? r.id : `q${i + 1}`, q: r.q.trim(), options } : null
    }).filter((q): q is AskQuestionView => q !== null).slice(0, 3)
  } catch { questions = [] }
  return { text, questions }
}

/**
 * The user's reply from the chosen options, in question order: "Karaoke, Bida / Bowling · 2 người · Tối nay".
 * A multi-choice step (the redesigned card's "what kind" tiles) joins its options with ", " — the server reads the
 * same plain sentence it always did.
 */
export function composeAskAnswer(questions: AskQuestionView[], chosen: Record<string, string | string[]>, free = ''): string {
  const parts = questions.map(q => {
    const v = chosen[q.id]
    return Array.isArray(v) ? q.options.filter(o => v.includes(o)).join(', ') : v
  }).filter((v): v is string => !!v)
  const extra = free.trim()
  return [...parts, ...(extra ? [extra] : [])].join(' · ')
}
