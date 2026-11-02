// CONSULT_V3 (owner 17/10): does an assistant reply carry place facts (a rating, a distance, opening hours, reviews)? Then the next turn may be
// a follow-up about those places ("chỗ đầu tiên có chỗ đậu xe máy không?"), and the place-claim guard keeps running on it
// (streamEnrichment placeGuardOn). Kept in src/lib: classifier words are not UI copy. Pure.
export function mentionsPlaceFacts(reply: string): boolean {
  return /⭐|\d+(?:[.,]\d+)?\s?km\b|đánh giá|mở (?:cửa )?(?:đến|tới|từ)|\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}/i.test(reply)
}
