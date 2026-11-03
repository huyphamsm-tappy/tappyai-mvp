// Chat resilience copy (A1, owner 2026-10-02): the per-message error boundary and the cut-stream notice.
export const vi: Record<string, string> = {
  'chat.messageBroken': 'Tin nhắn này chưa hiển thị được.',
  'chat.messageRetry': 'Thử lại',
  'chat.messageCopy': 'Sao chép',
  'chat.messageCopied': 'Đã sao chép',
  'chat.streamCut': 'Câu trả lời bị ngắt giữa chừng. Bạn thử lại nhé?',
  'chat.streamCutRetry': 'Trả lời lại',
  // C2 P2 layer 5: the server's turn status (tappy.turn_status.v1) — a line under the message, never part of the answer text
  'chat.turnIncomplete': 'Câu trả lời có thể chưa đầy đủ. Bạn hỏi tiếp để mình viết thêm nhé.',
  'chat.turnInterrupted': 'Câu trả lời bị gián đoạn giữa chừng. Phần trên là những gì đã nhận được — bạn có thể hỏi lại.',
}
export const en: Record<string, string> = {
  'chat.messageBroken': 'This message could not be shown.',
  'chat.messageRetry': 'Retry',
  'chat.messageCopy': 'Copy',
  'chat.messageCopied': 'Copied',
  'chat.streamCut': 'The answer was cut off half-way. Try again?',
  'chat.streamCutRetry': 'Answer again',
  'chat.turnIncomplete': 'This answer may be incomplete. Ask a follow-up and I will continue.',
  'chat.turnInterrupted': 'This answer was interrupted. What is above is what arrived — you can ask again.',
}
