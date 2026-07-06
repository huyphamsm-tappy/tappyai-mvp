// Wave-3 dictionary modules — merged and layered over the base dictionary by
// useTranslation, same contract as ../w2. Namespaced keys keep the merge
// collision-free.
import * as fortune from './fortune'
import * as deals from './deals'
import * as game from './game'
import * as scan from './scan'
import * as translateScreen from './translate'
import * as currency from './currency'
import * as splitBill from './splitBill'
import * as vietContent from './vietContent'

const modules = [fortune, deals, game, scan, translateScreen, currency, splitBill, vietContent]

export const w3vi: Record<string, string> = Object.assign({}, ...modules.map((m) => m.vi))
export const w3en: Record<string, string> = Object.assign({}, ...modules.map((m) => m.en))
