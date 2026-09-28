'use client'
// The consult ASK turn (owner 2026-09-29): 2–3 questions, each with its own quick-reply chips.
// One tap per question selects (tap again to clear); "Gửi" sends what was chosen — a partial answer
// is fine. A free-text box covers anything the chips do not.
import { useState } from 'react'
import { composeAskAnswer, type AskQuestionView } from '@/lib/structuredContent/parseAsk'

export default function AskCard({ questions, onSend, disabled, lang = 'vi' }: {
  questions: AskQuestionView[]
  onSend: (text: string) => void
  disabled?: boolean
  lang?: string
}) {
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [free, setFree] = useState('')
  const answer = composeAskAnswer(questions, chosen, free)
  const en = lang === 'en'
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-gray-200 dark:border-gray-700 p-3" data-ask-card>
      {questions.map(q => (
        <fieldset key={q.id} className="space-y-1.5" disabled={disabled}>
          <legend className="text-sm font-medium text-gray-800 dark:text-gray-100">{q.q}</legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map(o => {
              const on = chosen[q.id] === o
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={on}
                  data-ask-option={q.id}
                  onClick={() => setChosen(c => ({ ...c, [q.id]: on ? '' : o }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {o}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <input
          id="ask-free-text"
          value={free}
          onChange={e => setFree(e.target.value)}
          disabled={disabled}
          placeholder={en ? 'Or type anything else…' : 'Hoặc gõ thêm ý khác…'}
          className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          data-ask-send
          disabled={disabled || !answer}
          onClick={() => onSend(answer)}
          className="shrink-0 rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {en ? 'Send' : 'Gửi'}
        </button>
      </div>
    </div>
  )
}
