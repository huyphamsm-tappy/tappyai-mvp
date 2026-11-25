// Vexere DIRECT affiliate programme (12/11/2026), behind its own flag. OFF unless the value is exactly "1" and locked in a production runtime
// unless the owner lists the name in CONSULT_PRODUCTION_ALLOW (same rule as r13Flags.ts). OFF = every Vexere link is exactly what it was
// (Accesstrade deep link through /go/at, or the direct page).
//
// This is the ONE place that holds the programme's identifiers. They are PUBLIC affiliate identifiers: Vexere gave them to the owner on 12/11/2026
// ("AID to put in backlinks: 380"; direct link https://vexere.com/?utm_source=affiliate&utm_campaign=380&utm_medium=aff_link&aid=380). They are not secrets.
// Never add the owner's personal name (the `cname` of Vexere's widget URL) here or in any URL, log or code.
//
// COLLISION: the Accesstrade landing for Vexere also carries a parameter called `aid` (with a different id) plus `aff_sid`. A link must carry ONE programme,
// never both, so with this flag ON Vexere is never wrapped in the Accesstrade deep link (see ccp/registry/runtime.ts and ccp/tracking/vexereDirect.ts).

import { lockedInProduction } from '@/lib/config/consultFlags'

type Env = Record<string, string | undefined>

export const VEXERE_DIRECT_AFFILIATE_FLAG = 'VEXERE_DIRECT_AFFILIATE'
/** Pure. ON only for the exact value "1", and never in a production runtime the owner has not opened for it. */
export const vexereDirectAffiliateOn = (env: Env = process.env): boolean => env[VEXERE_DIRECT_AFFILIATE_FLAG] === '1' && !lockedInProduction(env, VEXERE_DIRECT_AFFILIATE_FLAG)

/** Public affiliate id Vexere issued to the owner on 12/11/2026. */
export const VEXERE_DIRECT_AID = '380'

/** The exact parameters the direct programme wants on every outbound Vexere link, in Vexere's own order. */
export const VEXERE_DIRECT_PARAMS: ReadonlyArray<readonly [string, string]> = [
  ['utm_source', 'affiliate'],
  ['utm_campaign', VEXERE_DIRECT_AID],
  ['utm_medium', 'aff_link'],
  ['aid', VEXERE_DIRECT_AID],
]

/** Vexere's flight landing page (public, opened 12/11/2026). The route pages need Vexere's own area ids, so only this front door is linked, never a composed route. */
export const VEXERE_FLIGHT_LANDING = 'https://vexere.com/vn/ve-may-bay.vi'
