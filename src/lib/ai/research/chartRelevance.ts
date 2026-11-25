// A chart is drawn only from a series the written section talks about (11/11, after the forecast report drew charts of bottled-tea litres, FMCG revenue and food-delivery platforms - series the report
// itself said it did not use - because a section's chart was chosen as the largest group of figures found for it). Pure. Behind RESEARCH_CHART_RELEVANCE (deepResearchState.ts), off by default, locked
// in production; the engine passes the flag to sectionCharts.

import { fold } from './researchSignals'

/** The share of a series' words the section must use for the series to count as the section's own. */
export const CHART_RELEVANCE_MIN = 0.6

/** Words of three letters or more, folded (no diacritics, lower case), numbers left out. */
const wordsOf = (s: string): string[] => fold(String(s ?? '')).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^\d+$/.test(w))

/** Whether the section's text uses at least CHART_RELEVANCE_MIN of the series' distinct words. A series with no usable word, or an empty section, is not relevant. Pure. */
export function seriesRelevant(series: string, sectionText: string, min: number = CHART_RELEVANCE_MIN): boolean {
  const words = [...new Set(wordsOf(series))]
  if (!words.length) return false
  const have = new Set(wordsOf(sectionText))
  return words.filter(w => have.has(w)).length / words.length >= min
}

/**
 * The text of the level-2 section whose heading `isSection` accepts (given the heading's text), subsections included, up to the next level-1 or level-2 heading; empty when no heading matches. Pure.
 */
export function sectionTextOf(report: string, isSection: (headingText: string) => boolean): string {
  const out: string[] = []
  let inside = false
  for (const line of String(report ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (m && m[1].length <= 2) {
      if (inside) break
      inside = m[1].length === 2 && isSection(m[2])
      continue
    }
    if (inside) out.push(line)
  }
  return out.join('\n')
}
