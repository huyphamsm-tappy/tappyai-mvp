// Where an answer's place cards sit. A card belongs under the text that talks about that place; this decides it from the TEXT and the place NAMES only. It never looks at the
// question, at a keyword, or at what kind of venue it is (a restaurant, a hotel and a repair shop are anchored by exactly the same rule), so a new kind of question needs no new
// rule. A place the text never names is not guessed at: it goes with the others, as before. Pure; view only (nothing here changes what the model wrote or what is saved).
import { parseDoc, titleKey, type DocBlock } from '@/lib/answerDoc/parse'
import { embedAnchors, plainHeading } from '@/lib/chat/presentation'

const INTRODUCES = /[:：]\s*$/
/** A shortened name ("La Villa" for "La Villa French Restaurant") counts only for a name of at least this many words, and only when it is at least this long. */
const PARTIAL_MIN_WORDS = 4
const PARTIAL_MIN_CHARS = 8
const PARTIAL_WORDS = 2

const plainOf = (b: DocBlock): string | null => {
  if (b.t === 'heading' || b.t === 'para' || b.t === 'quote') return plainHeading(b.text)
  if (b.t === 'list') return b.items.map(i => plainHeading(i.text)).join('\n')
  return null
}

/** The forms of a name the text may use: the whole name, and its first words when that is long enough, has enough words, and no other place starts the same way. */
function formsOf(name: string, allNames: readonly string[]): string[] {
  const full = titleKey(name)
  if (!full) return []
  const words = full.split(' ')
  const forms = [full]
  if (words.length >= PARTIAL_MIN_WORDS) {
    const partial = words.slice(0, PARTIAL_WORDS).join(' ')
    const shared = allNames.some(n => { const k = titleKey(n); return k !== full && (k === partial || k.startsWith(`${partial} `)) })
    if (partial.length >= PARTIAL_MIN_CHARS && !shared) forms.push(partial)
  }
  return forms
}

/** Whole words only: a name inside a longer word is not a mention. */
const mentions = (text: string, forms: readonly string[]): boolean => {
  const padded = ` ${titleKey(text)} `
  return forms.some(f => padded.includes(` ${f} `))
}

/**
 * The index of the block a card for `name` goes AFTER, or null when the text never names it.
 *  - a heading that names the place: the card follows that section's first piece of text (a card never sits between a title and its text), or the heading itself when the section has none;
 *  - otherwise the first block that names it, unless that block is a summary naming several places and a later block names this one alone;
 *  - a block that ends with a colon introduces what follows, so the card goes after the following block.
 */
export function mentionAnchor(blocks: readonly DocBlock[], name: string, allNames: readonly string[] = [name]): number | null {
  const mine = formsOf(name, allNames)
  if (!mine.length) return null
  const others = allNames.map(n => formsOf(n, allNames))
  const hits: Array<{ i: number; count: number }> = []
  blocks.forEach((b, i) => {
    const text = plainOf(b)
    if (text === null || !mentions(text, mine)) return
    hits.push({ i, count: others.filter(f => f.length && mentions(text, f)).length })
  })
  if (!hits.length) return null

  const head = hits.find(h => blocks[h.i].t === 'heading')
  if (head) {
    for (let j = head.i + 1; j < blocks.length && blocks[j].t !== 'heading'; j++) {
      if (blocks[j].t === 'para' || blocks[j].t === 'quote' || blocks[j].t === 'list') return j
    }
    return head.i
  }

  const chosen = hits.find(h => h.count <= 1) ?? hits[0]
  const b = blocks[chosen.i]
  const intro = (b.t === 'para' || b.t === 'quote') && INTRODUCES.test(plainHeading(b.text))
  if (intro && chosen.i + 1 < blocks.length && blocks[chosen.i + 1].t !== 'heading') return chosen.i + 1
  return chosen.i
}

/**
 * For each embed, the index of the block it goes AFTER. An embed with a name that the text mentions follows its text; every other embed is spread as before
 * (`embedAnchors`), the order of the embeds kept. `allNames` is every place name of the turn (to keep a shortened name from being claimed by two places).
 */
export function embedAnchorsNamed(blocks: readonly DocBlock[], names: ReadonlyArray<string | undefined>, allNames: readonly string[] = names.filter((n): n is string => !!n)): number[] {
  const named = names.map(n => (n ? mentionAnchor(blocks, n, allNames) : null))
  const spread = embedAnchors(blocks, named.filter(a => a === null).length)
  let k = 0
  return named.map(a => (a !== null ? a : spread[k++]))
}

/** Which places stand alone under their own text and which go together in the group: the named ones alone (engine order kept), the rest together. */
export function placeEmbedPlan<P extends { id: string; name: string }>(text: string, places: readonly P[]): { solo: P[]; rest: P[] } {
  const blocks = parseDoc(text)
  const names = places.map(p => p.name)
  const solo: P[] = []
  const rest: P[] = []
  for (const p of places) (mentionAnchor(blocks, p.name, names) !== null ? solo : rest).push(p)
  return { solo, rest }
}
