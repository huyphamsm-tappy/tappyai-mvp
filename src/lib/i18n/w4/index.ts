// Wave-4 dictionary modules — B07.
//
// Merged and layered over the base dictionary by useTranslation, same contract as ../w2 and ../w3.
// Namespaced keys keep the merge collision-free.
//
// This wave exists because the final UAT found whole screens rendering Vietnamese to English
// sessions — the paywall, Preferences, "What Tappy knows", App connections, Recommendations and
// the first-run chat quiz. Vietnamese was complete throughout; English was the unfinished locale.
import * as subscription from './subscription'
import * as memory from './memory'
import * as misc from './misc'

const modules = [subscription, memory, misc]

export const w4vi: Record<string, string> = Object.assign({}, ...modules.map((m) => m.vi))
export const w4en: Record<string, string> = Object.assign({}, ...modules.map((m) => m.en))
