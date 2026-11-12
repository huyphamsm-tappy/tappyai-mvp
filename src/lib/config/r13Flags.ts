// R13 wiring flags (11/11): three pure parts of the architecture, each behind its OWN flag. Every one is OFF unless the value is exactly "1" and is locked in a production runtime
// unless the owner lists its name in CONSULT_PRODUCTION_ALLOW (the same rule as every consult flag: deepResearchState.ts). OFF is the chat route byte for byte as it was.

import { lockedInProduction } from '@/lib/config/consultFlags'

type Env = Record<string, string | undefined>

export const ATTACHMENT_ONLY_POLICY_FLAG = 'ATTACHMENT_ONLY_POLICY'
/** Pure. R13 §3.2.3: a message that is only an attachment gets the server-owned task DESCRIBE_OR_SUMMARIZE_ATTACHMENT with no tools. */
export const attachmentOnlyPolicyOn = (env: Env = process.env): boolean => env[ATTACHMENT_ONLY_POLICY_FLAG] === '1' && !lockedInProduction(env, ATTACHMENT_ONLY_POLICY_FLAG)

export const MARKET_GATE_FLAG = 'MARKET_GATE'
/** Pure. R13 §5.5: every market-bound tool is judged by evaluateGate (market, vertical, capability, action) before it runs; fails closed. */
export const marketGateOn = (env: Env = process.env): boolean => env[MARKET_GATE_FLAG] === '1' && !lockedInProduction(env, MARKET_GATE_FLAG)

export const HOTLINE_CLAIM_GUARD_FLAG = 'HOTLINE_CLAIM_GUARD'
/** Pure. R13 §10.5 / owner's hotline list: the final answer loses a cost or hours claim about 113, 114 or 115 (not verified); 111 and 112 are verified and untouched. */
export const hotlineClaimGuardOn = (env: Env = process.env): boolean => env[HOTLINE_CLAIM_GUARD_FLAG] === '1' && !lockedInProduction(env, HOTLINE_CLAIM_GUARD_FLAG)

export const SAFETY_EMERGENCY_FLAG = 'SAFETY_EMERGENCY'
/** Pure. R13 §10.5: a clear emergency statement is answered with the safety payload (verified hotline cards or immediate guidance) and no tool runs. */
export const safetyEmergencyOn = (env: Env = process.env): boolean => env[SAFETY_EMERGENCY_FLAG] === '1' && !lockedInProduction(env, SAFETY_EMERGENCY_FLAG)
