// V3 dictionary — strings introduced by the Phase 4 structured-AI primitives.
//
// Kept as its own wave rather than folded into w5: w5 is a record of the screens one UAT found
// rendering Vietnamese to an English session, and that history is worth keeping legible. These
// strings belong to new components, not to a localisation gap.
//
// Same contract as w2/w3/w4/w5: flat namespaced maps, merged by useTranslation.
import * as structuredAi from './structuredAi'

const modules = [structuredAi]

export const v3vi: Record<string, string> = Object.assign({}, ...modules.map((m) => m.vi))
export const v3en: Record<string, string> = Object.assign({}, ...modules.map((m) => m.en))
