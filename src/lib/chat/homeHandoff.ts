// 15/11 (owner: "thanh chat ở trang chủ không có dấu cộng để chọn nghiên cứu sâu và chèn ảnh, tệp như trong mục chat"): the home page's box does not answer in place, it OPENS the chat with the question. A picture
// or a file cannot travel in an address, so what the person chose on the home page (the files, Deep Research) is handed to the chat page here, in memory, across the in-app navigation, and taken once.
// A page reload or a link opened in a new tab carries nothing: then the chat simply opens with the question, as it always did. Client side only; nothing is stored or sent anywhere.
export type HandoffMode = 'auto' | 'deep'
export interface HomeHandoff { files: File[]; mode: HandoffMode }

let pending: HomeHandoff | null = null

/** Leave the files and the mode for the chat page that opens next. An empty hand-off (no file, the default mode) leaves nothing. */
export function setHomeHandoff(h: HomeHandoff): void {
  pending = h.files.length || h.mode !== 'auto' ? { files: [...h.files], mode: h.mode } : null
}

/** What the home page left, once: the next call returns null. */
export function takeHomeHandoff(): HomeHandoff | null {
  const h = pending
  pending = null
  return h
}
