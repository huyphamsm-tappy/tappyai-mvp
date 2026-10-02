// ── /api/chat SPEND CAPS (A2, 2026-09-20) ────────────────────────────────────────────────────
//
// What one abusive caller could spend before this existed (measured cost $0.035 / place turn,
// model + Serper ≈ 4 credits): the only cap was 30 requests/min per IP, per instance, and a Pro
// account had NO daily cap at all — 30 × 60 × 24 = 43,200 turns/day ≈ $1,500 of model and
// ≈ 170k Serper credits, per instance, per account. Free accounts were bounded by the shared
// 15/day question pool and anonymous by the 5-lifetime trial, so the gap was Pro and the
// per-instance nature of the IP cap.
//
// Every number here is an env override with a default, so the owner can move a cap without a
// deploy of code (a redeploy of env is still Vercel's rule). All caps are enforced through
// `publicRateLimit` / `publicDailyRateLimit`: shared across instances when the KV store is
// configured, in-process otherwise (🚨 NOT PRODUCTION SAFE as a global cap — see kvCounter.ts).

function envInt(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env[name])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/** Burst cap per client IP, per minute (unchanged number; now shared across instances). */
export const CHAT_IP_BURST_PER_MINUTE = envInt('CHAT_IP_BURST_PER_MINUTE', 30)
/** Burst cap per signed-in account, per minute — the case the IP cap cannot see (one account, many IPs). */
export const CHAT_USER_BURST_PER_MINUTE = envInt('CHAT_USER_BURST_PER_MINUTE', 20)
/** Model turns per VN day for a Pro account (canned $0 turns excluded). Far above real use; bounds the worst day. */
export const PRO_DAILY_CHAT_CAP = envInt('PRO_DAILY_CHAT_CAP', 300)
