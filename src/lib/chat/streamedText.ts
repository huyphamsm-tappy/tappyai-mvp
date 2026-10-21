// ── C2 P2 6.2 · text the user already saw while it streamed is kept exactly as received (F-3 (b), owner 19/10/2026) ───────────────────────────
//
// Measured in a real browser (C2 config 3, mock): a reply that streamed onto the screen from ~1.7 s was, when it finished,
//   · HIDDEN and re-typed from the start by the finish reveal (useFinishReveal restarts at 0): 497 visible characters dropped to 0 / 98; and
//   · REWRITTEN by the client's repeat cleaner (cleanRepeats) — on screen and in what is saved. On the 100 answers C delivered it changed 2,
//     both for the worse (a source line and an example sentence deleted, a stray "*" left), and caught no real repeat (c2/p2/f3-cleanrepeats.json).
// With NEXT_PUBLIC_C2_KEEP_STREAMED_TEXT=1 (build flag, default OFF) a reply whose text was on screen while it streamed — for at least
// STREAM_SHOWN_MIN_MS, so a reply that only arrives as one frame at the very end is NOT counted — gets neither: no rewrite, no re-reveal; the
// repeat guards stay on the server (gate second-copy stop, keepFirstCopy, stepRepeatGuard). Flag off → exactly the former behaviour.
//
// The decision is taken ONCE per reply, when it finishes, and never changes afterwards (measured: re-deciding on every render flipped a reply
// that arrived at the very end from "reveal" to "keep" ~250 ms into its reveal — the reveal stopped half-way and the text stayed cut off).

export const STREAM_SHOWN_MIN_MS = 250

export function keepStreamedTextOn(): boolean {
  return process.env.NEXT_PUBLIC_C2_KEEP_STREAMED_TEXT === '1'
}

/** When the reply with this id first had visible text while the chat was still receiving. */
export interface StreamShown { id: string; at: number }

/** The reply `id` had visible text on screen, while streaming, for at least STREAM_SHOWN_MIN_MS before `now`. */
export function shownWhileStreaming(shown: StreamShown | null, id: string | undefined, now: number): boolean {
  return !!shown && !!id && shown.id === id && now - shown.at >= STREAM_SHOWN_MIN_MS
}

/** Per chat: notes when the reply being received first shows text, and decides — once per reply, at its finish — whether to keep it as streamed. */
export class StreamedTextKeeper {
  private shown: StreamShown | null = null
  private decided: { id: string; keep: boolean } | null = null
  /** Called while receiving, whenever the reply `id` has visible text: only the FIRST time per reply counts. */
  noteShown(id: string, now: number): void {
    if (this.shown?.id !== id) this.shown = { id, at: now }
  }
  /** Keep reply `id` exactly as streamed? Flag off → false. The first call for a reply decides; every later call returns the same answer. */
  keep(id: string | undefined, now: number): boolean {
    if (!id || !keepStreamedTextOn()) return false
    if (this.decided?.id !== id) this.decided = { id, keep: shownWhileStreaming(this.shown, id, now) }
    return this.decided.keep
  }
}
