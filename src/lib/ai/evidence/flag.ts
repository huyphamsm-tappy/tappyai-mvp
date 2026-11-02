// CONSULT_LUNA_ONE (default OFF): Tappy Consultative "một Luna" G1 — the evidence store, claim binding / correction / citation and the strict
// model-name check. Read per request; off keeps every existing behaviour byte for byte. It only acts on CONSULTATIVE_IN_AGENT turns.
export function consultLunaOneEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.CONSULT_LUNA_ONE ?? '').trim().toLowerCase()
  return v === '1' || v === 'on' || v === 'true'
}
