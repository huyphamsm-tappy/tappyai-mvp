// i18n keys for voice input and read-aloud (chat, search, translate).
//
// These replace six hardcoded Vietnamese strings in ChatInterface.tsx, which meant an English-mode
// user hit a permission problem and was told about it in Vietnamese. Every string a user can see
// while speaking or listening belongs here.
//
// Written as recovery instructions rather than error codes: each one says what happened AND what to
// do next, because these fire at the moment the user is holding a microphone open and needs to know
// whether to retry, grant something, or give up.
export const vi: Record<string, string> = {
  // Availability
  'voice.unsupportedBrowser': 'Trình duyệt chưa hỗ trợ nhập bằng giọng nói. Hãy dùng Chrome hoặc Edge nhé.',
  'voice.languageUnsupported': 'Chưa hỗ trợ giọng nói cho ngôn ngữ này.',

  // Permission
  'voice.permissionDenied': 'Cần cấp quyền micro để nói. Hãy bật quyền cho trang rồi thử lại nhé.',
  'voice.permissionExplain': 'Tappy cần quyền micro để nghe bạn nói. Âm thanh chỉ dùng để chuyển thành chữ.',

  // Recognition outcomes
  'voice.noSpeech': 'Mình chưa nghe thấy gì — bấm micro và nói lại nhé.',
  'voice.audioCapture': 'Không tìm thấy micro trên thiết bị.',
  'voice.startFailed': 'Không khởi động được micro. Tải lại trang rồi thử lại nhé.',
  'voice.recognitionError': 'Có trục trặc khi nhận giọng nói, thử lại nhé.',

  // Live states
  'voice.listening': 'Đang nghe…',
  'voice.micHint': 'Bấm để nói',
  'voice.stopListening': 'Dừng nghe',
  'voice.sendingSoon': 'Sắp gửi — bấm để sửa lại',

  // Read aloud
  'voice.readAloud': 'Đọc to',
  'voice.stopReading': 'Dừng đọc',
  // Nói về DỊCH VỤ, không nói về thiết bị: đường đọc-to chạy bằng giọng tổng hợp trên máy chủ và
  // KHÔNG hề tra danh sách giọng của thiết bị. Câu cũ ("Thiết bị chưa có giọng đọc cho {language}")
  // đổ lỗi cho máy người dùng vì một provider chưa được cấu hình — đo trên production 2026-08-23:
  // cả vi lẫn en đều trả 503. Đây chỉ là câu dự phòng khi máy chủ không gửi kèm lời giải thích.
  'voice.voiceUnavailable': 'Giọng đọc của Tappy hiện chưa sẵn sàng. Bạn vẫn đọc được nội dung bên trên.',
  // Khác với voiceUnavailable: đây là lỗi tạm thời, thử lại được.
  'voice.readAloudFailed': 'Chưa đọc được câu trả lời. Bạn thử lại giúp mình nhé.',

  // Voice screen (owner 01/10, mockup 03 «Voice / Chat Input Active»)
  'voice.overlay.title': 'Tôi đang lắng nghe...',
  'voice.overlay.titlePaused': 'Đã dừng nghe',
  'voice.overlay.subtitle': 'Hãy nói điều bạn cần, TappyAI luôn sẵn sàng hỗ trợ bạn!',
  'voice.overlay.subtitlePaused': 'Bấm micro để nói tiếp, hoặc Gửi nếu đã đủ.',
  'voice.overlay.example': 'Tìm cho tôi một quán cafe yên tĩnh có view đẹp ở Đà Lạt cuối tuần này',
  'voice.overlay.reason': 'Tappy chỉ bật micro khi bạn bấm. Trình duyệt chuyển giọng nói thành chữ; Tappy chỉ nhận phần chữ.',
  'voice.overlay.timeout': 'Mình tắt micro vì lâu quá chưa nghe thấy gì.',
  'voice.cancel': 'Hủy',
  'voice.send': 'Gửi',
  'voice.resume': 'Nói tiếp',
}

export const en: Record<string, string> = {
  // Availability
  'voice.unsupportedBrowser': 'This browser does not support voice input yet. Try Chrome or Edge.',
  'voice.languageUnsupported': 'Voice is not supported for this language yet.',

  // Permission
  'voice.permissionDenied': 'Microphone access is needed to speak. Allow it for this site and try again.',
  'voice.permissionExplain': 'Tappy needs your microphone to hear you. Audio is only used to turn speech into text.',

  // Recognition outcomes
  'voice.noSpeech': "I didn't catch anything — tap the mic and say it again.",
  'voice.audioCapture': 'No microphone was found on this device.',
  'voice.startFailed': "Couldn't start the microphone. Reload the page and try again.",
  'voice.recognitionError': 'Something went wrong hearing you. Please try again.',

  // Live states
  'voice.listening': 'Listening…',
  'voice.micHint': 'Tap to speak',
  'voice.stopListening': 'Stop listening',
  'voice.sendingSoon': 'Sending shortly — tap to edit',

  // Read aloud
  'voice.readAloud': 'Read aloud',
  'voice.stopReading': 'Stop reading',
  // Names the SERVICE, not the device — see the Vietnamese entry for the measurement behind this.
  'voice.voiceUnavailable': "Tappy's read-aloud voice is unavailable right now. You can still read the text above.",
  // Unlike voiceUnavailable, this one is temporary and worth retrying.
  'voice.readAloudFailed': "Couldn't read that answer aloud. Please try again.",

  // Voice screen (owner 01/10, mockup 03 «Voice / Chat Input Active»)
  'voice.overlay.title': "I'm listening...",
  'voice.overlay.titlePaused': 'Stopped listening',
  'voice.overlay.subtitle': 'Say what you need — TappyAI is ready to help!',
  'voice.overlay.subtitlePaused': 'Tap the mic to keep talking, or Send if that is enough.',
  'voice.overlay.example': 'Find me a quiet cafe with a nice view in Da Lat this weekend',
  'voice.overlay.reason': 'Tappy only turns the microphone on when you tap it. Your browser turns speech into text; Tappy only receives the text.',
  'voice.overlay.timeout': 'I turned the microphone off because I had not heard anything for a while.',
  'voice.cancel': 'Cancel',
  'voice.send': 'Send',
  'voice.resume': 'Keep talking',
}
