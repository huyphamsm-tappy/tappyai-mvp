'use client'
// CONSULT_V3 (owner 17/10, UAT round A): the reply's closing decision question(s) as a choice card, like ChatGPT's choice form.
// VIEW ONLY — the groups come from the prose (parseChoices.ts); the card sends the chosen options as one plain user message. Follows the
// light / dark theme (Tailwind `dark:`), unlike the discovery AskCard. Labels from the i18n dictionaries (placeDecision.choice*).
// UAT 17/10: an "other" option ("Nơi khác", "Mẫu khác — gửi tên nhé") opens a text box; the answer is sent as "Nơi khác: <what they typed>".
import { useState } from 'react'
import type { ChoiceGroup } from '@/lib/structuredContent/parseChoices'
import { composeChoiceAnswer, isOtherOption, otherPrefill } from '@/lib/structuredContent/parseChoices'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function ChoiceCard({ groups, onSend }: { groups: ChoiceGroup[]; onSend: (text: string) => void }) {
  const { t } = useTranslation()
  const [chosen, setChosen] = useState<Record<number, string>>({})
  const [typed, setTyped] = useState<Record<number, string>>({})
  const [sent, setSent] = useState(false)
  const picked = Object.keys(chosen).length
  const otherEmpty = Object.entries(chosen).some(([gi, o]) => isOtherOption(o) && !(typed[Number(gi)] ?? '').trim())
  const send = () => {
    const values = Object.fromEntries(Object.entries(chosen).map(([gi, o]) => [gi, isOtherOption(o) ? `${otherPrefill(o)}${(typed[Number(gi)] ?? '').trim()}` : o]))
    const answer = composeChoiceAnswer(groups, values)
    if (!answer || sent || otherEmpty) return
    setSent(true)
    onSend(answer)
  }
  return (
    <div className="mt-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-4 shadow-sm" data-choice-card="v3">
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('placeDecision.choiceTitle')}</div>
      <div className="space-y-4">
        {groups.map((g, gi) => (
          <fieldset key={gi} className="space-y-2">
            <legend className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">{g.q}</legend>
            <div className="flex flex-col gap-1.5">
              {g.options.map((o, oi) => {
                const on = chosen[gi] === o
                return (
                  <div key={oi} className="flex flex-col gap-1.5">
                    <label className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors ${on ? 'border-primary-500 bg-primary-500/10 text-gray-900 dark:text-white' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <input type="radio" name={`choice-${gi}`} className="accent-primary-500" checked={on} disabled={sent} onChange={() => setChosen(c => ({ ...c, [gi]: o }))} />
                      <span>{o}</span>
                    </label>
                    {on && isOtherOption(o) && (
                      <input
                        type="text"
                        autoFocus
                        disabled={sent}
                        value={typed[gi] ?? ''}
                        onChange={e => setTyped(v => ({ ...v, [gi]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
                        placeholder={t('placeDecision.choiceOtherPlaceholder')}
                        aria-label={o}
                        data-choice-other="v3"
                        className="ml-7 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary-500"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        onClick={send}
        disabled={picked === 0 || sent || otherEmpty}
        className="mt-4 w-full rounded-xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors"
      >
        {t('placeDecision.choiceSend')}
      </button>
    </div>
  )
}
