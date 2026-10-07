// ── Weighted AI quota (owner 2026-09-29, §6 "Chuẩn bị (CHƯA bật)") ─────────────────────────────
// How many quota units a consult turn costs the user: re-asks and button taps are free, a consult
// answer costs 1, a detailed plan costs 3. PREPARED ONLY — nothing reads it until QUOTA_WEIGHTED=1
// is set deliberately (the owner decides when; the metering code keeps charging 1 per question).

export type QuotaTurn = 'ask' | 'pick' | 'followup' | 'compare' | 'more' | 'reject' | 'plan' | 'chat'

export const QUOTA_WEIGHTS: Record<QuotaTurn, number> = {
  ask: 0,      // Tappy asked — the user pays nothing for being asked
  followup: 0, // a question about a pick already given, answered from stored data
  more: 0,     // "Xem thêm" button — next stored candidates
  compare: 1,
  reject: 1,
  pick: 1,
  chat: 1,
  plan: 3,
}

export function quotaWeightedEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.QUOTA_WEIGHTED ?? '').trim() === '1'
}

/** Units this turn costs; 1 (today's behaviour) unless the weighted quota is enabled. */
export function quotaUnitsFor(turn: QuotaTurn | null | undefined, env: Record<string, string | undefined> = process.env): number {
  if (!quotaWeightedEnabled(env) || !turn) return 1
  return QUOTA_WEIGHTS[turn] ?? 1
}
