// ── UAT4 P1-f: A PLANNING TURN THAT ENDS WITHOUT ITS PLAN ────────────────────
//
// Measured (Android long thread, owner UAT4 turn 26; replayed 27 Sep 2026, 1 of 3 runs at turn 11):
// the model runs the plan's tools, writes "Giờ mình sẽ lập kế hoạch chi tiết…" and stops
// (finishReason "stop", step 2 of 8) — no [TAPPY_PLAN] block, so no plan card. Detection was
// right (planningIntent 'trip'); the model simply announced the plan instead of writing it.
//
// A prompt rule does not reliably stop this kind of behaviour (measured on other guards), so the
// completion is deterministic: the finish frame (`d:`) is held; when the turn is a planning turn
// and the streamed text has no complete block, ONE extra model call — the same system prompt,
// the conversation, this turn's tool results as text, and an instruction to output only the block —
// supplies it, and the block is streamed as ordinary text BEFORE the finish frame. Everything
// downstream (plan price guard, local-tips guard, photos) therefore treats it like any plan.
//
// Fail-open: any error or timeout, or an answer without a complete block, ships the turn exactly
// as the model left it. Writes nothing; one call at most; inert on non-planning turns.

const PLAN_RE = /\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/

export const PLAN_COMPLETION_TIMEOUT_MS = 45_000
/** Below this there is no point starting the call (a plan block takes ~10–30 s). */
export const MIN_COMPLETION_MS = 8_000

/** Does the reply already carry a complete plan block? */
export function hasCompletePlan(text: string): boolean {
  return PLAN_RE.test(text)
}

/** The first complete [TAPPY_PLAN] block of a model answer, or null — prose around it is dropped. */
export function extractPlanBlock(text: string): string | null {
  return text.match(PLAN_RE)?.[0] ?? null
}

/**
 * The tool results of this turn as one text section, largest last and capped — the completion
 * call has no tools declared, so it cannot receive tool_use / tool_result parts.
 */
export function toolResultDigest(results: ReadonlyArray<{ toolName: string; result: unknown }>, maxChars = 12_000): string {
  const parts = results.map(r => `### ${r.toolName}\n${JSON.stringify(r.result ?? null)}`)
  let out = parts.join('\n\n')
  if (out.length > maxChars) out = out.slice(0, maxChars) + '\n…'
  return out
}

export function completionInstruction(lang: string): string {
  return lang === 'en'
    ? 'You announced the plan but did not write it. Using ONLY the tool results above, output the [TAPPY_PLAN]…[/TAPPY_PLAN] block now, in the exact format of the system instructions. Output the block only — no other words.'
    : 'Bạn đã nói sẽ lập kế hoạch nhưng chưa xuất khối kế hoạch. Chỉ dựa vào kết quả công cụ ở trên, hãy xuất ngay khối [TAPPY_PLAN]…[/TAPPY_PLAN] đúng định dạng trong hướng dẫn hệ thống. Chỉ xuất khối đó, không viết thêm chữ nào khác.'
}

export interface PlanCompletionOptions {
  /** A planning turn (planningIntent set). False → the stream passes through untouched. */
  needed: boolean
  /** Makes the extra call with the text streamed so far; resolves to the model's raw answer. */
  complete: (textSoFar: string) => Promise<string>
  timeoutMs?: number
  /** Epoch ms by which the whole turn must be done (route: request start + 55 s, under maxDuration 60). */
  deadlineAt?: number
  log?: (event: Record<string, unknown>) => void
}

/**
 * Pass an AI SDK data stream through, holding its finish frame(s); append the plan block when the
 * planning turn ended without one.
 */
export function planCompletionStream(body: ReadableStream<Uint8Array>, opts: PlanCompletionOptions): ReadableStream<Uint8Array> {
  if (!opts.needed) return body
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const log = opts.log ?? ((e) => console.log(JSON.stringify(e)))
  let remainder = ''
  let text = ''
  let failed = false
  const held: string[] = []
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      remainder += decoder.decode(chunk, { stream: true })
      const lines = remainder.split('\n')
      remainder = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('d:')) { held.push(line); continue }
        if (line.startsWith('0:')) { try { text += JSON.parse(line.slice(2)) } catch { /* not ours to judge */ } }
        if (line.startsWith('3:')) failed = true
        controller.enqueue(encoder.encode(line + '\n'))
      }
    },
    async flush(controller) {
      if (remainder) {
        if (remainder.startsWith('d:')) held.push(remainder)
        else controller.enqueue(encoder.encode(remainder + '\n'))
      }
      // A turn the provider failed (an error frame) is not "a plan left unwritten": the same
      // provider would fail again, and waiting on it only delays the error the client must show.
      // Round 6 (c40 T1, 28 Sep 2026): a 3-day plan took longer than the fixed 30 s and timed out on a
      // 61 s turn — and the route runs under Vercel's maxDuration (60 s), so a fixed budget could also be
      // cut by the platform. The budget is what the TURN has left before its deadline.
      const left = (opts.deadlineAt ?? Number.POSITIVE_INFINITY) - Date.now() - 2_000
      const budget = Math.min(opts.timeoutMs ?? PLAN_COMPLETION_TIMEOUT_MS, left)
      if (!failed && !hasCompletePlan(text) && opts.deadlineAt !== undefined && left < MIN_COMPLETION_MS) {
        log({ type: 'tappyai_plan_completion', outcome: 'no_time', ms: 0, streamedChars: text.length, leftMs: Math.max(0, Math.round(left)) })
      } else if (!failed && !hasCompletePlan(text)) {
        const t0 = Date.now()
        let outcome = 'no_block'
        try {
          const answer = await Promise.race([
            opts.complete(text),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), budget)),
          ])
          const block = extractPlanBlock(answer)
          if (block) {
            controller.enqueue(encoder.encode(`0:${JSON.stringify(`\n\n${block}\n`)}\n`))
            outcome = 'appended'
          }
        } catch (e) {
          outcome = e instanceof Error && e.message === 'timeout' ? 'timeout' : 'error'
        }
        log({ type: 'tappyai_plan_completion', outcome, ms: Date.now() - t0, streamedChars: text.length })
      }
      for (const line of held) controller.enqueue(encoder.encode(line + '\n'))
    },
  })
  return body.pipeThrough(transform)
}
