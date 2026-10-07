// ── Bounded agent → the AI SDK data-stream protocol ────────────────────────────────────────────────────────────────────────
//
// The route's post-processing (stream guards, card / map / brochure enrichment, cost line) and both clients read the AI SDK data stream:
// `9:` tool call, `a:` tool result, `8:` annotations, `0:` text, `e:` step finish, `d:` done. The agent emits EXACTLY that shape, so
// nothing downstream knows (or needs to know) who decided. Tool frames go out as each tool finishes (live progress); the text goes out
// once the loop ends. `toDataStreamResponse()` / `steps` / `text` mirror the parts of the streamText result the route reads.

import type { AgentRun, AgentStep } from './loop'

export interface AgentStreamResult {
  toDataStreamResponse(): Response
  steps: Promise<Array<{ providerMetadata?: Record<string, unknown>; usage?: { promptTokens: number; completionTokens: number }; toolCalls: unknown[]; toolResults: unknown[]; text: string }>>
  text: Promise<string>
}

const HEADERS = { 'content-type': 'text/plain; charset=utf-8', 'x-vercel-ai-data-stream': 'v1', 'cache-control': 'no-store' }

/** Text split into a few chunks so the client renders progressively (the guards buffer and re-join it anyway). */
export function textFrames(text: string): string {
  const out: string[] = []
  const parts = text.match(/[^\n]*\n|[^\n]+$/g) ?? [text]
  for (const p of parts) if (p) out.push(`0:${JSON.stringify(p)}\n`)
  return out.join('')
}

export function finishFrames(usage: { promptTokens: number; completionTokens: number }): string {
  return `e:${JSON.stringify({ finishReason: 'stop', usage, isContinued: false })}\nd:${JSON.stringify({ finishReason: 'stop', usage })}\n`
}

/**
 * Runs `start` (the agent) inside a stream. `emit` writes raw protocol lines while it runs (tool frames, progress); when it resolves,
 * the final text and the finish frames are written and `onFinish` gets the SDK-shaped summary the route's accounting already reads.
 */
/**
 * Extension point (not used yet): content shown BELOW the answer, kept apart from organic suggestions. When a provider is supplied it is emitted as its own
 * annotation kind `tappy.sponsored.v1` after the answer text — never mixed into the text, never decided by the model. No provider exists in this release.
 */
export interface BelowAnswerItem { label: string; url: string; sponsor: string }
export function belowAnswerFrame(items: readonly BelowAnswerItem[]): string {
  return items.length ? `8:${JSON.stringify([{ kind: 'tappy.sponsored.v1', items }])}\n` : ''
}

export function agentStreamResult(start: (emit: (line: string) => void) => Promise<AgentRun>, onFinish?: (o: { usage: { promptTokens: number; completionTokens: number; totalTokens: number }; finishReason: string; text: string; steps: Array<{ providerMetadata?: Record<string, unknown>; usage?: { promptTokens: number; completionTokens: number }; toolCalls: unknown[]; toolResults: unknown[]; text: string }> }) => unknown): AgentStreamResult {
  let resolveSteps!: (s: Awaited<AgentStreamResult['steps']>) => void
  let resolveText!: (t: string) => void
  const steps = new Promise<Awaited<AgentStreamResult['steps']>>(r => { resolveSteps = r })
  const text = new Promise<string>(r => { resolveText = r })
  const enc = new TextEncoder()
  let body: ReadableStream<Uint8Array> | null = null
  const make = () => new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (line: string) => { try { controller.enqueue(enc.encode(line.endsWith('\n') ? line : `${line}\n`)) } catch { /* closed */ } }
      let run: AgentRun | null = null
      try {
        run = await start(emit)
      } catch (e) {
        console.error('[agent] run failed:', e)
      }
      const finalText = run?.text ?? 'Xin lỗi, mình chưa trả lời được lúc này. Bạn thử lại sau ít phút nhé.'
      const sdkSteps = (run?.steps ?? []).map((s: AgentStep) => ({ providerMetadata: s.providerMetadata, usage: s.usage, toolCalls: s.toolCalls, toolResults: [], text: s.text }))
      const usage = sdkSteps.reduce((a, s) => ({ promptTokens: a.promptTokens + (s.usage?.promptTokens ?? 0), completionTokens: a.completionTokens + (s.usage?.completionTokens ?? 0) }), { promptTokens: 0, completionTokens: 0 })
      emit(textFrames(finalText))
      try { await onFinish?.({ usage: { ...usage, totalTokens: usage.promptTokens + usage.completionTokens }, finishReason: 'stop', text: finalText, steps: sdkSteps }) } catch (e) { console.error('[agent] onFinish failed:', e) }
      emit(finishFrames(usage))
      resolveSteps(sdkSteps)
      resolveText(finalText)
      controller.close()
    },
  })
  return {
    toDataStreamResponse() { body ??= make(); return new Response(body, { status: 200, headers: HEADERS }) },
    steps,
    text,
  }
}
