// CONSULT_V3 flag (owner 17/10/2026) — kept outside src/lib/ai/agent so tool modules (src/lib/ai/tools) can read it without importing the
// agent loop (agent/security.test.ts: "no provider/tool module imports the agent loop"). consultV3.ts re-exports it.
import { consultativeInAgentEnabled } from '@/lib/ai/consultative/consultativeAgentFlag'

export function consultV3Enabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.CONSULT_V3 ?? '').trim().toLowerCase()
  return (v === '1' || v === 'true' || v === 'on') && consultativeInAgentEnabled(env)
}
