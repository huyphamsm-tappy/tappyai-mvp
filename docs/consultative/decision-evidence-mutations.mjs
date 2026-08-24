// ADR-024 — every guarantee the Decision Evidence State claims must have a
// mutation that DIES. A guarantee nothing can break is a guarantee nobody has
// tested.
//
// Single-line anchors only: this tree's line endings are not uniform, and a
// multi-line "\n" anchor silently matches nothing and reports a false pass.
// Every anchor is uniqueness-checked before it is applied — an anchor found 0x
// or 2x is SKIPPED loudly rather than counted, because "SURVIVED" from a bad
// anchor is the failure mode that makes a whole mutation run meaningless.
//
// 🚨 SQL mutants run the REAL PostgreSQL boundary suite. They are slow (~5s
// each) and they are the ones that matter most: the ownership and expiry
// predicates ARE the security model, and a grant that looks right in a migration
// can still be wrong in the ACL that survives the platform defaults.
//
// Usage:  node docs/consultative/decision-evidence-mutations.mjs [ROOT]
// ROOT must be a worktree holding the COMMITTED tree — never the one you edit in.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = process.argv[2] || 'C:/wtdq'
const EV = ROOT + '/src/lib/ai/consultative/decisionEvidence.ts'
const ROUTE = ROOT + '/src/app/api/chat/route.ts'
const INPUT = ROOT + '/src/lib/ai/security/clientInput.ts'
const SQL = ROOT + '/supabase/migrations/20260824_decision_evidence_state.sql'

const UNIT = 'src/lib/ai/consultative/decisionEvidence.test.ts'
const ARCH = 'src/lib/ai/consultativeArchitecture.test.ts'
const DB = 'supabase/tests/decision_evidence_boundary.test.ts'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const FILES = [EV, ROUTE, INPUT, SQL]
const orig = Object.fromEntries(FILES.map(f => [f, readFileSync(f, 'utf8')]))

const M = [
  // ── 1. UNKNOWN markers — missing is not zero, not false, not absent ───────
  { f: EV, spec: UNIT, n: 'M01 a missing number becomes 0 instead of UNKNOWN',
    from: "const num = (v: unknown): Known<number> => (typeof v === 'number' && Number.isFinite(v) ? v : UNKNOWN)",
    to: "const num = (v: unknown): Known<number> => (typeof v === 'number' && Number.isFinite(v) ? v : 0)" },
  { f: EV, spec: UNIT, n: 'M02 drop the always-present warranty key (absence by omission)',
    from: '    warranty: UNKNOWN,', to: '' },
  { f: EV, spec: UNIT, n: 'M03 stop naming the unknown fields for the model',
    from: 'KHONG CO DU LIEU VE: ${unknowns.join(\', \')}.', to: '' },
  { f: EV, spec: UNIT, n: 'M04 report unknown capacities as 0GB rather than UNKNOWN',
    from: '  if (gb.length < 2) return { ramGb: UNKNOWN, storageGb: UNKNOWN }',
    to: '  if (gb.length < 2) return { ramGb: 0, storageGb: 0 }' },

  // ── 2. seller / domain / reputation are not evidence ──────────────────────
  { f: EV, spec: UNIT, n: 'M05 let the SELLER NAME supply the condition',
    from: '    condition: conditionFromTitle(c.name),',
    to: "    condition: conditionFromTitle(`${c.name} ${String(raw.source ?? '')}`)," },
  { f: EV, spec: UNIT, n: 'M06 let the LINK/domain supply the condition',
    from: '    chip: chipFromTitle(c.name),',
    to: "    chip: chipFromTitle(`${c.name} ${String(c.link ?? '')}`),\n    condition: conditionFromTitle(`${c.name} ${String(c.link ?? '')}`)," },
  { f: EV, spec: UNIT, n: 'M07 drop "dai ly chinh thuc" from the vocabulary',
    from: "  { re: /\\bdai ly chinh thuc\\b/, label: 'Đại lý chính thức' },", to: '' },
  { f: EV, spec: UNIT, n: 'M08 drop "bao hanh chinh hang" from the vocabulary',
    from: "  { re: /\\bbao hanh chinh hang\\b/, label: 'Bảo hành chính hãng' },", to: '' },
  { f: EV, spec: UNIT, n: 'M09 drop "chinh thuc" from the vocabulary',
    from: "  { re: /\\bchinh thuc\\b/, label: 'Chính thức' },", to: '' },
  { f: EV, spec: UNIT, n: 'M10 let "cu the" count as the condition "cu"',
    from: "  { re: /\\bcu\\b(?!\\s+the\\b)/, label: 'Cũ' },", to: "  { re: /\\bcu\\b/, label: 'Cũ' }," },

  // ── 3. M1 is not M1 Pro; a match must be proven ───────────────────────────
  { f: EV, spec: UNIT, n: 'M11 collapse M1 Pro into M1',
    from: '  const m = t.match(/\\bm(\\d)\\s*(pro max|max|pro|ultra)\\b/) || t.match(/\\bm(\\d)\\b/)',
    to: '  const m = t.match(/\\bm(\\d)\\b/)' },
  { f: EV, spec: UNIT, n: 'M12 treat an UNSTATED dimension as a match',
    from: '    if (got === UNKNOWN) { sawUnknown = true; continue }', to: '    if (got === UNKNOWN) continue' },
  { f: EV, spec: UNIT, n: 'M13 never report a mismatch',
    from: "    if (String(got).toLowerCase() !== String(want).toLowerCase()) return 'mismatch'", to: '' },
  { f: EV, spec: UNIT, n: 'M14 drop the configuration warning from the block',
    from: "      ? 'CANH BAO: tin dang nay KHAC cau hinh user hoi. PHAI NOI RO cho user biet diem khac, KHONG duoc trinh bay nhu dung y muon.'",
    to: "      ? ''" },

  // ── 4. exact values ───────────────────────────────────────────────────────
  { f: EV, spec: UNIT, n: 'M15 stop carrying the exact price',
    from: '    priceVnd: num(c.attrs.priceVnd),', to: '    priceVnd: UNKNOWN,' },
  { f: EV, spec: UNIT, n: 'M16 allow the price to be rounded to a band',
    from: '  if (pick.priceVnd !== UNKNOWN) out.push(`gia: ${pick.priceVnd} VND (con so chinh xac, KHONG lam tron sang "khoang")`)',
    to: '  if (pick.priceVnd !== UNKNOWN) out.push(`gia: khoang ${Math.round(Number(pick.priceVnd) / 1e6)} trieu`)' },
  { f: EV, spec: UNIT, n: 'M17 drop the "this is a PRODUCT rating, not Google Maps" label',
    from: '  if (pick.rating !== UNKNOWN) out.push(`danh gia san pham: ${pick.rating} (KHONG phai Google Maps)`)',
    to: '  if (pick.rating !== UNKNOWN) out.push(`danh gia: ${pick.rating}`)' },
  { f: EV, spec: UNIT, n: 'M18 stop computing real price deltas',
    from: '        ? ev.priceVnd - pickEv.priceVnd', to: '        ? UNKNOWN' },
  { f: EV, spec: UNIT, n: 'M19 empty the sayableFacts allow-list',
    from: "  const out: string[] = [`ten tin dang: ${pick.title}`]", to: '  const out: string[] = []; return out; const _dead: string[] = [' },

  // ── 5. no invented trade-off ──────────────────────────────────────────────
  { f: EV, spec: UNIT, n: 'M20 stop saying that no trade-off is established',
    from: "  - KHONG co diem nao hon duoc chung minh", to: '' },

  // ── 6. the follow-up must not answer from memory ──────────────────────────
  { f: EV, spec: UNIT, n: 'M21 drop the "do not recall from memory" instruction',
    from: "    ? 'Day la bang chung cua LUOT TRUOC, do he thong luu lai. Luot nay KHONG tim kiem lai. Moi con so ben duoi la SO THAT — dung dung nguyen van, TUYET DOI KHONG nho lai, KHONG uoc luong, KHONG lam tron.'",
    to: "    ? 'Day la bang chung cua luot truoc.'" },
  { f: EV, spec: UNIT, n: 'M22 make the fail-safe permissive instead of forbidding recall',
    from: '- TUYET DOI KHONG nho lai gia, danh gia, RAM, dung luong, chip, tinh trang hay ten shop tu tri nho.',
    to: '- Ban co the nho lai neu can.' },

  // ── 7. the route wiring ───────────────────────────────────────────────────
  { f: ROUTE, spec: UNIT, n: 'M23 stop persisting the evidence',
    from: "        await evidenceDb.rpc('decision_evidence_save', { p_id: evidenceId, p_evidence: evidence })", to: '' },
  { f: ROUTE, spec: UNIT, n: 'M24 stop injecting prior evidence into the follow-up',
    from: '    priorEvidence ? renderDecisionEvidenceBlock(priorEvidence, true) : \'\',', to: '' },
  { f: ROUTE, spec: UNIT, n: 'M25 disable the fail-safe on missing evidence',
    from: "    priorEvidenceMissing ? renderMissingEvidenceBlock() : '',", to: '' },
  { f: ROUTE, spec: ARCH, n: 'M26 stop returning the key to the client',
    from: "  finalResponse.headers.set('X-Decision-Evidence-Id', evidenceId)", to: '' },
  { f: ROUTE, spec: UNIT, n: 'M27 stop attaching the evidence block to the tool result',
    from: '            ...(evidenceBlock ? { _tappy_evidence: evidenceBlock } : {}),', to: '' },

  // ── 8. the client may contribute a key, never a fact ──────────────────────
  { f: INPUT, spec: UNIT, n: 'M28 accept any string as the evidence key',
    from: "  return typeof raw === 'string' && UUID_RE.test(raw) ? raw : null",
    to: "  return typeof raw === 'string' ? raw : null" },

  // ── 9. the security model, against a REAL PostgreSQL ──────────────────────
  { f: SQL, spec: DB, n: 'M29 drop the owner predicate from LOAD — the IDOR',
    from: '     AND owner_id = auth.uid()', to: '' },
  { f: SQL, spec: DB, n: 'M30 drop the expiry predicate from LOAD',
    from: '     AND expires_at > now();', to: ';' },
  { f: SQL, spec: DB, n: 'M31 let a second owner overwrite an existing row',
    from: '    WHERE public.decision_evidence.owner_id = auth.uid();', to: ';' },
  { f: SQL, spec: DB, n: 'M32 turn RLS off on the table',
    from: 'ALTER TABLE public.decision_evidence ENABLE ROW LEVEL SECURITY;', to: '' },
  { f: SQL, spec: DB, n: 'M33 grant EXECUTE on load to anon as well',
    from: 'GRANT EXECUTE ON FUNCTION public.decision_evidence_load(UUID) TO authenticated;',
    to: 'GRANT EXECUTE ON FUNCTION public.decision_evidence_load(UUID) TO authenticated, anon;' },
  { f: SQL, spec: DB, n: 'M34 leave the table readable (drop the REVOKE)',
    from: 'REVOKE ALL ON TABLE public.decision_evidence FROM PUBLIC, anon, authenticated;', to: '' },
  { f: SQL, spec: DB, n: 'M35 let an unauthenticated caller save',
    from: "    RAISE EXCEPTION 'not authenticated';", to: '    NULL;' },
  { f: SQL, spec: DB, n: 'M36 stop pruning to the caller latest 3',
    from: '        LIMIT 3', to: '        LIMIT 1000' },
  { f: SQL, spec: DB, n: 'M37 widen the TTL from 2 hours to a day',
    from: "  VALUES (p_id, auth.uid(), p_evidence, now() + interval '2 hours')",
    to: "  VALUES (p_id, auth.uid(), p_evidence, now() + interval '24 hours')" },
  { f: SQL, spec: DB, n: 'M38 make the prune global instead of caller-scoped',
    from: '   WHERE owner_id = auth.uid() AND expires_at <= now();', to: '   WHERE expires_at <= now();' },
]

let killed = 0, skipped = 0
const survivors = []
try {
  for (const m of M) {
    const o = orig[m.f]
    const n = o.split(m.from).length - 1
    if (n !== 1) { skipped++; console.log(`SKIP      ${m.n}\n          anchor found ${n}x — FIX THE ANCHOR`); continue }
    writeFileSync(m.f, o.replace(m.from, m.to))
    let failed = false
    try { execSync(`npx vitest run ${m.spec}`, { cwd: ROOT, stdio: 'pipe' }) } catch { failed = true }
    writeFileSync(m.f, o)
    if (failed) killed++; else survivors.push(m.n)
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.n}`)
  }
} finally {
  for (const [f, s] of Object.entries(orig)) writeFileSync(f, s)
  for (const [f, s] of Object.entries(orig)) {
    console.log(`restored ${f.split('/').pop().padEnd(34)} ${hash(readFileSync(f, 'utf8')) === hash(s) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  }
}
if (survivors.length) console.log(`\nSURVIVORS:\n${survivors.map(s => '  - ' + s).join('\n')}`)
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
