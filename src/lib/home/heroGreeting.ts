// The Home hero greeting engine — THE canonical copy of the rules every client mirrors.
//
// Before this file the same engine lived three times: the Vietnamese pool inline in
// `src/app/(home)/page.tsx`, the English pool inline in `src/app/HomeView.tsx`, and a
// 1:1 Kotlin port in `android/.../home/HomeGreeting.kt` whose header says "keep the
// template pools byte-identical to the web files". Then the V3 Home shipped with a
// static "Hi {name}! 👋" and none of it. One module now; the surfaces only render.
//
// The contract, unchanged from production:
//  - 7 hour slots: [0,5) late night · [5,9) early morning · [9,11) mid-morning ·
//    [11,14) noon · [14,17) afternoon · [17,20) evening · [20,24) night.
//  - Several templates per slot — never one fixed greeting; [5,9) and [17,20) also
//    have weekend pools (Saturday and Sunday).
//  - Template choice = dayOfMonth % pool size: deterministic per day, so Web and
//    Android show the SAME greeting on the same day, and it rotates day to day.
//  - Every template is two lines. The web renders them as two heading lines,
//    Android as a `\n`.
//  - An hour outside 0–23 falls back to the early-morning slot (the `?? SLOTS[1]`
//    the production page always had).
//
// Time source is the caller's: the production page computes the Vietnam clock
// (UTC+7) on the server; Android reads the device clock. Nothing here touches
// `Date`, so it is pure, cheap, and identical on server and client.
//
// 🚨 Copy edits land in BOTH this file and `HomeGreeting.kt` in the same change —
// `heroGreeting.test.ts` reads the Kotlin file and fails when the pools differ.

export type HeroLocale = 'vi' | 'en'

/** A two-line greeting: [heading line, hook line]. */
export type HeroLines = readonly [string, string]

interface HeroSlot {
  /** Hour range, end-exclusive. */
  readonly range: readonly [number, number]
  readonly vi: readonly HeroLines[]
  readonly viWeekend?: readonly HeroLines[]
  readonly en: readonly HeroLines[]
  readonly enWeekend?: readonly HeroLines[]
}

export const HERO_SLOTS: readonly HeroSlot[] = [
  {
    range: [0, 5],
    vi: [
      ['Thức khuya à?', 'Tappy đây, cần gì không? 🌙'],
      ['Đêm muộn rồi —', 'nhưng Tappy vẫn sẵn sàng 🌛'],
      ['Còn thức à?', 'Đặt đồ ăn khuya hay cần gì? 🍜'],
    ],
    en: [
      ['Still up? 🌙', 'Tappy is here — need anything?'],
      ['Late night —', 'but Tappy is ready 🌛'],
    ],
  },
  {
    range: [5, 9],
    vi: [
      ['Chào buổi sáng!', 'Hôm nay ăn gì ngon đây? ☀️'],
      ['Ngày mới bắt đầu —', 'Tappy sẵn sàng giúp bạn! 🌅'],
      ['Sáng sớm rồi,', 'cà phê hay bánh mì trước? ☕'],
      ['Good morning!', 'Hôm nay Tappy lo hết cho bạn 😄'],
    ],
    viWeekend: [
      ['Sáng cuối tuần đây!', 'Nghỉ ngơi hay đi đâu vui? ☀️'],
      ['Cuối tuần bắt đầu —', 'Tappy gợi ý chỗ brunch ngon nhé? 🥞'],
      ['Chào buổi sáng!', 'Cuối tuần này kế hoạch gì? 🎉'],
    ],
    en: [
      ['Good morning!', 'What sounds good today? ☀️'],
      ['A new day begins —', 'Tappy is here to help! 🌅'],
    ],
    enWeekend: [
      ['Weekend morning!', 'Rest, or somewhere fun? ☀️'],
      ['Weekend’s on —', 'want a good brunch spot? 🥞'],
    ],
  },
  {
    range: [9, 11],
    vi: [
      ['Buổi sáng đang chạy —', 'bạn cần gì từ Tappy? ⚡'],
      ['Mid-morning rồi,', 'trưa nay ăn gì nghĩ chưa? 🤔'],
      ['Tappy đây!', 'Hỏi gì cũng được, trả lời liền 🚀'],
    ],
    en: [
      ['The morning is rolling —', 'what do you need? ⚡'],
      ['Tappy here!', 'Ask anything, instant answers 🚀'],
    ],
  },
  {
    range: [11, 14],
    vi: [
      ['Đói chưa?', 'Tappy tìm chỗ ăn trưa ngon ngay! 🍚'],
      ['Giờ vàng ăn trưa —', 'để Tappy chọn chỗ hộ nhé 🥢'],
      ['Cơm trưa chưa?', 'Hỏi Tappy trước khi Google nha 😄'],
      ['12h rồi —', 'ra ngoài hay đặt đồ ăn? Tappy lo! 🛵'],
    ],
    en: [
      ['Hungry?', 'Tappy finds a great lunch spot! 🍚'],
      ['Lunch o’clock —', 'let Tappy pick for you 🥢'],
    ],
  },
  {
    range: [14, 17],
    vi: [
      ['Chiều rồi,', 'cà phê hay spa thư giãn nhé? ☕'],
      ['3h chiều —', 'buồn ngủ hay đi đâu cho tỉnh? 😅'],
      ['Buổi chiều của bạn', 'sẽ thú vị hơn với Tappy! ✨'],
      ['Slump buổi chiều?', 'Tappy có mấy gợi ý hay đây 💡'],
    ],
    en: [
      ['Afternoon —', 'coffee or a relaxing spa? ☕'],
      ['Afternoon slump?', 'Tappy’s got a few ideas 💡'],
    ],
  },
  {
    range: [17, 20],
    vi: [
      ['Tan làm rồi!', 'Tối nay ăn gì, đi đâu? 🎊'],
      ['Giờ vàng buổi tối —', 'Tappy gợi ý quán ngon ngay! 🍜'],
      ['Công việc xong rồi,', 'giờ là thời gian của bạn! 🥂'],
      ['Tối nay có kế hoạch gì?', 'Tappy lo hết phần tìm kiếm! 😊'],
    ],
    viWeekend: [
      ['Tối cuối tuần rồi!', 'Đi chơi hay ăn gì ngon? 🎊'],
      ['Giờ vàng cuối tuần —', 'Tappy gợi ý quán ngon ngay! 🍜'],
      ['Tối cuối tuần của bạn,', 'đi đâu cho đáng? 🥂'],
      ['Tối nay có kế hoạch gì?', 'Tappy lo hết phần tìm kiếm! 😊'],
    ],
    en: [
      ['Off work!', 'Where to eat tonight? 🎊'],
      ['Prime evening —', 'Tappy suggests a great spot! 🍜'],
    ],
    enWeekend: [
      ['Weekend evening!', 'Out, or something tasty? 🎊'],
      ['Weekend prime time —', 'let Tappy find a spot! 🍜'],
    ],
  },
  {
    range: [20, 24],
    vi: [
      ['Tối đẹp thế này', 'đi đâu cho đáng? Hỏi Tappy đi 🌃'],
      ['Đêm xuống rồi —', 'ăn gì, làm gì, đi đâu? 🌙'],
      ['Cuối ngày rồi,', 'Tappy giúp bạn thư giãn nhé! 🛁'],
      ['Tối nay vui không?', 'Tappy có vài gợi ý hay đây ✨'],
    ],
    en: [
      ['Lovely night —', 'where’s worth going? Ask Tappy 🌃'],
      ['End of the day —', 'let Tappy help you unwind! 🛁'],
    ],
  },
]

/** The clock facts the greeting is a function of. Computed by the caller, never here. */
export interface HeroClock {
  /** 0–23 in the user-facing clock (the production page uses Vietnam time, UTC+7). */
  hour: number
  /** Saturday or Sunday. */
  isWeekend: boolean
  /** 1–31; selects today's template from the slot's pool. */
  dayOfMonth: number
}

/** Saturday and Sunday are the weekend; `day` is `Date#getDay()` (0 = Sunday). */
export const isWeekendDay = (day: number): boolean => day === 0 || day === 6

/**
 * The Vietnam-clock facts for an instant — what the production page has always
 * computed on the server ("giờ VN", UTC+7, no DST). Pure: same answer everywhere.
 */
export function vietnamHeroClock(nowMs: number): HeroClock {
  const vn = new Date(nowMs + 7 * 60 * 60 * 1000)
  return { hour: vn.getUTCHours(), isWeekend: isWeekendDay(vn.getUTCDay()), dayOfMonth: vn.getUTCDate() }
}

/** The two-line hero greeting for a clock and a language. */
export function heroGreeting(clock: HeroClock, locale: HeroLocale): HeroLines {
  const slot = HERO_SLOTS.find(s => clock.hour >= s.range[0] && clock.hour < s.range[1]) ?? HERO_SLOTS[1]
  const pool = locale === 'en'
    ? (clock.isWeekend && slot.enWeekend) || slot.en
    : (clock.isWeekend && slot.viWeekend) || slot.vi
  // `%` on a 1–31 day is never negative; the guard keeps a hand-built clock honest too.
  const index = ((clock.dayOfMonth % pool.length) + pool.length) % pool.length
  return pool[index]
}
