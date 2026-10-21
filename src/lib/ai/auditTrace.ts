// ── AUDIT-ONLY structured trace of one chat turn (Round 20) ───────────────────────────────────────────────────────────────────────
//
// Purpose: show WHERE a reply is duplicated or cut — in what the model wrote (per step), in what the guards changed, in what the server
// streamed, or in what the client rendered (compare with the saved message). One JSON line per event: timestamp, process-wide sequence
// number, event name, kind (delta | snapshot | tool_call | tool_result | guard | compose | final), round / step numbers, and the payload with
// secrets, e-mail addresses, phone numbers and long digit runs masked.
//
// OFF unless BOTH hold: TAPPY_AUDIT_TRACE=1 AND the server is wired to the AUDIT Supabase project (a production URL, or no URL, keeps it off).
// Never set on Vercel / production; the UAT launcher sets it for port 3018 only and a later restart without it turns it off.
// Observation only: it never changes a reply, and it logs nothing when off.

import { cutSecrets } from './agent/guards'

const AUDIT_REF = 'zdaprdfgpbpnxyofagmc'
const PROD_REF = 'fwznnobrdctuskgrvuik'

export function auditTraceOn(env: Record<string, string | undefined> = process.env): boolean {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  return env.TAPPY_AUDIT_TRACE === '1' && url.includes(AUDIT_REF) && !url.includes(PROD_REF)
}

/** Masks secrets, e-mail addresses, phone numbers and long digit runs. */
export function maskForTrace(s: string): string {
  return cutSecrets(s).text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\d{10,}/g, '[num]')
    .replace(/(?<![\d.,])(?:\+?84|0)[\d\s.-]{8,12}\d(?![\d.,])/g, '[phone]')
}

export type AuditKind = 'delta' | 'snapshot' | 'tool_call' | 'tool_result' | 'guard' | 'compose' | 'final'

let seq = 0

export function auditTrace(ev: string, kind: AuditKind, fields: Record<string, unknown> = {}): void {
  if (!auditTraceOn()) return
  try {
    const out: Record<string, unknown> = { type: 'tappyai_audit_trace', ts: new Date().toISOString(), seq: ++seq, ev, kind }
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === 'string') { out[k] = maskForTrace(v); out[`${k}_len`] = v.length }
      else if (Array.isArray(v)) out[k] = v.map(x => (typeof x === 'string' ? maskForTrace(x) : x))
      else out[k] = v
    }
    console.log(JSON.stringify(out))
  } catch { /* diagnostics only */ }
}
