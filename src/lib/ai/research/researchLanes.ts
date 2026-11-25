// Question kind and the press lane (owner 11/11: the open question "xu hướng thị trường trà sữa Hà Nội" got a seven-section category plan fed almost only by survey and market-report sites, and lost to a
// shorter report built on the press coverage of what changed in the last year). Pure, deterministic, no model.
//   questionKind() — what KIND of question this is, by code: TREND (what is changing now), SIZE_FORECAST (how big, how it will grow), COMPARE, or OTHER.
//   withNewsLane() — for a TREND question the plan gets one more step, "latest developments", searched in the press and news of the last year, in the person's language and in English.
// Behind RESEARCH_SOURCE_DIVERSITY like the other source rules; with it off the plan is untouched.

import { fold } from './researchSignals'
import type { ResearchPlan } from './deepResearch'

export type QuestionKind = 'TREND' | 'SIZE_FORECAST' | 'COMPARE' | 'OTHER'

const TREND = /(xu huong|trend|dien bien|lan song|hien nay|dang noi len|dang thay doi|moi nhat|gan day|bien dong|latest|emerging|what is changing|what's changing)/
const SIZE_FORECAST = /(quy mo|du bao|doanh thu|thi phan|tang truong|forecast|market size|revenue|market share|projection|cagr|kich ban|do nhay|scenario|sensitivity)/
const COMPARE = /(so sanh|doi chieu|compare|comparison|\bvs\.?\b|versus)/

/** A forecast or size question wins over a trend word (the person wants the numbers); a trend word without them is a trend question; then comparison. Pure. */
export function questionKind(message: string): QuestionKind {
  const f = fold(String(message ?? '').slice(0, 2000))
  if (SIZE_FORECAST.test(f)) return 'SIZE_FORECAST'
  if (TREND.test(f)) return 'TREND'
  if (COMPARE.test(f)) return 'COMPARE'
  return 'OTHER'
}

export const NEWS_STEP_TITLE: Record<string, string> = { vi: 'Diễn biến mới nhất', en: 'Latest developments' }

/**
 * Add the press lane: one step whose queries ask the news and the business press what changed recently (the topic is the plan's own title, no publisher is named: the search finds what the press
 * of the moment is). Only when there is room under `maxSteps`, and never twice. Other plans are returned as they are. Pure.
 */
export function withNewsLane(plan: ResearchPlan, kind: QuestionKind, lang: string, year: number, maxSteps: number): ResearchPlan {
  if (kind !== 'TREND') return plan
  const title = NEWS_STEP_TITLE[lang === 'en' ? 'en' : 'vi']
  if (plan.steps.length >= maxSteps || plan.steps.some(s => s.title === title)) return plan
  const topic = plan.title.replace(/\s+/g, ' ').trim().slice(0, 120)
  const queries = lang === 'en'
    ? [`${topic} latest news ${year}`, `${topic} what changed ${year - 1} ${year} business press`]
    : [`${topic} tin tức mới nhất ${year}`, `${topic} điều gì thay đổi ${year - 1} ${year} báo kinh tế`, `${topic} latest news ${year}`]
  return { ...plan, steps: [...plan.steps, { title, queries }] }
}
