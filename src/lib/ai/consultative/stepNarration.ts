// R9 (Android 28/09, web + Android): the model's running commentary about its own steps reached the user —
// "Để lập kế hoạch chi tiết, mình cần tìm… Chờ một chút nhé! 🏖️ Bây giờ mình sẽ lập kế hoạch…", "Mình gọi
// tool để tìm khách sạn…", "Tuyệt vời! Mình đã tìm được…". A prompt rule did not stop it, so the sentences
// are removed by code on consult turns. Only sentences that are ABOUT the assistant's own searching /
// waiting / "now I will" are cut; a sentence that also carries content (a name in bold, a number) stays.

const NARRATION = new RegExp([
  '^(?:ok,?\\s*)?(?:mình\\s+)?(?:đang|sẽ|để mình|giờ mình|bây giờ mình(?: sẽ)?)\\s+(?:tìm|gọi|tra|kiểm tra|lập|lên|tổng hợp|xem)\\b',
  '^(?:(?:giờ|bây giờ)\\s+)?(?:mình\\s+)?(?:đang\\s+)?(?:gọi|dùng)\\s+(?:tool|công cụ|thông tin|dữ liệu|kết quả)',
  '^mình\\s+tìm\\s+(?:thêm\\s+)?(?:[^.!?]{0,60})\\s+cho bạn(?:\\s+(?:nhé|ngay))?[.!…]*$',
  '^(?:tuyệt vời|xong|được rồi|ok)[!.,]?\\s+(?:mình\\s+)?đã\\s+(?:tìm|có)\\s+(?:được\\s+)?(?:đủ\\s+)?(?:thông tin|kết quả|dữ liệu)',
  '^chờ\\s+(?:mình|một chút|chút|xíu|tí)',
  '^(?:mình\\s+)?đã\\s+(?:tìm|có)\\s+(?:được\\s+)?(?:đủ\\s+)?(?:thông tin|kết quả|dữ liệu)',
  '^để\\s+(?:lập|lên)\\s+kế hoạch(?:\\s+chi tiết)?,?\\s+mình\\s+(?:cần|sẽ)\\s+(?:tìm|tra|gọi)',
].join('|'), 'iu')

const hasContent = (s: string) => /\*\*[^*]+\*\*|\d/.test(s)

/** Removes step-narration sentences; returns the text unchanged when there is none. */
export function stripStepNarration(text: string): { text: string; removed: number } {
  let removed = 0
  const out = text.split('\n').map(line => {
    if (/^\s*\[/.test(line) || /^\s*[{"]/.test(line)) return line // machine blocks / plan JSON
    const parts = line.split(/(?<=[.!?…])\s+/)
    const kept = parts.filter(p => {
      const s = p.trim().replace(/^[-•*]\s*/, '').replace(/^[^\p{L}\p{N}*]+/u, '')
      if (!s || hasContent(s) || !NARRATION.test(s)) return true
      removed++
      return false
    })
    if (kept.length === parts.length) return line
    // An interjection left alone by the cut ("Tuyệt vời!", "Ok!") goes with it.
    const rest = kept.filter(p => !/^[\s\p{P}\p{S}]*(?:tuyệt vời|xong|được rồi|ok|oke|vâng|dạ)[\s\p{P}\p{S}]*$/iu.test(p))
    removed += kept.length - rest.length
    return rest.join(' ')
  })
  if (removed === 0) return { text, removed }
  return { text: out.join('\n').replace(/^[ \t]*[🏖️🔍⏳✨🗺️🙂😊]+[ \t]*$/gmu, '').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, ''), removed }
}
