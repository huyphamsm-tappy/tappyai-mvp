// Wave-5 dictionary — the screens the release-readiness UAT found still rendering Vietnamese to an
// English session (C15, C43, C17), plus the Account screen (C14/C15).
//
// Same contract as w2/w3/w4: flat namespaced maps, merged by useTranslation.
//
// 🔑 These are all screens the previous wave did not reach, not regressions of it. The twelve
// screens w4 sealed were re-verified clean in EN during the same UAT.
import * as account from './account'
import * as profileLists from './profileLists'
import * as group from './group'

const modules = [account, profileLists, group]

export const w5vi: Record<string, string> = Object.assign({}, ...modules.map((m) => m.vi))
export const w5en: Record<string, string> = Object.assign({}, ...modules.map((m) => m.en))
