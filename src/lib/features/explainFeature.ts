// explain_feature: what Tappy answers when a person asks how to use Tappy or what a feature does (owner 20/11). The answer is READ from two places, never written here:
//   - the shared how-to-use guide (src/app/how-to-use/howToUseDoc.ts + src/lib/i18n/guide: the page /how-to-use, held equal with the Android and iOS apps by a parity test), and
//   - the web-only features of src/lib/i18n/features.ts (deep research, trip plans, plans and payment, memory, my plans), whose numbers come from the code that enforces them.
// A topic is matched to cards by plain word overlap in both languages (no model, no list of questions). No match says so and returns the topics to offer: the model must never invent a screen,
// a button, a price or a limit. Pure and server-safe (no 'use client' module is imported).
import { HOW_TO_USE_DOC } from '@/app/how-to-use/howToUseDoc'
import { en as guideEn, vi as guideVi } from '@/lib/i18n/guide'
import { webFeatures } from '@/lib/i18n/features'
import type { LegalBlock } from '@/components/legal/legalDoc'

export interface FeatureCard { id: string; title: string; what: string; steps: string[]; more: string[]; where?: string }
export interface ExplainResult { found: boolean; topic: string; matches: FeatureCard[]; topics: string[]; note: string }
type Lang = 'vi' | 'en'

const MAX_MATCHES = 2
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const words = (s: string): string[] => fold(s).split(/[^a-z0-9]+/).filter(Boolean)

// words that say nothing about WHICH feature (question words, "I", "my", "the")
const STOP = new Set(['la', 'gi', 'the', 'a', 'an', 'of', 'to', 'do', 'i', 'my', 'how', 'what', 'is', 'can', 'where', 'cua', 'toi', 'minh', 'lam', 'sao', 'nhu', 'nao', 'o', 'dau', 'co', 'khong', 'cho', 'va', 'and', 'or', 'in', 'on', 'for', 'tappy', 'ban', 'em', 'anh', 'chi', 'duoc', 'thi', 'muon', 'want', 'use', 'dung', 'su', 'cach', 'huong', 'dan'])

function sectionCard(section: (typeof HOW_TO_USE_DOC.sections)[number], lang: Lang): FeatureCard {
  const dict = lang === 'vi' ? guideVi : guideEn
  const get = (k: string): string => dict[k] ?? ''
  const what: string[] = []
  const steps: string[] = []
  const more: string[] = []
  for (const b of section.blocks as LegalBlock[]) {
    if (b.kind === 'steps') steps.push(...b.keys.map(get))
    else if (b.kind === 'bullets') more.push(...b.keys.map(get))
    else if (b.kind === 'p' || b.kind === 'lead') (what.length ? more : what).push(get(b.key))
    else if (b.kind === 'note') more.push(get(b.key))
  }
  return { id: section.id, title: get(section.headingKey), what: what.join(' '), steps: steps.filter(Boolean), more: more.filter(Boolean) }
}

function cards(lang: Lang): FeatureCard[] {
  const web = webFeatures().map((f): FeatureCard => ({ id: f.id, ...f[lang], ...(f.where ? { where: f.where } : {}) }))
  return [...web, ...HOW_TO_USE_DOC.sections.map(s => sectionCard(s, lang))]
}

/** Every card of both languages, with the words each one is found by. */
function index(): Array<{ id: string; titleWords: Set<string>; allWords: Set<string> }> {
  const vi = cards('vi'), en = cards('en')
  const kw = new Map(webFeatures().map(f => [f.id, f.keywords]))
  return vi.map((v, i) => {
    const e = en[i]
    const title = `${v.title} ${e.title}`
    const all = [title, kw.get(v.id) ?? '', v.what, e.what, ...v.steps, ...e.steps, ...v.more, ...e.more].join(' ')
    return { id: v.id, titleWords: new Set(words(title)), allWords: new Set(words(all)) }
  })
}

/** A topic word matches a word of the card when it is the same word, or (for 4+ letters) the start of it ("plan" finds "planner"). */
const hit = (token: string, set: Set<string>): boolean => {
  if (set.has(token)) return true
  if (token.length < 4) return false
  for (const w of set) if (w.startsWith(token)) return true
  return false
}

export function featureTopics(lang: Lang): string[] {
  return cards(lang).map(c => c.title).filter(Boolean)
}

export function explainFeature(topic: string, lang: Lang): ExplainResult {
  const l: Lang = lang === 'en' ? 'en' : 'vi'
  const topics = featureTopics(l)
  const tokens = words(typeof topic === 'string' ? topic : '').filter(t => !STOP.has(t))
  const NOT_FOUND = 'This is not listed in what Tappy can explain. Say plainly that you do not have it listed, offer the topics that ARE listed, and do not invent screens, buttons, prices or limits.'
  if (!tokens.length) return { found: false, topic: String(topic ?? '').slice(0, 120), matches: [], topics, note: NOT_FOUND }
  const scored = index().map(c => {
    let score = 0
    for (const t of tokens) {
      if (hit(t, c.titleWords)) score += 3
      else if (hit(t, c.allWords)) score += 1
    }
    return { id: c.id, score }
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score)
  const byId = new Map(cards(l).map(c => [c.id, c]))
  const matches = scored.slice(0, MAX_MATCHES).map(s => byId.get(s.id)!).filter(Boolean)
  if (!matches.length) return { found: false, topic: String(topic).slice(0, 120), matches: [], topics, note: NOT_FOUND }
  return {
    found: true,
    topic: String(topic).slice(0, 120),
    matches,
    topics,
    note: 'Explain to the person in their own language, in plain words, using ONLY these matches (give the steps in order). If what they ask is not in a match, say Tappy does not list it and offer the topics; do not invent screens, buttons, prices or limits.',
  }
}
