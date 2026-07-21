package com.tappyai.app.home

/**
 * The Home hero greeting engine — a 1:1 Kotlin port of the web's canonical implementation
 * (`src/app/page.tsx` HERO_TEXTS for Vietnamese, `src/app/HomeView.tsx` HERO_EN for English).
 *
 * Web contract, mirrored exactly:
 *  - 7 hour slots: [0,5) late night · [5,9) early morning · [9,11) mid-morning · [11,14) noon ·
 *    [14,17) afternoon · [17,20) evening · [20,24) night.
 *  - Multiple templates per slot (never one fixed greeting); [5,9) and [17,20) additionally have
 *    weekend variants.
 *  - Template choice = `dayOfMonth % templates.size` — deterministic per day, so Web and Android
 *    show the SAME greeting on the same day, and it naturally rotates day to day.
 *  - Web renders a two-line heading via `<br />`; here the same break is a `\n`.
 *
 * Keep the template pools byte-identical to the web files — any copy edit must land on BOTH
 * platforms in the same change.
 */
object HomeGreeting {

    private class Slot(
        val range: IntRange, // hour range, end-exclusive semantics encoded as [first, last]
        val vi: List<String>,
        val viWeekend: List<String>? = null,
        val en: List<String>,
        val enWeekend: List<String>? = null,
    )

    private val SLOTS = listOf(
        Slot(
            range = 0..4,
            vi = listOf(
                "Thức khuya à?\nTappy đây, cần gì không? 🌙",
                "Đêm muộn rồi —\nnhưng Tappy vẫn sẵn sàng 🌛",
                "Còn thức à?\nĐặt đồ ăn khuya hay cần gì? 🍜",
            ),
            en = listOf(
                "Still up? 🌙\nTappy is here — need anything?",
                "Late night —\nbut Tappy is ready 🌛",
            ),
        ),
        Slot(
            range = 5..8,
            vi = listOf(
                "Chào buổi sáng!\nHôm nay ăn gì ngon đây? ☀️",
                "Ngày mới bắt đầu —\nTappy sẵn sàng giúp bạn! 🌅",
                "Sáng sớm rồi,\ncà phê hay bánh mì trước? ☕",
                "Good morning!\nHôm nay Tappy lo hết cho bạn 😄",
            ),
            viWeekend = listOf(
                "Sáng cuối tuần đây!\nNghỉ ngơi hay đi đâu vui? ☀️",
                "Cuối tuần bắt đầu —\nTappy gợi ý chỗ brunch ngon nhé? 🥞",
                "Chào buổi sáng!\nCuối tuần này kế hoạch gì? 🎉",
            ),
            en = listOf(
                "Good morning!\nWhat sounds good today? ☀️",
                "A new day begins —\nTappy is here to help! 🌅",
            ),
            enWeekend = listOf(
                "Weekend morning!\nRest, or somewhere fun? ☀️",
                "Weekend’s on —\nwant a good brunch spot? 🥞",
            ),
        ),
        Slot(
            range = 9..10,
            vi = listOf(
                "Buổi sáng đang chạy —\nbạn cần gì từ Tappy? ⚡",
                "Mid-morning rồi,\ntrưa nay ăn gì nghĩ chưa? 🤔",
                "Tappy đây!\nHỏi gì cũng được, trả lời liền 🚀",
            ),
            en = listOf(
                "The morning is rolling —\nwhat do you need? ⚡",
                "Tappy here!\nAsk anything, instant answers 🚀",
            ),
        ),
        Slot(
            range = 11..13,
            vi = listOf(
                "Đói chưa?\nTappy tìm chỗ ăn trưa ngon ngay! 🍚",
                "Giờ vàng ăn trưa —\nđể Tappy chọn chỗ hộ nhé 🥢",
                "Cơm trưa chưa?\nHỏi Tappy trước khi Google nha 😄",
                "12h rồi —\nra ngoài hay đặt đồ ăn? Tappy lo! 🛵",
            ),
            en = listOf(
                "Hungry?\nTappy finds a great lunch spot! 🍚",
                "Lunch o’clock —\nlet Tappy pick for you 🥢",
            ),
        ),
        Slot(
            range = 14..16,
            vi = listOf(
                "Chiều rồi,\ncà phê hay spa thư giãn nhé? ☕",
                "3h chiều —\nbuồn ngủ hay đi đâu cho tỉnh? 😅",
                "Buổi chiều của bạn\nsẽ thú vị hơn với Tappy! ✨",
                "Slump buổi chiều?\nTappy có mấy gợi ý hay đây 💡",
            ),
            en = listOf(
                "Afternoon —\ncoffee or a relaxing spa? ☕",
                "Afternoon slump?\nTappy’s got a few ideas 💡",
            ),
        ),
        Slot(
            range = 17..19,
            vi = listOf(
                "Tan làm rồi!\nTối nay ăn gì, đi đâu? 🎊",
                "Giờ vàng buổi tối —\nTappy gợi ý quán ngon ngay! 🍜",
                "Công việc xong rồi,\ngiờ là thời gian của bạn! 🥂",
                "Tối nay có kế hoạch gì?\nTappy lo hết phần tìm kiếm! 😊",
            ),
            viWeekend = listOf(
                "Tối cuối tuần rồi!\nĐi chơi hay ăn gì ngon? 🎊",
                "Giờ vàng cuối tuần —\nTappy gợi ý quán ngon ngay! 🍜",
                "Tối cuối tuần của bạn,\nđi đâu cho đáng? 🥂",
                "Tối nay có kế hoạch gì?\nTappy lo hết phần tìm kiếm! 😊",
            ),
            en = listOf(
                "Off work!\nWhere to eat tonight? 🎊",
                "Prime evening —\nTappy suggests a great spot! 🍜",
            ),
            enWeekend = listOf(
                "Weekend evening!\nOut, or something tasty? 🎊",
                "Weekend prime time —\nlet Tappy find a spot! 🍜",
            ),
        ),
        Slot(
            range = 20..23,
            vi = listOf(
                "Tối đẹp thế này\nđi đâu cho đáng? Hỏi Tappy đi 🌃",
                "Đêm xuống rồi —\năn gì, làm gì, đi đâu? 🌙",
                "Cuối ngày rồi,\nTappy giúp bạn thư giãn nhé! 🛁",
                "Tối nay vui không?\nTappy có vài gợi ý hay đây ✨",
            ),
            en = listOf(
                "Lovely night —\nwhere’s worth going? Ask Tappy 🌃",
                "End of the day —\nlet Tappy help you unwind! 🛁",
            ),
        ),
    )

    /**
     * The hero heading for [hour] (0–23, user's local clock), weekend flag, and day of month —
     * web fallback included (unknown hour → the morning slot, same as `?? HERO_TEXTS[1]`).
     */
    fun heroText(hour: Int, isWeekend: Boolean, dayOfMonth: Int, english: Boolean): String {
        val slot = SLOTS.firstOrNull { hour in it.range } ?: SLOTS[1]
        val texts = if (english) {
            (if (isWeekend) slot.enWeekend else null) ?: slot.en
        } else {
            (if (isWeekend) slot.viWeekend else null) ?: slot.vi
        }
        return texts[Math.floorMod(dayOfMonth, texts.size)]
    }
}
