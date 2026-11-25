// Emergency answer copy (R13 §10.5, SAFETY_EMERGENCY). Plain words, no number here: every number on screen comes from VERIFIED_HOTLINES. Hours and "free" are never written in this copy; a card
// shows them only when its registry entry carries them (111 and 112 do; 113, 114 and 115 do not).
export const vi: Record<string, string> = {
  'safety.emergency.title': 'Đây có thể là tình huống khẩn cấp',
  'safety.emergency.cardsTitle': 'Số điện thoại khẩn cấp',
  'safety.emergency.guidance.unknownPlace': 'Nếu có người đang nguy hiểm, hãy gọi ngay số khẩn cấp của nơi bạn đang ở, hoặc nhờ người xung quanh gọi giúp. Giữ an toàn cho bản thân trước, và đưa người bị nạn ra chỗ an toàn nếu bạn làm được mà không gặp thêm nguy hiểm.',
  'safety.emergency.guidance.knownPlace': 'Hãy gọi ngay số bên dưới, hoặc nhờ người xung quanh gọi giúp. Giữ an toàn cho bản thân trước và làm theo hướng dẫn của người nghe máy.',
  'safety.emergency.askLocation': 'Bạn cho mình biết đang ở nước nào, tỉnh hoặc thành phố nào để mình hỗ trợ tiếp nhé.',
  'safety.emergency.cat.FIRE_RESCUE': 'Rời khỏi khu vực cháy ngay, không quay lại lấy đồ, không đi thang máy.',
  'safety.emergency.cat.MEDICAL': 'Đừng để người bị nạn ở một mình. Nếu có người biết sơ cứu ở gần, hãy nhờ họ giúp ngay.',
  'safety.emergency.cat.CHILD_PROTECTION': 'Nếu làm được một cách an toàn, hãy đưa trẻ ra khỏi nơi nguy hiểm. Đừng tự đối đầu với người gây hại.',
  'safety.emergency.cat.HUMAN_TRAFFICKING': 'Đừng đối đầu với người liên quan. Hãy ghi nhớ những gì bạn thấy (người, xe, địa điểm) và báo cho cơ quan chức năng ngay.',
  'safety.emergency.cat.POLICE': 'Hãy tìm chỗ an toàn, tránh đối đầu và báo ngay cho công an.',
  'safety.emergency.call': 'Gọi {number}',
  'safety.emergency.hours': 'Trực {hours}',
  'safety.emergency.free': 'Miễn phí',
}
/** Simplified Chinese, for the emergency chat text only (the web cards follow the UI locale). No number and no hours here: the only digits on screen come from the registry card. */
export const zh: Record<string, string> = {
  'safety.emergency.title': '这可能是紧急情况',
  'safety.emergency.cardsTitle': '紧急求助电话',
  'safety.emergency.guidance.unknownPlace': '如果有人处于危险中，请立即拨打您当前所在地的紧急电话，或请身边的人帮忙拨打。请先确保自己的安全；只有在不会让自己陷入更大危险的前提下，才把伤者转移到安全的地方。',
  'safety.emergency.guidance.knownPlace': '请立即拨打下面的电话，或请身边的人帮忙拨打。请先确保自己的安全，并按照接线员的指示去做。',
  'safety.emergency.askLocation': '请告诉我您在哪个国家、哪个省或城市，我可以继续帮您。',
  'safety.emergency.cat.FIRE_RESCUE': '请立即撤离火场，不要回去拿东西，不要乘电梯。',
  'safety.emergency.cat.MEDICAL': '不要让伤者独自一人。如果附近有人懂急救，请马上请他帮忙。',
  'safety.emergency.cat.CHILD_PROTECTION': '如果可以安全地做到，请把孩子带离危险的地方。不要自己与施害者正面冲突。',
  'safety.emergency.cat.HUMAN_TRAFFICKING': '不要与相关人员正面冲突。请记住您看到的人、车辆和地点，并立即报告当局。',
  'safety.emergency.cat.POLICE': '请尽快躲到安全的地方，避免正面冲突，并立即报警。',
  'safety.emergency.call': '拨打 {number}',
  'safety.emergency.hours': '值班时间 {hours}',
  'safety.emergency.free': '免费',
}
export const en: Record<string, string> = {
  'safety.emergency.title': 'This may be an emergency',
  'safety.emergency.cardsTitle': 'Emergency numbers',
  'safety.emergency.guidance.unknownPlace': 'If someone is in danger, call the emergency number of the place you are in right now, or ask someone nearby to call for you. Keep yourself safe first, and move the person to safety only if you can do it without more danger.',
  'safety.emergency.guidance.knownPlace': 'Call the number below now, or ask someone nearby to call for you. Keep yourself safe first and follow what the operator tells you.',
  'safety.emergency.askLocation': 'Tell me which country and which province or city you are in so I can help further.',
  'safety.emergency.cat.FIRE_RESCUE': 'Get out of the fire area now, do not go back for belongings, do not use the lift.',
  'safety.emergency.cat.MEDICAL': 'Do not leave the person alone. If someone nearby knows first aid, ask them to help right away.',
  'safety.emergency.cat.CHILD_PROTECTION': 'If you can do it safely, take the child out of danger. Do not confront the person causing harm yourself.',
  'safety.emergency.cat.HUMAN_TRAFFICKING': 'Do not confront the people involved. Remember what you see (people, vehicles, places) and tell the authorities right away.',
  'safety.emergency.cat.POLICE': 'Get to a safe place, avoid confrontation and call the police right away.',
  'safety.emergency.call': 'Call {number}',
  'safety.emergency.hours': 'Open {hours}',
  'safety.emergency.free': 'Free',
}
