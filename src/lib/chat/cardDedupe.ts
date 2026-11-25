// 16/11 (owner: the same three restaurants showed three times - in the text, as place cards, as option cards; the Phú Yên plan showed its places again as cards under the plan card):
// one fact, one place on the page. The cards of an answer are drawn by separate mechanisms that do not know each other; this is the one rule between them. A thing listed by a more specific
// block is not drawn again by a more general one: the plan card keeps its stops, the place cards keep the places the plan does not name, the option cards keep what neither shows.
// Names decide (the same subject: the same words, or one contains the other with at least two words in common), never the topic. Pure.
import { sameSubject } from '@/lib/media/wikiEntity'

interface Named { name: string }
interface PlanLike { days: ReadonlyArray<{ items: ReadonlyArray<Named> }> }

/** Does the answer's own text already carry a markdown table (a header separator row)? Then a declared comparison table would be the same table twice: the text's stays, the block is not drawn. Pure. */
export function textHasTable(text: string | null | undefined): boolean {
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m.test(text ?? '')
}

interface PointLike { lead?: string; text: string }
interface ProfileLike { name: string; points: readonly PointLike[]; sources?: readonly string[] }

/**
 * 16/11 (owner's mockup, tab 3: the venue card carries "ĐẶC TRƯNG NỔI BẬT"): the subject cards the model declared for places the lookup also returned as VENUE cards are not drawn a second time.
 * Their points go ONTO the venue card (by the same name), and only the subjects with no venue card of their own stay as subject cards. A venue takes the points of one subject. Pure.
 */
export function splitProfilesByPlaces<P extends ProfileLike>(items: readonly P[], places: ReadonlyArray<{ id: string; name: string }>): { notes: Map<string, PointLike[]>; noteSources: Map<string, string[]>; rest: P[] } {
  const notes = new Map<string, PointLike[]>()
  const noteSources = new Map<string, string[]>()
  const rest: P[] = []
  for (const it of items) {
    const place = places.find(p => !notes.has(p.id) && isListedAs(it.name, [p.name]))
    if (place) {
      notes.set(place.id, it.points.map(x => ({ ...x })))
      if (it.sources?.length) noteSources.set(place.id, [...it.sources])
    } else rest.push(it)
  }
  return { notes, noteSources, rest }
}

/** The names of every stop of a plan. */
export function planItemNames(plan: PlanLike | null | undefined): string[] {
  return (plan?.days ?? []).flatMap(d => d.items.map(i => i.name)).filter(n => typeof n === 'string' && n.trim().length > 0)
}

/** Is `name` one of `listed` (the same subject in either direction)? */
export function isListedAs(name: string, listed: readonly string[]): boolean {
  return listed.some(l => sameSubject(l, name) || sameSubject(name, l))
}

/** `items` without those already listed. Same objects, same order. */
export function withoutListed<T extends Named>(items: readonly T[], listed: readonly string[]): T[] {
  if (!listed.length) return [...items]
  return items.filter(i => !isListedAs(i.name, listed))
}
