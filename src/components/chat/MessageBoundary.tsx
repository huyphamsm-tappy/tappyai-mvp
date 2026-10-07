'use client'

import { Component, type ReactNode } from 'react'

// ── One broken message must never blank the chat (A1, owner 2026-10-02) ─────────────────────────────────────────────
//
// An exception while rendering ONE assistant message (a card with an unexpected shape, a parser fed a half-streamed
// marker, a regex on odd text…) used to unmount the whole chat frame. Every message now renders inside this boundary: the
// failure is contained to its own row, which shows a small «this message could not be shown» placeholder with Retry (render
// again — the data may have changed since) and Copy (the raw text, so the answer is never lost). The boundary resets by
// itself when the message's `resetKey` changes (the next streamed chunk may well render).

export interface MessageBoundaryLabels { title: string; retry: string; copy: string; copied: string }

interface Props {
  /** Changes whenever the message content changes — a new value clears a caught error. */
  resetKey: string | number
  /** The raw text of the message, for Copy. */
  rawText: string
  labels: MessageBoundaryLabels
  /** Reporting hook (analytics / console). Never throws. */
  onError?: (error: Error) => void
  children: ReactNode
}
interface State { error: Error | null; copied: boolean; key: Props['resetKey'] }

export default class MessageBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> { return { error } }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // A new content value gets a fresh attempt; a failed one does not loop (the key only moves with the content).
    return props.resetKey !== state.key ? { key: props.resetKey, error: null, copied: false } : null
  }

  componentDidCatch(error: Error) {
    try { this.props.onError?.(error) } catch { /* reporting must never throw */ }
  }

  private copy = async () => {
    try {
      await navigator.clipboard.writeText(this.props.rawText)
      this.setState({ copied: true })
    } catch { /* clipboard unavailable — nothing more to do */ }
  }

  render() {
    if (!this.state.error) return this.props.children
    const { labels } = this.props
    return (
      <div role="alert" data-testid="message-boundary" className="flex gap-3">
        <div className="w-8 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="leading-relaxed">{labels.title}</p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600"
            >
              {labels.retry}
            </button>
            <button
              type="button"
              onClick={this.copy}
              className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/30"
            >
              {this.state.copied ? labels.copied : labels.copy}
            </button>
          </div>
        </div>
      </div>
    )
  }
}

/** Calls `render` during ITS OWN render, so an exception in the caller's parse/format code lands in the boundary above. */
export function Deferred({ render }: { render: () => ReactNode }): ReactNode {
  return render()
}
