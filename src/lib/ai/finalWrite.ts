// ── Wave 4 (C-PRE-1): A TOOL LOOP THAT ENDED WITHOUT A WORD ────────────────────────────────────────────────────────────────────────────────────────────────
//
// Measured (B2, 27/10/2026, E10 / E21 / E25 at six steps): the model kept calling tools to the very last step - web_search in step 5 (answered by CONSULT_FINAL_SYNTHESIS's guard with
// "search_budget_used", the tool NOT run), read_page in step 6 (answered the same way) - so the loop ended with finishReason "tool-calls" and modelTextChars 0, and the user got the canned
// 123-character gap line. That guard only stops a tool from RUNNING; the tool is still offered in the last step, and ai@4.3.19 `streamText` has no per-step tool removal (no `prepareStep`).
//
// So the writing step is made structural, exactly like the plan completion (planCompletion.ts, UAT4 P1-f): the finish frame (`d:`) is held; when the turn streamed NO text at all, no error
// frame, and tool results exist, ONE extra model call - the same system prompt and conversation, this turn's tool results as plain text, NO tools declared - writes the answer, and it is
// streamed as ordinary text BEFORE the finish frame. Everything downstream (the evidence, price, hours, place guards, the enrichment) therefore treats it like any answer.
//
// Fail-open: an error, a timeout, no time left or an empty answer ships the turn exactly as the model left it. Writes nothing itself. At most one call. Inert when the text is not empty.
import { toolResultDigest } from './planCompletion'

export const FINAL_WRITE_TIMEOUT_MS = 30_000
/** Below this there is no point starting the call. */
export const MIN_FINAL_WRITE_MS = 8_000

export function finalWriteInstruction(lang: string): string {
  return lang === 'en'
    ? 'The tool loop ran out of steps before you wrote the answer. Using ONLY the tool results above (a result that says the search budget is used is not data), write the answer to the user NOW, in plain prose, with no tool call. Say plainly what you could not confirm; do not invent a figure, a source or a date.'
    : 'Vòng công cụ đã hết lượt mà bạn chưa viết câu trả lời. Chỉ dựa vào kết quả công cụ ở trên (kết quả báo đã hết lượt tìm không phải dữ liệu), hãy viết NGAY câu trả lời cho người dùng, bằng văn xuôi, không gọi thêm công cụ nào. Nói rõ điều gì chưa xác nhận được; không bịa số liệu, nguồn hay ngày.'
}

/**
 * Wave 4 fix G4: the final writing call's OWN instruction, appended to the system prompt of THAT call only (the turn's main system prompt is not touched). The main prompt may carry rules
 * that tell the model to call a tool (the research rule: "call read_page"); in this call no tool exists, so the note says the results are already here and that no tool is to be called,
 * named or promised. Measured risk (review G4, INFERRED): a model that obeys the main rule in a call without tools writes the tool call out as text.
 */
export function finalWriteSystemNote(lang: string): string {
  return lang === 'en'
    ? 'FINAL ANSWER STEP. The tool results of this turn are already in the conversation and no tool exists in this step: any instruction above to call a tool (search, read a page, calculate) does not apply now. Write the final answer to the user from those results. Do not call a tool, do not write a tool name or a tool call, and do not promise to look something up.'
    : 'BƯỚC VIẾT CÂU TRẢ LỜI CUỐI. Kết quả công cụ của lượt này đã có trong hội thoại và ở bước này không có công cụ nào: mọi chỉ dẫn gọi công cụ ở trên (tìm kiếm, đọc trang, tính toán) không áp dụng nữa. Hãy viết câu trả lời cuối cho người dùng từ các kết quả đó. Không gọi công cụ, không viết tên công cụ hay lời gọi công cụ, không hứa sẽ tra thêm.'
}

/** Pure. The system prompt of the final writing call: the turn's system prompt, unchanged, then the note. */
export function finalWriteSystem(system: string | undefined, lang: string): string {
  return `${system ?? ''}\n\n${finalWriteSystemNote(lang)}`
}

/** Pure. The finish frame with a "tool-calls" reason rewritten to "stop" (the turn now ends with text). Any other frame, or one that does not parse, is returned as it was. */
export function finishFrameAfterText(line: string): string {
  if (!line.startsWith('d:')) return line
  try {
    const o = JSON.parse(line.slice(2)) as Record<string, unknown>
    if (o.finishReason !== 'tool-calls') return line
    return `d:${JSON.stringify({ ...o, finishReason: 'stop' })}`
  } catch { return line }
}

export interface FinalWriteOptions {
  /** False → the stream passes through untouched (the caller does not even need to call this). */
  needed: boolean
  /** Makes the extra call; resolves to the model's answer, or null when there is nothing to write from (no tool results). */
  complete: () => Promise<string | null>
  timeoutMs?: number
  /** Epoch ms by which the whole turn must be done. */
  deadlineAt?: number
  log?: (event: Record<string, unknown>) => void
}

/** Pass an AI SDK data stream through, holding its finish frame(s); append the answer when the turn streamed no text but ran tools. */
export function finalWriteStream(body: ReadableStream<Uint8Array>, opts: FinalWriteOptions): ReadableStream<Uint8Array> {
  if (!opts.needed) return body
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const log = opts.log ?? ((e) => console.log(JSON.stringify(e)))
  let remainder = ''
  let text = ''
  let failed = false
  let toolResultFrames = 0
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
        if (line.startsWith('a:')) toolResultFrames++
        controller.enqueue(encoder.encode(line + '\n'))
      }
    },
    async flush(controller) {
      if (remainder) {
        if (remainder.startsWith('d:')) held.push(remainder)
        else controller.enqueue(encoder.encode(remainder + '\n'))
      }
      let appended = false
      // Structural condition only: no text at all, no error frame, at least one tool result. (No word of any answer is looked at.)
      if (!failed && text.trim() === '' && toolResultFrames > 0) {
        const left = (opts.deadlineAt ?? Number.POSITIVE_INFINITY) - Date.now() - 2_000
        if (opts.deadlineAt !== undefined && left < MIN_FINAL_WRITE_MS) {
          log({ type: 'tappyai_final_write', outcome: 'no_time', ms: 0, toolResults: toolResultFrames, leftMs: Math.max(0, Math.round(left)) })
        } else {
          const t0 = Date.now()
          let outcome = 'empty'
          try {
            const answer = await Promise.race([
              opts.complete(),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), Math.min(opts.timeoutMs ?? FINAL_WRITE_TIMEOUT_MS, left))),
            ])
            if (answer === null) outcome = 'no_results'
            else if (answer.trim() !== '') {
              controller.enqueue(encoder.encode(`0:${JSON.stringify(answer.trim())}\n`))
              appended = true
              outcome = 'appended'
            }
          } catch (e) {
            outcome = e instanceof Error && e.message === 'timeout' ? 'timeout' : 'error'
          }
          log({ type: 'tappyai_final_write', outcome, ms: Date.now() - t0, toolResults: toolResultFrames })
        }
      }
      for (const line of held) controller.enqueue(encoder.encode((appended ? finishFrameAfterText(line) : line) + '\n'))
    },
  })
  return body.pipeThrough(transform)
}

export { toolResultDigest }
