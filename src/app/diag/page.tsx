'use client'

import { useEffect, useState } from 'react'
import { DIAG_KEY, type ClientErrorRecord } from '@/lib/diag/clientErrorRecord'

// ── TEMPORARY DIAGNOSTIC — remove with the P0 fix ───────────────────────────
//
// Reads back what ClientErrorDiag recorded in THIS tab, so the owner can screenshot the real
// exception from an iPhone where no console is reachable without a Mac.
//
// 🔒 Reads sessionStorage only: no network, no server, no storage of anyone else's data. A
// visitor sees their own tab's records or nothing at all, so there is nothing here to expose.
export default function DiagPage() {
  const [records, setRecords] = useState<ClientErrorRecord[] | null>(null)

  useEffect(() => {
    try {
      setRecords(JSON.parse(sessionStorage.getItem(DIAG_KEY) || '[]') as ClientErrorRecord[])
    } catch {
      setRecords([])
    }
  }, [])

  return (
    <div style={{ padding: 16, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, lineHeight: 1.45 }}>
      <h1 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Client error diagnostic</h1>
      <p style={{ marginBottom: 12, opacity: 0.7 }}>
        Temporary. Records stay in this tab only — nothing is sent anywhere.
      </p>

      {records === null && <p>Reading…</p>}
      {records !== null && records.length === 0 && (
        <p>
          No client error recorded in this tab yet. Reproduce the crash first, then come back to
          this page in the SAME tab (do not open a new one — the record lives in this tab).
        </p>
      )}

      {records?.map((r, i) => (
        <pre
          key={i}
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f5f5f5', color: '#111', padding: 10, borderRadius: 8, marginBottom: 10 }}
        >
{`#${i + 1}  ${r.kind}
at:         ${r.at}
pathname:   ${r.pathname}
authed:     ${r.authed}
visibility: ${r.visibility}
name:       ${r.name}
message:    ${r.message}

${r.stack}`}
        </pre>
      ))}

      {!!records?.length && (
        <button
          onClick={() => { try { sessionStorage.removeItem(DIAG_KEY) } catch {} ; setRecords([]) }}
          style={{ marginTop: 4, padding: '8px 14px', borderRadius: 8, border: '1px solid #ccc' }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
