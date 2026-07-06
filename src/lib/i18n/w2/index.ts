// Wave-2 dictionary modules — one file per screen, merged here and layered on
// top of the base dictionaries by useTranslation. Each module exports flat
// `vi`/`en` maps whose keys are namespaced (reviews.*, profile.*, ...), so a
// plain object-spread merge is collision-free by construction.
import * as reviews from './reviews'
import * as reviewNew from './reviewNew'
import * as reviewDetail from './reviewDetail'
import * as profile from './profile'
import * as notifications from './notifications'
import * as music from './music'

const modules = [reviews, reviewNew, reviewDetail, profile, notifications, music]

export const w2vi: Record<string, string> = Object.assign({}, ...modules.map((m) => m.vi))
export const w2en: Record<string, string> = Object.assign({}, ...modules.map((m) => m.en))
