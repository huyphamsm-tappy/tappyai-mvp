// The legal clock of a takedown request. Pure.
//
// Windows (as reported by the press on Vietnamese rules for online platforms; a lawyer must confirm the exact articles and whether they apply to Tappy):
//   standard_24h   a competent authority asked for removal: 24 hours from receipt;
//   emergency_6h   the authority marks it an emergency threatening national security: 6 hours;
//   complaint_48h  a well-founded complaint from a user: 48 hours.
// The clock starts when Tappy RECEIVED the request (received_at, set by the person recording it from the message's own timestamp), not when it was typed into the register.
export type TakedownUrgency = 'standard_24h' | 'emergency_6h' | 'complaint_48h'
export type TakedownStatus = 'received' | 'actioned' | 'rejected' | 'needs_info'

export const WINDOW_HOURS: Record<TakedownUrgency, number> = { standard_24h: 24, emergency_6h: 6, complaint_48h: 48 }
export const URGENCIES = Object.keys(WINDOW_HOURS) as TakedownUrgency[]

export const dueAt = (receivedAt: Date, urgency: TakedownUrgency): Date => new Date(receivedAt.getTime() + WINDOW_HOURS[urgency] * 3_600_000)

export type ClockState = 'closed' | 'ok' | 'at_risk' | 'overdue'

/** Open = received or waiting for information (the clock keeps running while information is awaited). At risk = half the window or more has gone. */
export function clockState(row: { status: TakedownStatus; received_at: string; due_at: string }, now: Date = new Date()): { state: ClockState; minutesLeft: number | null } {
  if (row.status === 'actioned' || row.status === 'rejected') return { state: 'closed', minutesLeft: null }
  const due = new Date(row.due_at).getTime()
  const start = new Date(row.received_at).getTime()
  const left = due - now.getTime()
  const minutesLeft = Math.floor(left / 60_000)
  if (left < 0) return { state: 'overdue', minutesLeft }
  return { state: left <= (due - start) / 2 ? 'at_risk' : 'ok', minutesLeft }
}
