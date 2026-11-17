// 16/11 (UAT 60: "nguồn không bấm được" in all ten reports): a deep research's card (tappy.research.v1: its plan and the cited sources WITH their addresses) and charts are live-only annotations, so when the
// finished report was saved and the chat navigated to its saved address, the sources list lost its links and fell back to plain text. Like every other live annotation (places, pictures, the card of a
// turn) the client keeps them for the life of the tab: a module-scoped Map keyed by the report text, nothing on disk, every address re-checked by readResearchStatus before it is used. Only a FINISHED
// report is kept: one that already holds its sources, or is done (the key is the report's first lines, so a report being written replaces its own entry and pushes nothing else out).
import { placesViewKey } from '@/lib/recommendation/liveViewCache'
import type { ResearchStatus, ResearchChart } from './deepResearch'

export interface RememberedResearch { status: ResearchStatus; charts: ResearchChart[] }

const MAX_ENTRIES = 12
const cache = new Map<string, RememberedResearch>()

export function rememberResearch(content: string, r: RememberedResearch): void {
  // kept once the report holds its sources: the sources arrive with the last frames, which can still say "writing" (measured 16/11), so the phase is not the test
  if (r.status.phase !== 'done' && !(r.status.links && r.status.links.length > 0)) return
  const key = placesViewKey(content)
  if (!key) return
  cache.delete(key)
  cache.set(key, r)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function recallResearch(content: string): RememberedResearch | null {
  return cache.get(placesViewKey(content)) ?? null
}

/** Test-only. */
export function __resetResearchMemory(): void {
  cache.clear()
}
