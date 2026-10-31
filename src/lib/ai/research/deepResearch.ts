// ── 31/10 (owner: "làm nghiên cứu sâu cho ngon"): Deep Research - plan, parallel research branches, one report ─────────────────────────────
//
// The converged design of the published systems (OpenAI deep research API guide: clarify → rewrite into a research brief → research with a
// tool-call cap; Anthropic's research system: a lead plans, 3-5 workers search and read IN PARALLEL and compress what they found with its
// source, one writer, citations attached separately; LangChain open_deep_research: research in parallel, write ONCE):
//   1. plan    - one structured call turns the question (and the conversation so far) into a titled plan of 3-5 steps, 1-2 queries each;
//   2. research - every step runs at the same time: its queries are searched and their top pages read (the page reader of the chat - same
//                 fetch rules, robots.txt, size caps), then one structured call keeps the step's findings, each tied to a NUMBERED source;
//   3. write   - one call (medium reasoning) writes the report from the findings, citing [n]; it never writes a link: the sources list is
//                built HERE from the search results, so every link the person sees came from a search result.
// The person sees the plan and each step's progress while it runs (a `tappy.research.v1` annotation the web client draws as a card).
// Bounded: DEEP_RESEARCH_LIMITS (steps, queries, a deadline after which a step still running is dropped). Pure orchestration: every model
// call, search and page read is an injected dependency (deepResearchDeps.ts in the app; fakes in the tests).

// The chat route's maxDuration is 120 s (owner decision 28/09, pinned by planCompletion.test.ts): research gets 55 s, and the whole run stops
// writing at 105 s (what was written stays, with its sources) so the answer always ends inside the platform's limit.
import { parseDoc, headingTitle, titleKey, type DocBlock } from '@/lib/answerDoc/parse'

// planSteps: the plan's own steps; steps: all steps of a run (the plan's + the follow-up round's GAP_STEPS), as the card shows them
export const DEEP_RESEARCH_LIMITS = { planSteps: 5, steps: 7, queriesPerStep: 2, findingsPerStep: 10, researchDeadlineMs: 55_000, runDeadlineMs: 105_000 } as const

/**
 * `sources_label`: the heading of the sources list in the question's language (the plan call writes it; absent = by the app's locale).
 * A step's `image_query`: what to search a picture for, when the step is about something one can see (absent = no picture for it).
 * A follow-up step's `completes`: the plan step (1-based) whose section its findings complete (measured 31/10: follow-ups written as their own
 * sections repeated two earlier ones); absent = a section of its own.
 */
export interface ResearchPlan { title: string; sources_label?: string; steps: Array<{ title: string; queries: string[]; image_query?: string; completes?: number }> }

/** The report's sections: the steps that are not follow-ups of another, in order. Pure. */
export const sectionSteps = (plan: ResearchPlan) => plan.steps.filter(s => !s.completes)

/** The writer's notes: one "## title" per section, its findings and those of the follow-ups that complete it. Pure. */
export function writerNotes(plan: ResearchPlan, findings: readonly Finding[]): string {
  const of = (k: number) => findings.filter(f => f.step === k + 1 || plan.steps[f.step - 1]?.completes === k + 1)
  return plan.steps.map((s, k) => (s.completes ? '' : `## ${s.title}\n${of(k).map(f => `- ${f.text} [${f.source}]`).join('\n') || '- (no findings)'}`)).filter(Boolean).join('\n\n')
}
/**
 * Measured 31/10 (T22, "how many EV makers are there"): one research round found sales by brand but no count, and the report could only say
 * "not found". Like the published systems (research, see what is still missing, research that), a second round runs for what the first did
 * not answer: at most this many follow-up steps, only when time is left.
 */
export const GAP_STEPS = 2
const GAP_MIN_LEFT_MS = 20_000
/** Owner 31/10 ("báo cáo có phần hình ảnh chèn vào cho hợp nội dung từng mục"): pictures per report, at most this many (one per section). */
export const MAX_SECTION_IMAGES = 4
/** `published`: the page's own publication date (YYYY-MM-DD) when the reader found one. */
export interface Evidence { id: number; title: string; url: string; snippet: string; text: string; published?: string }
export interface Finding { step: number; text: string; source: number }
export type StepStatus = 'pending' | 'running' | 'done' | 'failed'
/** A cited source as the card links it (https only); the report text names it without a link. */
export interface ResearchLink { id: number; title: string; url: string }
export interface ResearchStatus { type: 'tappy.research.v1'; title: string; phase: 'planning' | 'researching' | 'writing' | 'done' | 'failed'; steps: Array<{ title: string; status: StepStatus }>; sources: number; links?: ResearchLink[] }

const PHASES = new Set(['planning', 'researching', 'writing', 'done', 'failed'])
const STEP_STATUSES = new Set(['pending', 'running', 'done', 'failed'])

/** Client: the LATEST research card among a message's annotations, or null; malformed frames are ignored. Pure. */
export function readResearchStatus(annotations: unknown[] | undefined | null): ResearchStatus | null {
  if (!Array.isArray(annotations)) return null
  let out: ResearchStatus | null = null
  for (const a of annotations) {
    const c = a as Partial<ResearchStatus> | null
    if (!c || typeof c !== 'object' || c.type !== 'tappy.research.v1' || typeof c.phase !== 'string' || !PHASES.has(c.phase)) continue
    const steps = (Array.isArray(c.steps) ? c.steps : []).filter(s => s && typeof s.title === 'string' && STEP_STATUSES.has(s.status)).slice(0, DEEP_RESEARCH_LIMITS.steps)
    const links = (Array.isArray(c.links) ? c.links : []).filter(l => l && typeof l.id === 'number' && typeof l.title === 'string' && httpsUrl(l.url)).slice(0, 40)
    out = { type: 'tappy.research.v1', title: typeof c.title === 'string' ? c.title.slice(0, 160) : '', phase: c.phase, steps: steps.map(s => ({ title: s.title.slice(0, 160), status: s.status })), sources: typeof c.sources === 'number' && c.sources >= 0 ? Math.floor(c.sources) : 0, ...(links.length ? { links: links.map(l => ({ id: l.id, title: l.title.slice(0, 200), url: l.url })) } : {}) }
  }
  return out
}

/** An absolute https URL, nothing else (the card's links; the server sends only https search results). */
export function httpsUrl(u: unknown): u is string {
  if (typeof u !== 'string' || u.length > 2000) return false
  try { return new URL(u).protocol === 'https:' } catch { return false }
}

export interface DeepResearchDeps {
  plan(question: string, context: string): Promise<ResearchPlan>
  /** One query: its search results with the text of the pages read (empty when nothing came back). */
  gather(query: string, focus: string): Promise<Array<{ title: string; url: string; snippet: string; text: string; published?: string }>>
  /** The step's findings; `source` is an id of the evidence handed in. */
  notes(step: string, question: string, evidence: readonly Evidence[]): Promise<Array<{ text: string; source: number }>>
  write(input: { question: string; plan: ResearchPlan; evidence: readonly Evidence[]; findings: readonly Finding[] }): AsyncIterable<string>
  /**
   * The parts of the question the findings do not answer yet, as at most GAP_STEPS follow-up steps (title + queries); [] = covered.
   * Absent = one research round only.
   */
  gaps?(question: string, plan: ResearchPlan, findings: readonly string[]): Promise<Array<{ title: string; queries: string[]; completes?: number | null }>>
  /** Picture URLs for one image query (server-chosen, never the model's); absent = a report without pictures. */
  images?(query: string): Promise<string[]>
  now?: () => number
}

/** One section picture: `title` is the section heading it goes under (the client matches it like an item picture, answerDoc/media). */
export interface SectionImage { title: string; src: string }
export interface ResearchEmit { status(s: ResearchStatus): void; text(t: string): void; images?(items: SectionImage[]): void }

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** The plan as the run uses it: titled, 1..steps steps, each with 1..queriesPerStep non-empty queries; nothing usable → null. Pure. */
export function normalisePlan(p: unknown, question: string): ResearchPlan | null {
  const r = (p ?? {}) as { title?: unknown; sources_label?: unknown; steps?: unknown }
  const steps = (Array.isArray(r.steps) ? r.steps : []).map(s => {
    const x = (s ?? {}) as { title?: unknown; queries?: unknown; image_query?: unknown }
    const queries = (Array.isArray(x.queries) ? x.queries : []).map(q => clean(q, 200)).filter(Boolean).slice(0, DEEP_RESEARCH_LIMITS.queriesPerStep)
    const image = clean(x.image_query, 80)
    return { title: clean(x.title, 160), queries, ...(image ? { image_query: image } : {}) }
  }).filter(s => s.title && s.queries.length).slice(0, DEEP_RESEARCH_LIMITS.planSteps)
  if (!steps.length) return null
  // the label is one short heading word or two: markup characters are blanked like a source title's
  const label = clean(r.sources_label, 30).replace(/[[\]()<>`*_#|\\]/g, ' ').replace(/\s+/g, ' ').trim()
  return { title: clean(r.title, 160) || clean(question, 120), ...(label ? { sources_label: label } : {}), steps }
}

/**
 * The writer never writes a link (its instruction says so, and this makes it true): a markdown link keeps its label, a bare URL goes.
 * Streaming-safe - text is released up to the last whitespace before any "[" that may still open a link, the rest waits for the next delta
 * (or the end).
 */
export function linkStripper(): { push(delta: string): string; end(): string } {
  let carry = ''
  const strip = (s: string) => s.replace(/\[([^\]\n]*)\]\(\s*[a-z][a-z0-9+.-]*:[^)\s]*\s*\)/gi, '$1').replace(/\]\(\s*https?:[^)\s]*\s*\)/gi, ']').replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
  // a "[" whose link is not finished yet ("[label", "[label]", "[label](http...") holds the text from there on
  const openLink = (s: string) => {
    const at = s.lastIndexOf('[')
    if (at < 0) return -1
    const tail = s.slice(at)
    if (tail.includes('\n') || tail.length >= 600) return -1
    return !tail.includes(']') || tail.endsWith(']') || (tail.includes('](') && !/\]\([^)]*\)/.test(tail)) ? at : -1
  }
  return {
    push(delta: string) {
      carry += delta
      const hold = openLink(carry)
      const upto = hold < 0 ? carry : carry.slice(0, hold)
      const cut = Math.max(upto.lastIndexOf(' '), upto.lastIndexOf('\n'))
      if (cut < 0 && carry.length < 600) return ''
      const at = cut < 0 ? carry.length : cut + 1
      const out = strip(carry.slice(0, at)); carry = carry.slice(at)
      return out
    },
    end() { const out = strip(carry); carry = ''; return out },
  }
}

/**
 * A search result's page, not Google's wrapper around it (measured 31/10: sources shown as "google.com" / "translate.google.com"): a redirect
 * (`google.com/url?q=` / `url=`), a translate proxy (`translate.google.com/translate?u=`, `<host-with-dashes>.translate.goog`) becomes the page
 * it points to; any other Google page (a search page) is not a source (null). Only https results are sources. Pure.
 */
export function canonicalSourceUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const host = u.hostname.toLowerCase()
  if (host.endsWith('.translate.goog')) {
    // Google's scheme: "-" stands for "." and "--" for "-" in the original host; the _x_tr_* parameters are the proxy's own
    const original = host.slice(0, -'.translate.goog'.length).split('--').map(p => p.replace(/-/g, '.')).join('-')
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('_x_tr_')) u.searchParams.delete(k)
    return canonicalSourceUrl(`https://${original}${u.pathname}${u.search}${u.hash}`)
  }
  if (/(^|\.)google\.[a-z.]+$/.test(host)) {
    const inner = u.pathname === '/url' ? u.searchParams.get('q') ?? u.searchParams.get('url') : host.startsWith('translate.') ? u.searchParams.get('u') : null
    return inner && inner !== raw ? canonicalSourceUrl(inner) : null
  }
  return u.protocol === 'https:' ? u.toString() : null
}

/**
 * Measured 31/10: the writer numbered its own sections "1. Summary, 2. Scope" and then the research sections from 1 again. The numbers are
 * the code's: every "## <n>." heading is renumbered 1, 2, 3… in order, and every "### <n>.<m>" under it becomes "<section>.<1, 2…>" (an
 * unnumbered heading stays as written). Streaming-safe: a line that may be a heading is held until it ends.
 */
export function headingNumberer(): { push(delta: string): string; end(): string } {
  let held = ''
  let mid = false
  let section = 0
  let sub = 0
  const fix = (line: string) => {
    const h2 = /^##\s+\d{1,2}[.)]?\s+/.exec(line)
    if (h2 && !line.startsWith('###')) { section++; sub = 0; return `## ${section}. ${line.slice(h2[0].length)}` }
    const h3 = /^###\s+\d{1,2}\.\d{1,2}[.)]?\s+/.exec(line)
    if (h3 && section > 0) { sub++; return `### ${section}.${sub}. ${line.slice(h3[0].length)}` }
    return line
  }
  return {
    push(delta: string) {
      let text = held + delta
      held = ''
      let out = ''
      for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n')) {
        const line = text.slice(0, i)
        out += (mid ? line : fix(line)) + '\n'
        mid = false
        text = text.slice(i + 1)
      }
      if (!text) return out
      if (!mid && text.startsWith('#') && text.length < 300) { held = text; return out }
      mid = true
      return out + text
    },
    end() { const out = mid ? held : fix(held); held = ''; return out },
  }
}

/** The evidence the findings cite, in report order. */
export const citedEvidence = (evidence: readonly Evidence[], findings: readonly Finding[]) => {
  const cited = new Set(findings.map(f => f.source))
  return evidence.filter(e => cited.has(e.id))
}

/**
 * The sources list under the report: built by code, numbered as in the report, as PLAIN TEXT - the title and the site, never a link (the
 * research card links them; retrievalArchitecture.test.ts G1 keeps markdown links from retrieval to the enrichment site). Markdown and HTML
 * characters of a title are blanked, so a search result cannot turn into markup.
 */
export function sourcesBlock(evidence: readonly Evidence[], findings: readonly Finding[], lang: string, heading?: string): string {
  const used = citedEvidence(evidence, findings)
  if (!used.length) return ''
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
  const label = (t: string) => t.replace(/[[\]()<>`*_#|\\\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
  const head = heading || (lang === 'en' ? 'Sources' : 'Nguồn')
  return `\n\n### ${head}\n${used.map(e => `${e.id}. ${label(e.title) || host(e.url)} — ${host(e.url)}${e.published ? `, ${sourceDate(e.published, lang)}` : ''}`).join('\n')}\n`
}

/** A source's date as the reader's locale writes it: 22/10/2025 (vi), 2025-10-22 otherwise. Pure. */
export function sourceDate(iso: string, lang: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return lang === 'vi' ? `${d}/${m}/${y}` : `${y}-${m}-${d}`
}

/**
 * Which picture goes under which section of the written report: the writer heads each research section with its step's title, so a picture
 * goes to the level-2 heading whose title IS its step's title (numbering aside). No position guess: the report also has sections of its own
 * (the summary, the scope note, the recommendations), and a picture under the wrong section is worse than none. The picture's `title` is the
 * heading's title as the client reads it (answerDoc/parse headingTitle), so the article layout puts it right under that heading. Pure.
 */
export function sectionImages(report: string, plan: ResearchPlan, pictures: ReadonlyArray<string | null>): SectionImage[] {
  const heads = parseDoc(report).filter((b): b is Extract<DocBlock, { t: 'heading' }> => b.t === 'heading' && b.level === 2).map(b => headingTitle(b.text))
  const used = new Set<number>()
  const at = new Map<number, number>()
  const sections = sectionSteps(plan) // the plan's own steps come first, so `pictures[k]` is section k's
  sections.forEach((s, k) => {
    const own = headingTitle(s.title)
    const i = own ? heads.findIndex((h, j) => !used.has(j) && !!h && titleKey(h) === titleKey(own)) : -1
    if (i >= 0) { used.add(i); at.set(k, i) }
  })
  const out: SectionImage[] = []
  sections.forEach((_, k) => {
    const src = pictures[k]
    const i = at.get(k)
    if (!src || !httpsUrl(src) || i === undefined || out.length >= MAX_SECTION_IMAGES) return
    out.push({ title: heads[i]!, src })
  })
  return out
}

/** Runs one deep research. Never throws: a failure ends with a `failed` status and whatever was written. */
export async function runDeepResearch(question: string, context: string, lang: string, deps: DeepResearchDeps, emit: ResearchEmit): Promise<{ plan: ResearchPlan | null; evidence: Evidence[]; findings: Finding[]; failed: string | null; cut?: boolean; followUps?: number }> {
  const now = deps.now ?? Date.now
  const t0 = now()
  const evidence: Evidence[] = []
  const findings: Finding[] = []
  const byUrl = new Map<string, Evidence>()
  const fail = (title: string, steps: ResearchStatus['steps'], why: string) => { emit.status({ type: 'tappy.research.v1', title, phase: 'failed', steps, sources: evidence.length }); return why }
  emit.status({ type: 'tappy.research.v1', title: clean(question, 120), phase: 'planning', steps: [], sources: 0 })
  let plan: ResearchPlan | null = null
  try { plan = normalisePlan(await deps.plan(question, context), question) } catch { plan = null }
  if (!plan) return { plan: null, evidence, findings, failed: fail(clean(question, 120), [], 'no_plan') }
  const steps: ResearchStatus['steps'] = plan.steps.map(s => ({ title: s.title, status: 'pending' }))
  const show = (phase: ResearchStatus['phase']) => emit.status({ type: 'tappy.research.v1', title: plan!.title, phase, steps: steps.map(s => ({ ...s })), sources: evidence.length })
  show('researching')
  // the section pictures are looked up while the research runs (no added wait): the first MAX_SECTION_IMAGES steps that have something to show
  let wanted = 0
  const picturesP: Promise<Array<string | null>> = Promise.all(plan.steps.map(async s => {
    if (!deps.images || !s.image_query || wanted >= MAX_SECTION_IMAGES) return null
    wanted++
    return (await deps.images(s.image_query).catch(() => [] as string[])).find(httpsUrl) ?? null
  }))

  const runStep = async (k: number): Promise<void> => {
    const step = plan!.steps[k]
    steps[k].status = 'running'; show('researching')
    const gathered = (await Promise.all(step.queries.map(q => deps.gather(q, `${step.title} - ${question}`).catch(() => [])))).flat()
    const mine: Evidence[] = []
    for (const g of gathered) {
      const url = g.url ? canonicalSourceUrl(g.url) : null
      if (!url) continue
      let e = byUrl.get(url)
      if (!e) {
        const published = typeof g.published === 'string' && /^\d{4}-\d{2}-\d{2}/.test(g.published) ? g.published.slice(0, 10) : undefined
        e = { id: evidence.length + 1, title: clean(g.title, 200), url, snippet: clean(g.snippet, 400), text: g.text.slice(0, 6000), ...(published ? { published } : {}) }
        evidence.push(e); byUrl.set(url, e)
      }
      if (!mine.includes(e)) mine.push(e)
    }
    if (!mine.length) { steps[k].status = 'failed'; show('researching'); return }
    const got = await deps.notes(step.title, question, mine).catch(() => [])
    const ids = new Set(mine.map(e => e.id))
    let kept = 0
    for (const f of got) {
      const text = clean(f.text, 600)
      if (!text || !ids.has(f.source)) continue
      findings.push({ step: k + 1, text, source: f.source })
      if (++kept >= DEEP_RESEARCH_LIMITS.findingsPerStep) break
    }
    steps[k].status = 'done'; show('researching')
  }
  // every step at once; a step still running at the deadline is dropped (marked failed), the report is written from what came back
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'deadline'>(r => { timer = setTimeout(() => r('deadline'), Math.max(0, DEEP_RESEARCH_LIMITS.researchDeadlineMs - (now() - t0))) })
  const round = (from: number) => Promise.race([Promise.all(plan!.steps.slice(from).map((_, j) => runStep(from + j).catch(() => { steps[from + j].status = 'failed' }))), deadline])
  let timedOut = (await round(0)) === 'deadline'
  // the second round: what the question asks that the findings do not answer yet, as follow-up steps (shown on the card like the others)
  let followUps = 0
  if (!timedOut && deps.gaps && findings.length && DEEP_RESEARCH_LIMITS.researchDeadlineMs - (now() - t0) >= GAP_MIN_LEFT_MS) {
    const asked = await deps.gaps(question, plan, findings.map(f => f.text)).catch(() => [])
    const planned = plan.steps.length
    const more = (Array.isArray(asked) ? asked : [])
      .map(g => {
        const s = normalisePlan({ title: plan!.title, steps: [g] }, question)?.steps[0]
        const c = Number((g as { completes?: unknown } | null)?.completes)
        return s ? { title: s.title, queries: s.queries, ...(Number.isInteger(c) && c >= 1 && c <= planned ? { completes: c } : {}) } : null
      }).filter((s): s is ResearchPlan['steps'][number] => !!s).slice(0, GAP_STEPS)
    if (more.length) {
      const from = plan.steps.length
      plan = { ...plan, steps: [...plan.steps, ...more] }
      for (const s of more) steps.push({ title: s.title, status: 'pending' })
      followUps = more.length
      show('researching')
      timedOut = (await round(from)) === 'deadline'
    }
  }
  clearTimeout(timer)
  for (const s of steps) if (s.status !== 'done') s.status = 'failed'
  if (!findings.length) return { plan, evidence, findings, failed: fail(plan.title, steps, 'no_findings') }

  show('writing')
  // the report numbers its sources 1..n: only the cited ones, renumbered in the order they were found (the person reads [1]..[n], not [3][14][24])
  const renumber = new Map(citedEvidence(evidence, findings).map((e, i) => [e.id, i + 1]))
  const cited = citedEvidence(evidence, findings).map(e => ({ ...e, id: renumber.get(e.id)! }))
  const notes = findings.map(f => ({ ...f, source: renumber.get(f.source)! }))
  const stripper = linkStripper()
  const numberer = headingNumberer()
  let cut = false
  let written = ''
  const say = (t: string) => { if (t) { written += t; emit.text(t) } }
  const finish = () => { say(numberer.push(stripper.end())); say(numberer.end()) }
  try {
    for await (const delta of deps.write({ question, plan, evidence: cited, findings: notes })) {
      say(numberer.push(stripper.push(delta)))
      // the run's own deadline: what was written stays and gets its sources (the route must answer inside its maxDuration)
      if (now() - t0 >= DEEP_RESEARCH_LIMITS.runDeadlineMs) { cut = true; break }
    }
    finish()
  } catch {
    finish()
    return { plan, evidence, findings, failed: fail(plan.title, steps, 'write_failed'), cut }
  }
  emit.text(sourcesBlock(cited, notes, lang, plan.sources_label))
  // the pictures go under their sections (an annotation the article layout places; never in the text). A lookup still running is not waited for.
  let pictureTimer: ReturnType<typeof setTimeout> | undefined
  const pictures = await Promise.race([picturesP, new Promise<null>(r => { pictureTimer = setTimeout(() => r(null), 1500) })])
  clearTimeout(pictureTimer)
  const placed = pictures ? sectionImages(written, plan, pictures) : []
  if (placed.length && emit.images) emit.images(placed)
  const links = cited.map(e => ({ id: e.id, title: e.title, url: e.url }))
  emit.status({ type: 'tappy.research.v1', title: plan.title, phase: 'done', steps: steps.map(s => ({ ...s })), sources: evidence.length, links })
  return { plan, evidence, findings, failed: null, cut, followUps }
}
