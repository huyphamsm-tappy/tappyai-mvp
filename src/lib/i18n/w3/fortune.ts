// Wave-3 dictionary module — fortune-telling screens (/boi hub, tarot, tử vi,
// cung hoàng đạo). Flat vi/en maps namespaced under `fortune.` so a plain
// object-spread merge on top of the base dictionaries is collision-free.

export const vi: Record<string, string> = {
  // Hub (/boi)
  'fortune.headerTitle': 'Xem bói',
  'fortune.heroEyebrow': 'Xem bói online 🔮',
  'fortune.heroTitleLine1': 'Tò mò vận may',
  'fortune.heroTitleLine2': 'hôm nay của bạn?',
  'fortune.heroDesc': 'Tarot, tử vi 12 con giáp và cung hoàng đạo — chỉ mang tính giải trí, tham khảo cho vui.',
  'fortune.tarotTitle': 'Rút bài Tarot',
  'fortune.tarotDesc': 'Rút 1-3 lá từ bộ 78 lá bài Tarot, xem thông điệp dành cho bạn.',
  'fortune.tuviTitle': 'Tử vi 12 con giáp',
  'fortune.tuviDesc': 'Nhập ngày sinh để xem con giáp và luận giải vận hạn ngày/tuần/tháng.',
  'fortune.zodiacTitle': 'Cung hoàng đạo',
  'fortune.zodiacDesc': 'Nhập ngày sinh để biết cung của bạn, tính cách và vận may hiện tại.',

  // Sub-screen headers + shared disclaimer
  'fortune.tarotHeader': 'Tarot',
  'fortune.tuviHeader': 'Tử vi 12 con giáp',
  'fortune.zodiacHeader': 'Cung hoàng đạo',
  'fortune.disclaimer': 'Nội dung chỉ mang tính giải trí, tham khảo — không thay thế lời khuyên chuyên môn.',

  // Tarot draw
  'fortune.tarotDrawTitle': 'Rút bài Tarot',
  'fortune.tarotDrawHint': 'Tĩnh tâm một chút, nghĩ về câu hỏi của bạn rồi chọn số lá muốn rút.',
  'fortune.tarotOneCard': '1 lá · Thông điệp hôm nay',
  'fortune.tarotThreeCards': '3 lá · Quá khứ - Hiện tại - Tương lai',
  'fortune.tarotShuffling': 'Đang xáo bài...',
  'fortune.tarotDrawNow': 'Rút bài ngay',
  'fortune.tarotPast': 'Quá khứ',
  'fortune.tarotPresent': 'Hiện tại',
  'fortune.tarotFuture': 'Tương lai',
  'fortune.tarotReversed': 'Ngược (Reversed)',
  'fortune.tarotUpright': 'Xuôi (Upright)',
  'fortune.tarotRedraw': 'Rút lại',

  // Shared period tabs + reading labels
  'fortune.periodToday': 'Hôm nay',
  'fortune.periodThisWeek': 'Tuần này',
  'fortune.periodThisMonth': 'Tháng này',
  'fortune.love': 'Tình duyên',
  'fortune.career': 'Công việc',
  'fortune.careerLife': 'Sự nghiệp',
  'fortune.money': 'Tài lộc',
  'fortune.health': 'Sức khỏe',
  'fortune.note': 'Lưu ý',
  'fortune.luckyNumber': 'Số may mắn:',
  'fortune.luckyNumberShort': 'Số may:',
  'fortune.luckyColor': 'Màu hợp:',
  'fortune.redoWithOtherDate': 'Xem lại với ngày sinh khác',

  // Tử vi form + readings
  'fortune.tuviFormTitle': 'Xem tử vi 12 con giáp',
  'fortune.tuviFormHint': 'Nhập ngày sinh (dương lịch) để xem con giáp, tử vi trọn đời và vận hạn từng kỳ.',
  'fortune.tuviSubmit': 'Xem tử vi của tôi',
  'fortune.tuviAgeTitle': 'Tuổi {name} ({animal})',
  'fortune.tuviBornYear': 'Sinh năm {year} · Ngũ hành:',
  'fortune.orView': 'hoặc xem',
  'fortune.lifetimeTab': 'Trọn đời',
  'fortune.byYearTab': 'Theo năm',
  'fortune.lifetimeTitle': 'Tử vi trọn đời — Tuổi {animal}',
  'fortune.lifetimeAdvice': '✨ Lời khuyên trọn đời',
  'fortune.lifeStages': 'Luận giải theo giai đoạn',
  'fortune.pickYear': 'Chọn năm xem vận hạn:',
  'fortune.compatFallback': 'Tuổi {animal} — Năm {yearAnimal}',
  'fortune.yearOverview': '{period} — Tổng quan',
  'fortune.monthlyBreakdown': 'Luận giải từng tháng',
  'fortune.monthAbbrev': 'T{n}',

  // Cung hoàng đạo form
  'fortune.zodiacFormTitle': 'Tra cứu cung hoàng đạo',
  'fortune.zodiacFormHint': 'Nhập ngày sinh (dương lịch) để xem cung hoàng đạo và vận may của bạn.',
  'fortune.zodiacSubmit': 'Xem cung của tôi',
  'fortune.ruledBy': 'Cai quản:',
}

export const en: Record<string, string> = {
  // Hub (/boi)
  'fortune.headerTitle': 'Fortune Telling',
  'fortune.heroEyebrow': 'Online fortune telling 🔮',
  'fortune.heroTitleLine1': 'Wondering what today',
  'fortune.heroTitleLine2': 'has in store for you?',
  'fortune.heroDesc': 'Tarot, Chinese zodiac horoscope and star signs — just for fun, entertainment only.',
  'fortune.tarotTitle': 'Draw Tarot Cards',
  'fortune.tarotDesc': 'Draw 1-3 cards from the 78-card Tarot deck and see your message.',
  'fortune.tuviTitle': 'Chinese Zodiac Horoscope',
  'fortune.tuviDesc': 'Enter your birth date to find your zodiac animal and daily/weekly/monthly readings.',
  'fortune.zodiacTitle': 'Star Signs',
  'fortune.zodiacDesc': 'Enter your birth date to find your sign, personality traits and current luck.',

  // Sub-screen headers + shared disclaimer
  'fortune.tarotHeader': 'Tarot',
  'fortune.tuviHeader': 'Chinese Zodiac Horoscope',
  'fortune.zodiacHeader': 'Star Signs',
  'fortune.disclaimer': 'For entertainment purposes only — not a substitute for professional advice.',

  // Tarot draw
  'fortune.tarotDrawTitle': 'Draw Tarot Cards',
  'fortune.tarotDrawHint': 'Take a quiet moment, focus on your question, then choose how many cards to draw.',
  'fortune.tarotOneCard': "1 card · Today's message",
  'fortune.tarotThreeCards': '3 cards · Past - Present - Future',
  'fortune.tarotShuffling': 'Shuffling the deck...',
  'fortune.tarotDrawNow': 'Draw now',
  'fortune.tarotPast': 'Past',
  'fortune.tarotPresent': 'Present',
  'fortune.tarotFuture': 'Future',
  'fortune.tarotReversed': 'Reversed',
  'fortune.tarotUpright': 'Upright',
  'fortune.tarotRedraw': 'Draw again',

  // Shared period tabs + reading labels
  'fortune.periodToday': 'Today',
  'fortune.periodThisWeek': 'This week',
  'fortune.periodThisMonth': 'This month',
  'fortune.love': 'Love',
  'fortune.career': 'Work',
  'fortune.careerLife': 'Career',
  'fortune.money': 'Wealth',
  'fortune.health': 'Health',
  'fortune.note': 'Note',
  'fortune.luckyNumber': 'Lucky number:',
  'fortune.luckyNumberShort': 'Lucky no.:',
  'fortune.luckyColor': 'Lucky color:',
  'fortune.redoWithOtherDate': 'Try another birth date',

  // Tử vi form + readings
  'fortune.tuviFormTitle': 'Chinese Zodiac Reading',
  'fortune.tuviFormHint': 'Enter your birth date (Gregorian calendar) to see your zodiac animal, lifetime reading and periodic fortune.',
  'fortune.tuviSubmit': 'See my horoscope',
  'fortune.tuviAgeTitle': '{name} ({animal})',
  'fortune.tuviBornYear': 'Born in {year} · Element:',
  'fortune.orView': 'or view',
  'fortune.lifetimeTab': 'Lifetime',
  'fortune.byYearTab': 'By year',
  'fortune.lifetimeTitle': 'Lifetime horoscope — {animal}',
  'fortune.lifetimeAdvice': '✨ Lifetime advice',
  'fortune.lifeStages': 'Reading by life stage',
  'fortune.pickYear': 'Pick a year to view:',
  'fortune.compatFallback': '{animal} — Year of the {yearAnimal}',
  'fortune.yearOverview': '{period} — Overview',
  'fortune.monthlyBreakdown': 'Month-by-month reading',
  'fortune.monthAbbrev': 'M{n}',

  // Cung hoàng đạo form
  'fortune.zodiacFormTitle': 'Find Your Star Sign',
  'fortune.zodiacFormHint': 'Enter your birth date to see your zodiac sign and current fortune.',
  'fortune.zodiacSubmit': 'See my sign',
  'fortune.ruledBy': 'Ruled by:',
}
