// Wave-6 dictionary — V3 User Data Foundation.
//
// The 18+ eligibility flow (/age-check) and the private demographic +
// professional profile fields. Same contract as w2/w3/w4/w5: flat namespaced
// maps, merged by useTranslation.
import * as age from './age'

const modules = [age]

export const w6vi: Record<string, string> = Object.assign({}, ...modules.map((m) => m.vi))
export const w6en: Record<string, string> = Object.assign({}, ...modules.map((m) => m.en))
