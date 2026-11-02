// ── Running cost of a testing session (owner 02/11: "bộ đếm chi phí cộng dồn khi UAT") ───────────────────────────────────────────────
//
// Outside production the server prints one readable line per turn: this turn's price, split into search and model, and the running total of
// the process since it started (dollars, Serper credits, turns). It reads the cost info the server already builds for `tappyai_turn_cost`;
// it changes no turn, stores nothing, and is silent in a production runtime. A failing logger never reaches the answer.
import { serperUsdPerCredit, type TurnCostInfo } from '@/lib/ai/turnCost'
import { isProductionRuntime } from '@/lib/config/consultFlags'

type Env = Record<string, string | undefined>
export interface SessionCost { turns: number; usd: number; searchUsd: number }
export const createSessionCost = (): SessionCost => ({ turns: 0, usd: 0, searchUsd: 0 })

const money = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

/** Adds the turn to `state` and returns the line to print. Pure apart from `state`. */
export function sessionCostLine(state: SessionCost, i: TurnCostInfo, env: Env = process.env): string {
  const usd = money(i.usd)
  const search = money(i.serperUsd)
  const model = typeof i.answerUsd === 'number' && Number.isFinite(i.answerUsd) ? money(i.answerUsd) : Math.max(0, usd - search)
  state.turns += 1
  state.usd += usd
  state.searchUsd += search
  const perCredit = serperUsdPerCredit(env)
  const credits = perCredit > 0 ? Math.round(state.searchUsd / perCredit) : 0
  return `[tappy-cost] turn ${usd.toFixed(4)} USD (search ${search.toFixed(4)}, model ${model.toFixed(4)}, ${i.turnType}) | session ${state.turns} turns ${state.usd.toFixed(4)} USD, ~${credits} Serper credits`
}

const processTotal = createSessionCost()

/** The hook the turn's cost stream calls: nothing in a production runtime; never throws. */
export function logSessionCost(i: TurnCostInfo, o: { env?: Env; log?: (line: string) => void; state?: SessionCost } = {}): void {
  try {
    const env = o.env ?? process.env
    if (isProductionRuntime(env)) return
    ;(o.log ?? ((line: string) => console.log(line)))(sessionCostLine(o.state ?? processTotal, i, env))
  } catch { /* the counter never breaks a turn */ }
}
