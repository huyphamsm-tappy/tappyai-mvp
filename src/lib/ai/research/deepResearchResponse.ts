// ── 31/10: the HTTP answer of a Deep Research turn, in the chat's data-stream protocol ─────────────────────────────────────────────────────
//
// The web client's useChat reads the same frames as for a normal turn: `8:` message annotations (the research card: plan, step progress), `0:`
// text deltas (the report), `d:` the finish. One cost line (`tappyai_turn_cost`, the same shape the chat logs: the model calls' own prices +
// Serper credits) and one outcome line (`tappyai_deep_research`, counts only, never the question or the report). A failed run gives the
// question back (the route's refund) and says so in the text.

import { runDeepResearch, chartsFrame, type DeepResearchDeps, type ResearchStatus } from './deepResearch'
import { evidenceCounts } from './deepResearchDeps'
import { DOC_MEDIA_KIND, docMediaFrame, sanitizeDocMedia } from '@/lib/answerDoc/media'

export interface DeepResearchTurn {
  question: string
  context: string
  lang: string
  deps: DeepResearchDeps
  cost: { usd: number; calls: number }
  /** Serper credits spent since the turn started, priced (turnCost.ts); read at the end. */
  serperUsd: () => { usd: number; calls: number }
  onFailed: (reason: string) => Promise<void> | void
  /** 01/11: the run's price once known (the usage ledger); never awaited, must not throw. */
  onUsage?: (u: { usd: number; searchCalls: number; ok: boolean; llmUsd: number; serperUsd: number }) => void
  /**
   * review 02/11: aborted when the person goes away - by the route (the request's own signal) or here (the body cancelled). The run stops and
   * is given back ('client_gone'); the deps' model calls are built on the same signal, so the call in flight is dropped too.
   */
  stop?: AbortController
}

const FAILED_TEXT: Record<string, string> = {
  vi: 'Lần nghiên cứu này không hoàn thành được (không lập được kế hoạch hoặc không tìm được nguồn đọc được). Lượt hỏi đã được hoàn lại; bạn thử lại sau hoặc hỏi cụ thể hơn nhé.',
  en: 'This research could not be completed (no plan, or no readable sources were found). The question was given back; please try again later or ask more specifically.',
}

export function deepResearchResponse(t: DeepResearchTurn): Response {
  const enc = new TextEncoder()
  const t0 = Date.now()
  const body = new ReadableStream<Uint8Array>({
    async start(c) {
      const send = (line: string) => { try { c.enqueue(enc.encode(line + '\n')) } catch { /* client gone */ } }
      let chars = 0
      let pictures = 0
      const out = await runDeepResearch(t.question, t.context, t.lang, t.deps, {
        status: (s: ResearchStatus) => send(`8:${JSON.stringify([s])}`),
        text: (x: string) => { chars += x.length; send(`0:${JSON.stringify(x)}`) },
        // the section pictures, as the answer's item pictures (tappy.doc_media.v1, re-validated here and again by the client; live-only)
        // the section charts (drawn by the client from these checked figures; every point names its source)
        charts: charts => send(`8:${JSON.stringify([chartsFrame(charts)])}`),
        images: items => { const a = sanitizeDocMedia({ kind: DOC_MEDIA_KIND, v: 1, items: items.map(i => ({ title: i.title, src: i.src, source: 'web' })) }); if (a) { pictures = a.items.length; send(docMediaFrame(a).trimEnd()) } },
      }, t.stop?.signal)
      // the person left before any report text went out: nothing was read, so the run is given back. Review 01/11: once the report had started
      // streaming it was read (at least in part), so leaving before the sources is not a way to get the quota back.
      if (out.failed === 'client_gone') { if (chars === 0) await Promise.resolve(t.onFailed(out.failed)) }
      else if (out.failed && chars === 0) { send(`0:${JSON.stringify(FAILED_TEXT[t.lang === 'en' ? 'en' : 'vi'])}`); await Promise.resolve(t.onFailed(out.failed)) }
      const serper = t.serperUsd()
      const usd = Math.round((t.cost.usd + serper.usd) * 1e6) / 1e6
      console.log(JSON.stringify({ type: 'tappyai_turn_cost', turnType: 'deep_research', usd, answerUsd: Math.round(t.cost.usd * 1e6) / 1e6, serperUsd: serper.usd, serperCalls: serper.calls, modelCalls: t.cost.calls }))
      try { t.onUsage?.({ usd, searchCalls: serper.calls, ok: !out.failed, llmUsd: Math.round(t.cost.usd * 1e6) / 1e6, serperUsd: serper.usd }) } catch { /* the ledger never breaks a run */ }
      console.log(JSON.stringify({ type: 'tappyai_deep_research', ok: !out.failed, failed: out.failed, cut: out.cut === true, follow_ups: out.followUps ?? 0, steps: out.plan?.steps.length ?? 0, findings: out.findings.length, ...evidenceCounts(out.evidence), report_chars: chars, pictures, charts: out.charts ?? 0, figures_proposed: out.figures?.proposed ?? 0, figures_kept: out.figures?.kept ?? 0, step_stats: out.stepStats ?? [], unsupported_numbers: out.unsupported?.length ?? 0, unsupported_sample: (out.unsupported ?? []).slice(0, 12), ms: Date.now() - t0 }))
      send(`d:${JSON.stringify({ finishReason: out.failed ? 'error' : 'stop', usage: { promptTokens: 0, completionTokens: 0 } })}`)
      try { c.close() } catch { /* client gone */ }
    },
    cancel() { t.stop?.abort() },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Vercel-AI-Data-Stream': 'v1', 'Cache-Control': 'no-cache' } })
}
