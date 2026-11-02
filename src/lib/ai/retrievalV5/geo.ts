// RETRIEVAL_V5 lần 2c (B1, owner 20/10): the geographic context of a lookup — general rules, no per-question list.
//   · the question names a place (the understanding's `place` entities, or a Vietnamese province / city in the text) → that place;
//   · it names none, yet needs current facts (prices, rates, procedures, schedules…) → the user's own context: Việt Nam (Tappy's users);
//   · a place without Vietnamese letters and not a Vietnamese province is foreign (Berlin, Boston, Melbourne) — never re-aimed at Việt Nam.
// The REPLY LANGUAGE is independent of this: an English question about Vietnamese loan rates is answered in English (geography never picks
// the language). Measured (Cổng 2 lần 2, u29): "Best small-business loan rates today?" — no place; the model searched "…SBA 7(a) rates US".
import { provinceOf } from '@/lib/ai/tools/placeGeoGuard'

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
/** Letters only Vietnamese writes: ă â đ ê ô ơ ư and the hook-above / dot-below vowels (precomposed, NFC). */
const VIET_LETTERS = /[ăâđêôơưĂÂĐÊÔƠƯạảẹẻịỉọỏụủỵỷấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữựẠẢẸẺỊỈỌỎỤỦỴỶẤẦẨẪẬẮẰẲẴẶẾỀỂỄỆỐỒỔỖỘỚỜỞỠỢỨỪỬỮỰ]/
const VIETNAM = /\bviet ?nam\b/

export interface GeoUnderstanding { needs_fresh_data: boolean; entities: ReadonlyArray<{ name: string; type: string }> }
export interface GeoContext {
  /** No place named and current facts needed: the lookup is aimed at Việt Nam and the answer says so once. */
  defaultVietnam: boolean
  /** The lookup is about Việt Nam (named, or by default). */
  vietnam: boolean
  /** A place outside Việt Nam is named. */
  foreign: boolean
}

const isVietnamesePlace = (name: string) => !!provinceOf(name) || VIETNAM.test(fold(name)) || VIET_LETTERS.test(name.normalize('NFC'))

/** The geographic context of a question. Without an understanding (failed / late): nothing is assumed. Pure. */
export function geoContext(userText: string, u: GeoUnderstanding | null): GeoContext {
  const none: GeoContext = { defaultVietnam: false, vietnam: false, foreign: false }
  if (!u) return none
  const places = u.entities.filter(e => e.type === 'place').map(e => e.name)
  const foreign = places.some(p => !isVietnamesePlace(p))
  const namedVietnam = !!provinceOf(userText) || VIETNAM.test(fold(userText)) || places.some(isVietnamesePlace)
  const defaultVietnam = u.needs_fresh_data === true && places.length === 0 && !namedVietnam
  return { defaultVietnam, vietnam: !foreign && (namedVietnam || defaultVietnam), foreign }
}

/** A missing point about a procedure / regulation / required papers / fees (Vietnamese or English). */
export const PROCEDURAL = /thủ tục|hồ sơ|giấy tờ|quy định|lệ phí|điều kiện|nghị định|thông tư|văn bản|đăng ký|cấp đổi|procedure|document|paperwork|requirement|regulation|eligib|fee\b|application form/i
