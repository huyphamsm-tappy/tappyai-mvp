// C2 P2 (owner contract 18/10): a suite written for the DEFAULT behaviour keeps testing the default even when a run sets the C2 latency flags
// globally (the "all flags on" suite configuration). Call once at the top of such a file: every C2_* flag is removed before each test and put
// back after it. Setup only — no assertion of the calling suite changes. The flag-ON behaviour has its own suites (c2*.test.ts).
import { beforeEach, afterEach } from 'vitest'

export const C2_FLAGS = [
  'C2_TOOL_GATE', 'C2_ROUND_CAP', 'C2_BATCH_NOTE', 'C2_LENGTH_RECOVERY', 'C2_PROGRESS', 'C2_TOOL_ROUND_EFFORT', 'C2_SOFT_BUDGET_MS',
  'C2_REASONING_HEADROOM_TOKENS', 'C2_REQUEST_BUDGET', 'C2_STREAM_ADAPTER', 'C2_STREAM_DATASTREAM', 'C2_SAFEFLUSH', 'C2_AGENT_STREAM',
] as const

export function c2FlagsOff(): void {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => { for (const k of C2_FLAGS) { saved[k] = process.env[k]; delete process.env[k] } })
  afterEach(() => { for (const k of C2_FLAGS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
}
