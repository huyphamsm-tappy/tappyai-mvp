// Vitest setup (app project): the suites run with CONSULTATIVE_V1 OFF unless they turn it on.
//
// The flag's production default became ON on 27 Sep 2026 (src/lib/config/product.ts). Every suite
// written before that asserted either the legacy path (with the flag unset) or the V1 path (with
// `vi.stubEnv('CONSULTATIVE_V1', '1')`). Pinning OFF here keeps each suite on the path it was written
// for; the V1 suites still switch it on themselves, and product.test.ts pins the new default.
// Set on process.env (not stubbed) so `vi.unstubAllEnvs()` restores to it.
if (process.env.CONSULTATIVE_V1 === undefined) process.env.CONSULTATIVE_V1 = '0'
// CONSULT_V2 (owner 2026-09-29, the consult brain) is pinned OFF the same way: suites written before
// it assert the single-model-call pipeline. The consult suites switch it on themselves.
if (process.env.CONSULT_V2 === undefined) process.env.CONSULT_V2 = '0'
