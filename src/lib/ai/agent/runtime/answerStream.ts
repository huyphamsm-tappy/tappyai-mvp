// ── C2 P2 layer 3 · the runtime side of streaming the FINAL answer (C2_STREAM_DATASTREAM=1, default OFF) ──────────────────────────────────────
//
// Contract (owner 18/10): only the final answer streams — never reasoning, tool payloads, the [TAPPY_TASK] / [TAPPY_PLAN] markers or text of a
// lookup round — and text that left can never be changed afterwards. This gate stands between the model's raw deltas and the data stream:
//
//   · it releases COMPLETE LINES only (a line still arriving may yet turn out to be a marker, a tool-call line or a planning note);
//   · each line goes through exactly the LINE-LOCAL steps the final text goes through (taskFrame.ts: the [TAPPY_TASK] block, English planning
//     notes, end tokens, tool-call lines outside a ``` fence, foreign scripts) — so the released text is, line for line, what the final will hold;
//   · a [TAPPY_TASK] / [TAPPY_PLAN] block that spans lines, or any line opening one, holds everything after it until it closes;
//   · the two WHOLE-TEXT steps that could drop a part already released — `second_copy` (scrubDegenerate) and the split around a task line
//     (dedupeAroundTaskFrame) — run in their streaming form (`keepFirst`: the copy that streamed is kept) when this gate is active; and once
//     either pattern appears mid-stream the gate stops releasing (the rest goes out with the final text).
//
// The final text the runtime returns is then checked against what was released (`remainderAfter`): it must begin with it (whitespace runs may
// differ — the final is normalised); only the part after it is sent. If it does not (a step this gate does not mirror changed released text),
// NOTHING further is sent, the divergence is logged, and the caller marks the turn interrupted — the user is never shown text twice or a
// different version of text they already have.

import { alignReleasedPrefix } from '@/lib/ai/progressiveFlush'
import { dropMetaNotes, scrubDegenerate } from './taskFrame'

const OPEN_MARK = /\[\s*(TAPPY_TASK|TAPPY_PLAN)\s*\]/i
const BLOCK_ANY = /\[\s*(TAPPY_TASK|TAPPY_PLAN)\s*\][\s\S]*?\[\s*\/\s*\1\s*\]/gi
const STRAY = /\[\s*\/?\s*(?:TAPPY_TASK|TAPPY_PLAN)\s*\]/gi
// C2 P2 6.0 (F-1): a source marker — `[S#]` (planCitations) / `[N#]` (resolveNewsMarkers) — is rewritten after the run, and the rewrite also
// takes ONE whitespace character before it (`\s?\[S…\]`), i.e. the line break before a marker that opens a line. So: a line carrying a marker
// is never released (the gate stops: it and the rest go out with the final text), and a released line's own line break is held back until the
// NEXT line is released — a break followed by a marker line therefore never leaves (the final's rewritten whitespace goes out with the rest).
const SOURCE_MARK = /\[[SN]\d/

export class AnswerStreamGate {
  private pending = ''
  private releasedText = ''
  private stopped: string | null = null
  private inFence = false
  private headWords: string | null = null
  /** F-1: the line break(s) after the last released line — sent only in front of the next released line. */
  private heldBreak = ''

  /** `userText`: the user's message — the same stray-script rule as the final text (scrubDegenerate), so a streamed line and the settle agree. */
  /**
   * `blockLine` (RETRIEVAL_V5, retrievalV5/toolSyntax.ts): a line it matches (a tool call written as text) is never released — the gate stops
   * before it, outside ``` fences only. Absent = unchanged.
   */
  constructor(private readonly emit: (text: string) => void, private readonly lang: string, private readonly userText = '', private readonly blockLine?: (line: string) => boolean) {}

  /** What has been released to the data stream so far. */
  released(): string { return this.releasedText }
  /** Why the gate stopped releasing (null = still streaming). */
  stopReason(): string | null { return this.stopped }
  stop(reason: string): void { if (!this.stopped) this.stopped = reason }

  /** A raw model delta of the final round. */
  push(delta: string): void {
    if (this.stopped || !delta) return
    this.pending += delta
    this.drain()
    this.releaseHeldBreak()
  }

  /**
   * 6.0 latency follow-up (owner 19/10): the held line break leaves as soon as the NEXT line has started and is known not to open with a source
   * marker — its first character is not "[", or its first three are "[" + something other than `[S#` / `[N#` — instead of waiting for that whole
   * line. A break before a marker line is still never sent (planCitations / resolveNewsMarkers rewrite it).
   */
  private releaseHeldBreak(): void {
    if (this.stopped || !this.heldBreak || !this.pending) return
    if (this.pending[0] === '[' && (this.pending.length < 3 || /^\[[SN]\d/.test(this.pending))) return
    this.releasedText += this.heldBreak
    this.emit(this.heldBreak)
    this.heldBreak = ''
  }

  private drain(): void {
    for (;;) {
      if (this.stopped) return
      // an open marker block: wait for its close (or the end) before anything after it
      const open = OPEN_MARK.exec(this.pending)
      if (open) {
        const name = open[1].toUpperCase()
        const close = new RegExp(`\\[\\s*\\/\\s*${name}\\s*\\]`, 'i').exec(this.pending.slice(open.index))
        if (!close) {
          // release the complete lines BEFORE the marker, keep the rest
          const before = this.pending.slice(0, open.index)
          const cut = before.lastIndexOf('\n')
          if (cut >= 0) { this.releaseLines(before.slice(0, cut + 1)); this.pending = this.pending.slice(cut + 1) }
          return
        }
        // a task line AFTER released text = the "answer written twice around the line" shape: stop (the final keeps the streamed copy)
        if (name === 'TAPPY_TASK' && this.releasedText.trim()) { this.stop('task_line_after_text'); return }
        if (name === 'TAPPY_PLAN') { this.stop('plan_card'); return }
      }
      const nl = this.pending.indexOf('\n')
      if (nl < 0) return
      const line = this.pending.slice(0, nl + 1)
      this.pending = this.pending.slice(nl + 1)
      this.releaseLines(line)
    }
  }

  private releaseLines(chunk: string): void {
    for (const raw of chunk.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
      if (this.stopped) return
      // F-1: a line with a source marker is never released (nor the held break before it) — the gate stops
      if (SOURCE_MARK.test(raw)) { this.stop('source_marker'); return }
      // RETRIEVAL_V5: a tool call written as text is never shown — the gate stops before the line (the final text is cut / rewritten in loop.ts)
      if (this.blockLine && !this.inFence && !/^\s*```/.test(raw) && this.blockLine(raw)) { this.stop('tool_syntax'); return }
      const nl = raw.endsWith('\n') ? '\n' : ''
      let line = raw.replace(BLOCK_ANY, '').replace(STRAY, '')
      // ``` fences: inside one, a coding answer keeps its own get_…() lines (scrubDegenerate's own rule)
      const fence = /^\s*```/.test(line)
      if (!this.inFence && !fence) {
        const body = line.endsWith('\n') ? line.slice(0, -1) : line
        const kept = dropMetaNotes(scrubDegenerate(body, this.lang, { userText: this.userText }).text, this.lang).text
        // a line the steps emptied disappears; an empty line (paragraph break) stays
        line = kept ? kept + nl : body.trim() ? '' : nl
      }
      if (fence) this.inFence = !this.inFence
      if (!line) continue
      // F-1: a line break waits for the next released line (an empty line = a paragraph break joins the held breaks)
      const content = line.replace(/\n+$/, '')
      if (!content) { this.heldBreak += line; continue }
      const out = this.heldBreak + content
      // second copy: the opening 8 words of the answer appear again → stop (the final keeps the copy that streamed: scrubDegenerate keepFirst)
      const all = this.releasedText + out
      if (this.headWords === null) {
        const w = all.split(/\s+/).filter(Boolean)
        if (w.length >= 8) this.headWords = w.slice(0, 8).join(' ')
      }
      if (this.headWords) {
        const first = all.indexOf(this.headWords)
        if (first >= 0 && all.indexOf(this.headWords, first + this.headWords.length) >= 0) { this.stop('second_copy'); return }
      }
      this.releasedText += out
      this.heldBreak = line.slice(content.length)
      this.emit(out)
    }
  }
}

/**
 * The part of `final` still to send after `released` already left, or null when `final` does not begin with it (a divergence: the caller must
 * send nothing more and mark the turn). Whitespace runs may differ between the two (the final text is normalised).
 */
export function remainderAfter(final: string, released: string): string | null {
  if (!released.trim()) return final
  // align on the released text WITHOUT its trailing whitespace, then hand back the part of the final's whitespace run the client does not have
  // yet — so a paragraph break ("\n\n") after a released "…\n" is kept, not swallowed (the two parts would otherwise run together)
  const core = released.replace(/\s+$/, '')
  const sent = released.slice(core.length)
  const at = alignReleasedPrefix(final, core)
  if (at === null) return null
  const ws = /^\s*/.exec(final.slice(at))![0]
  // 6.0: exact when the client's trailing whitespace begins the final's (the usual case — the gate holds a line break back, so the client
  // often has none: the final's own whitespace, e.g. "\n [S3]" after a marker rewrite, is handed back as is). Otherwise the two runs differ in
  // form (the final is normalised: "dòng   " vs "\n\n") → counted in LINE BREAKS, never characters, so no paragraph break is swallowed.
  const breaks = (s: string) => (s.match(/\n/g) ?? []).length
  const missingWs = ws.startsWith(sent) ? ws.slice(sent.length) : '\n'.repeat(Math.max(0, breaks(ws) - breaks(sent)))
  return missingWs + final.slice(at + ws.length)
}
