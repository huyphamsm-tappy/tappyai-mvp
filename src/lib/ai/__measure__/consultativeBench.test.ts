import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { countClarificationQuestions } from '@/lib/ai/clarification'
import { detectDecisionStage, detectForcedTool, detectLocationIntent, detectLang, detectExplicitLangRequest } from '@/lib/ai/intent'

// ── C3-A consultative benchmark ──────────────────────────────────────────────
//
// Needs a server on TAPPY_BASE_URL (default http://localhost:3100):
//   TAPPY_MEASURE=1 npx vitest run src/lib/ai/__measure__/consultativeBench.test.ts --disable-console-intercept
//
// Measures the CURRENT implementation across the 20 scenarios in the C3 brief,
// in Vietnamese and English, so C3-B has a before-picture that is not "it felt
// better". Nothing here asserts a target — it records what ships today.
//
// Every metric is a heuristic over the reply text and the tool frames. They are
// reported as counts, not verdicts: "hasTradeoff" means contrast language was
// present, not that the trade-off was correct. Samples are dumped so the
// judgement stays human.

const MEASURE = process.env.TAPPY_MEASURE === '1'
const BASE = process.env.TAPPY_BASE_URL ?? 'http://localhost:3100'
const OUT = process.env.TAPPY_BENCH_OUT ?? 'c3a-benchmark.json'

type Turn = {
  text: string; tools: string[]; steps: number
  promptTokens: number; completionTokens: number; ms: number
  toolNames: string[]   // place/product names the tools actually returned
}

async function ask(messages: Array<{ role: string; content: string }>): Promise<Turn> {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.text()
  let text = ''
  const tools: string[] = []
  const toolNames: string[] = []
  let steps = 0
  let usage: { promptTokens?: number; completionTokens?: number } = {}
  for (const line of body.split('\n')) {
    if (line.startsWith('0:')) { try { text += JSON.parse(line.slice(2)) as string } catch { /* partial */ } }
    else if (line.startsWith('9:')) { try { tools.push((JSON.parse(line.slice(2)) as { toolName: string }).toolName) } catch { /* */ } }
    else if (line.startsWith('e:')) steps++
    else if (line.startsWith('d:')) { try { usage = (JSON.parse(line.slice(2)) as { usage: typeof usage }).usage } catch { /* */ } }
    else if (line.startsWith('a:')) {
      try {
        const r = (JSON.parse(line.slice(2)) as { result?: Record<string, unknown> }).result ?? {}
        for (const key of ['results', 'search_results', 'hotel_list']) {
          const arr = r[key]
          if (Array.isArray(arr)) for (const it of arr) {
            const n = (it as { name?: string; title?: string }).name ?? (it as { title?: string }).title
            if (n) toolNames.push(String(n))
          }
        }
      } catch { /* ignore */ }
    }
  }
  return {
    text: text.trim(), tools, steps, toolNames,
    promptTokens: usage.promptTokens ?? 0, completionTokens: usage.completionTokens ?? 0,
    ms: Date.now() - t0,
  }
}

const prose = (s: string) => {
  let end = s.length
  for (const m of ['[CTA_BUTTONS]', '[FOLLOWUPS]', '[TAPPY_PLAN]']) {
    const i = s.indexOf(m); if (i !== -1 && i < end) end = i
  }
  return s.slice(0, end)
}
const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim()

// Contrast language — a stated downside. Not proof the trade-off is correct.
const TRADEOFF = /\b(nhưng|tuy nhiên|đổi lại|bù lại|hạn chế|nhược điểm|đánh đổi|however|but |downside|drawback|trade-?off|although|though)\b/i
// A stated preference among the options.
const PICK = /\b(mình nghiêng về|mình chọn|mình sẽ chọn|nếu.{0,40}mình (chọn|nghiêng)|gợi ý số 1|lựa chọn tốt nhất là|my pick|i'?d (go with|pick|choose|lean)|best overall|i'?d recommend)\b/i
// Causal language tying an option to the user.
const REASONING = /\b(vì|bởi|do |hợp với|phù hợp|thích hợp|because|since|fits|suits|ideal for|great for|good for)\b/i
const VI_LETTERS = /[ăâđêôơư]|[àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i

// ── Option count (C3-B.2 Phase 2) ────────────────────────────────────────────
// The previous metric was `boldSpans` — every **…** in the reply. It does NOT
// measure options: the style rule bolds place names, product names AND prices,
// and a clarification question bolds its own label, so a reply offering nothing
// scored 1–2 and a well-evidenced two-option comparison scored 11.
//
// This counts bold spans that HEAD a line or list item, minus section labels
// (which end in ':' or '?'). Validated 2026-08-11 against 18 live replies:
// real comparisons resolve to exactly the compared entities (["Phở","Bún bò"],
// ["My Khe Beach","Da Nang City Centre"], ["iPhone","Samsung"]) and pure
// questionnaires resolve to 0, where boldSpans said 1–2.
//
// KNOWN FALSE POSITIVE, do not read the count without the list: when a
// clarification question is followed by a bolded bullet list of CRITERIA
// ("- **Giá rẻ** → …", "- **Camera chất lượng** → …"), those criteria are
// counted as options. Observed on 14-vi. The list is therefore recorded
// alongside the number so the count stays auditable rather than trusted.
function optionsHeaded(reply: string): string[] {
  const out: string[] = []
  for (const line of prose(reply).split(/\r?\n/)) {
    const m = line.match(/^\s*(?:[-•*]|\d+[.)])?\s*\*\*([^*]{2,60})\*\*/)
    if (m) { const s = m[1].trim(); if (!/[?:]$/.test(s)) out.push(s) }
  }
  return out
}

/** What the user actually asked — NOT what the assistant replied. The previous
 *  version passed the reply text here, so the `stage` column classified the
 *  model's own output: 05-en (a comparison) recorded `null` while 16-en (a gold
 *  price lookup) recorded `comparison`. Every stage figure derived from that
 *  column was noise. */
function score(turn: Turn, lang: string, prior: boolean, userRequest: string) {
  const p = prose(turn.text)
  const bold = [...p.matchAll(/\*\*([^*]{2,60})\*\*/g)].map(m => m[1].trim())
  const toolSet = turn.toolNames.map(norm)
  const matched = bold.filter(b => toolSet.some(t => t.includes(norm(b)) || norm(b).includes(t)))
  const unmatched = bold.filter(b => !matched.includes(b))
  const options = optionsHeaded(turn.text)
  return {
    // ── what the ROUTE decided for this request, recomputed from the shipped
    // detectors on the same input the route saw. Records the branch, not a guess.
    request: userRequest,
    stage: detectDecisionStage(userRequest, { hasPriorAssistantTurn: prior }),
    forcedTool: detectForcedTool(userRequest),
    locationIntent: detectLocationIntent(userRequest),
    resolvedLang: detectExplicitLangRequest(userRequest) ?? detectLang(userRequest),
    // search_products is dropped from the tool set when locationIntent is
    // 'offline' (route.ts) — so record whether it was even offered.
    searchProductsAvailable: detectLocationIntent(userRequest) !== 'offline',
    // ── options: the audited metric, plus the raw span count it replaces
    optionCount: options.length,
    optionsNamed: options,
    boldSpans: bold.length,
    groundedNames: matched.length,
    ungroundedBold: unmatched.slice(0, 6),
    toolNamesReturned: turn.toolNames.length,
    hasReasoning: REASONING.test(p),
    hasTradeoff: TRADEOFF.test(p),
    hasPick: PICK.test(p),
    hasAction: turn.text.includes('[CTA_BUTTONS]'),
    hasFollowups: turn.text.includes('[FOLLOWUPS]'),
    clarifications: countClarificationQuestions(turn.text),
    llmCalls: turn.steps,
    toolCalls: turn.tools.length,
    tools: turn.tools,
    inTok: turn.promptTokens,
    outTok: turn.completionTokens,
    ms: turn.ms,
    langOk: lang === 'vi' ? VI_LETTERS.test(p) : true,
    proseChars: p.length,
  }
}

type Scenario = { id: string; group: string; name: string; lang: string; turns: string[] }

const S: Scenario[] = []
const pair = (id: string, group: string, name: string, vi: string[], en: string[]) => {
  S.push({ id: `${id}-vi`, group, name, lang: 'vi', turns: vi })
  S.push({ id: `${id}-en`, group, name, lang: 'en', turns: en })
}

// ── Food ─────────────────────────────────────────────────────────────────────
pair('01', 'food', 'broad discovery', ['Gợi ý quán ăn ngon ở Quận 1'], ['Suggest good restaurants in District 1 Ho Chi Minh'])
pair('02', 'food', 'budget-constrained', ['Quán ăn ngon ở Quận 1 dưới 150k'], ['Good restaurants in District 1 under 150k VND'])
pair('03', 'food', 'location-constrained', ['Quán ăn gần Hồ Hoàn Kiếm'], ['Restaurants near Hoan Kiem Lake'])
pair('04', 'food', 'preference-constrained', ['Quán chay ngon ở Hà Nội'], ['Good vegetarian restaurants in Hanoi'])
pair('05', 'food', 'comparison', ['Nên chọn quán phở hay quán bún bò cho bữa tối?'], ['Pho or bun bo for dinner, which should I pick?'])
pair('06', 'food', 'refinement', ['Gợi ý quán ăn ngon ở Quận 1', 'Rẻ hơn.'], ['Suggest good restaurants in District 1', 'Cheaper.'])

// ── Travel ───────────────────────────────────────────────────────────────────
pair('07', 'travel', 'hotel discovery', ['Tìm khách sạn ở Đà Nẵng'], ['Find hotels in Da Nang'])
pair('08', 'travel', 'hotel budget', ['Khách sạn Đà Nẵng dưới 2 triệu'], ['Hotels in Da Nang under 2 million VND'])
pair('09', 'travel', 'hotel comparison', ['Nên ở gần biển Mỹ Khê hay gần trung tâm Đà Nẵng?'], ['Should I stay near My Khe beach or Da Nang city centre?'])
pair('10', 'travel', 'trip planning', ['Lên lịch trình du lịch Đà Nẵng 3 ngày ngân sách 5 triệu'], ['Plan a 3 day trip to Da Nang with a 5 million VND budget'])
pair('11', 'travel', 'plan refinement', ['Tìm khách sạn ở Đà Nẵng', 'Gần biển.'], ['Find hotels in Da Nang', 'Closer to the beach.'])

// ── Shopping ─────────────────────────────────────────────────────────────────
pair('12', 'shopping', 'product discovery', ['Mua tai nghe bluetooth ở đâu'], ['Where can I buy bluetooth headphones'])
pair('13', 'shopping', 'budget-constrained', ['Tai nghe bluetooth dưới 1 triệu'], ['Bluetooth headphones under 1 million VND'])
pair('14', 'shopping', 'product comparison', ['Nên mua iPhone hay Samsung?'], ['Should I buy an iPhone or a Samsung?'])
pair('15', 'shopping', 'recommendation', ['Tư vấn giúp mình chọn tai nghe để đi làm'], ['Help me choose headphones for commuting'])

// ── General ──────────────────────────────────────────────────────────────────
pair('16', 'general', 'factual', ['Giá vàng SJC hôm nay'], ['Gold price today'])
pair('17', 'general', 'ambiguous', ['Gợi ý cho mình cái gì đó đi'], ['Recommend me something'])
pair('18', 'general', 'confirmation', ['Gợi ý quán ăn ngon ở Quận 1', 'Ok.'], ['Suggest good restaurants in District 1', 'Sounds good.'])
pair('19', 'general', 'follow-up refinement', ['Tìm khách sạn ở Đà Nẵng', 'Đổi sang Hội An.'], ['Find hotels in Da Nang', 'Change to Hoi An.'])
pair('20', 'general', 'chitchat', ['Chào Tappy'], ['Hi there'])

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe.skipIf(!MEASURE)('C3-A consultative benchmark (current implementation)', () => {
  it('runs the 20 scenarios in vi and en', async () => {
    const rows: Array<Record<string, unknown>> = []
    for (const sc of S) {
      const history: Array<{ role: string; content: string }> = []
      let last: Turn | null = null
      try {
        for (const t of sc.turns) {
          await sleep(2200)
          history.push({ role: 'user', content: t })
          last = await ask(history)
          history.push({ role: 'assistant', content: last.text })
        }
      } catch (e) {
        console.log(`${sc.id} ERROR ${String(e)}`); continue
      }
      const m = score(last!, sc.lang, sc.turns.length > 1, sc.turns[sc.turns.length - 1])
      rows.push({ ...sc, ...m, sample: prose(last!.text).replace(/\s+/g, ' ').slice(0, 300) })
      console.log(
        `${sc.id.padEnd(7)} ${sc.group.padEnd(8)} ${sc.name.padEnd(22)} ` +
        `stage=${String(m.stage ?? '-').padEnd(11)} sp=${m.searchProductsAvailable ? 'Y' : 'n'} ` +
        `opt=${String(m.optionCount).padStart(2)}(bold ${String(m.boldSpans).padStart(2)}, ${m.groundedNames}g) ` +
        `why=${m.hasReasoning ? 'Y' : '.'} trade=${m.hasTradeoff ? 'Y' : '.'} pick=${m.hasPick ? 'Y' : '.'} ` +
        `act=${m.hasAction ? 'Y' : '.'} clar=${m.clarifications} ` +
        `llm=${m.llmCalls} tool=${m.toolCalls} out=${String(m.outTok).padStart(4)} ${String(m.ms).padStart(6)}ms ` +
        `${m.langOk ? '' : 'LANG!'}`,
      )
    }

    const agg = (f: (r: Record<string, unknown>) => boolean) => rows.filter(f).length
    const rec = rows.filter(r => ['food', 'travel', 'shopping'].includes(r.group as string) && (r.toolCalls as number) > 0)
    console.log('\n=== TOTALS ===')
    console.log(`  scenarios run           ${rows.length}`)
    console.log(`  with reasoning          ${agg(r => r.hasReasoning as boolean)}/${rows.length}`)
    console.log(`  with TRADE-OFF          ${agg(r => r.hasTradeoff as boolean)}/${rows.length}`)
    console.log(`  with a PICK             ${agg(r => r.hasPick as boolean)}/${rows.length}`)
    console.log(`  with action (CTA)       ${agg(r => r.hasAction as boolean)}/${rows.length}`)
    console.log(`  asked >1 clarification  ${agg(r => (r.clarifications as number) > 1)}/${rows.length}`)
    console.log(`  language slips          ${agg(r => !(r.langOk as boolean))}/${rows.length}`)
    const optCounts = rec.map(r => r.optionCount as number)
    const boldCounts = rec.map(r => r.boldSpans as number)
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
    console.log(`  recommendation turns    ${rec.length}`)
    console.log(`  OPTIONS     min/med/max ${Math.min(...optCounts)}/${med(optCounts)}/${Math.max(...optCounts)}   ← the 2-4 contract`)
    console.log(`  bold spans  min/med/max ${Math.min(...boldCounts)}/${med(boldCounts)}/${Math.max(...boldCounts)}   (raw diagnostic, NOT an option count)`)
    const cmp = rows.filter(r => r.stage === 'comparison')
    console.log(`  comparison requests     ${cmp.length}`)
    console.log(`  …that called a tool     ${cmp.filter(r => (r.toolCalls as number) > 0).length}/${cmp.length}`)
    console.log(`  …with search_products offered ${cmp.filter(r => r.searchProductsAvailable).length}/${cmp.length}`)
    console.log(`  total LLM calls         ${rows.reduce((n, r) => n + (r.llmCalls as number), 0)}`)
    console.log(`  total tool calls        ${rows.reduce((n, r) => n + (r.toolCalls as number), 0)}`)
    console.log(`  total output tokens     ${rows.reduce((n, r) => n + (r.outTok as number), 0)}`)
    console.log(`  mean latency            ${Math.round(rows.reduce((n, r) => n + (r.ms as number), 0) / rows.length)}ms`)

    writeFileSync(OUT, JSON.stringify(rows, null, 2))
    console.log(`\nwrote ${OUT}`)
  }, 3_600_000)
})
