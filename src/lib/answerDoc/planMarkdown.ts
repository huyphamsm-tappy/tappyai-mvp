// A trip plan as the report text the designed PDF page already knows how to lay out (owner 19/11: "will the plan look this good as a PDF file?"): a title, the facts line,
// one "##" section per day, the budget as a table and the tips. Only what the plan itself states is written; nothing is added or summed. Pure.
import type { TappyPlan } from '@/components/TripPlanCard'

export interface PlanMarkdownLabels { facts: string; budget: string; item: string; cost: string; tips: string; total: string }

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').replace(/\|/g, '/').trim() : '')

export function planMarkdown(plan: TappyPlan, labels: PlanMarkdownLabels): string {
  const out: string[] = [`# ${clean(plan.title)}`, '']
  if (labels.facts) out.push(labels.facts, '')
  for (const d of plan.days ?? []) {
    out.push(`## ${clean(d.label)}`, '')
    for (const it of d.items ?? []) {
      const head = [clean(it.time), clean(it.name)].filter(Boolean).join(' - ')
      const tail = [clean(it.description), clean(it.price), clean(it.address)].filter(Boolean).join(' ')
      out.push(`- **${head}**${tail ? ` - ${tail}` : ''}`)
    }
    out.push('')
  }
  const rows = Object.entries(plan.cost_breakdown ?? {}).map(([k, v]) => [clean(k), clean(v)]).filter(([k, v]) => k && v)
  if (rows.length || plan.budget_total) {
    out.push(`## ${labels.budget}`, '', `| ${labels.item} | ${labels.cost} |`, '| --- | --- |')
    for (const [k, v] of rows) out.push(`| ${k} | ${v} |`)
    if (plan.budget_total) out.push(`| ${labels.total} | ${clean(plan.budget_total)} |`)
    out.push('')
  }
  const tips = (plan.local_tips ?? []).map(t => clean(t.text)).filter(Boolean)
  if (tips.length) out.push(`## ${labels.tips}`, '', ...tips.map(t => `- ${t}`), '')
  return out.join('\n')
}
