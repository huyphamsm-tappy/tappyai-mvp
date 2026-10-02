// «Còn N lựa chọn nữa — bạn muốn xem thêm không?» points at the cards behind «Xem thêm N chỗ». A message with NO place card (a reloaded
// thread: the card annotation is not stored; a shopping answer: every product is already a card) must not show it — it would offer options
// that are not there (A3, owner 2026-10-02). The server already sends the line only under a card; this is the client's matching rule for
// everything saved before, and for a card that did not survive a reload.
const VI = /^[ \t]*(?:Mình\s+)?[Cc]òn(?:\s+khoảng)?\s+\d+\s+lựa chọn[^\n]*(?:\n|$)/gm
const EN = /^[ \t]*I have \d+ more option[^\n]*(?:\n|$)/gm

export function stripRemainingFooter(text: string): string {
  if (!text || (text.indexOf('lựa chọn') === -1 && text.indexOf('more option') === -1)) return text
  return text.replace(VI, '').replace(EN, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
}
