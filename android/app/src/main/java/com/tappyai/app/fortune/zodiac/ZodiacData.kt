package com.tappyai.app.fortune.zodiac

data class ZodiacSign(
    val id: Int,
    val emoji: String,
    val nameVi: String,
    val element: String,
    val ruling: String,
    val traits: String,
    val dateRangeLabel: String,
    val startMonth: Int,
    val startDay: Int,
    val endMonth: Int,
    val endDay: Int,
) {
    /** The web string id the deterministic engine seeds with (e.g. `aries`). Index maps to
     *  [ZODIAC_SEED_IDS]; readings are byte-identical to web only when this matches. */
    val seedId: String get() = ZODIAC_SEED_IDS[id]
}

// Element strings aligned to web prod (`src/lib/boi/zodiacData.ts`): Hỏa / Thổ / Khí / Thủy
// (the old Android values Lửa/Đất/Nước diverged from web).
private val ZODIAC_SIGNS: List<ZodiacSign> = listOf(
    ZodiacSign(0, "♈", "Bạch Dương", "Hỏa", "Sao Hỏa", "Nhiệt tình, dũng cảm, độc lập và luôn đi tiên phong trong mọi việc.", "21/3 – 19/4", 3, 21, 4, 19),
    ZodiacSign(1, "♉", "Kim Ngưu", "Thổ", "Kim Tinh", "Kiên định, đáng tin cậy, yêu thích sự ổn định và những niềm vui giản đơn.", "20/4 – 20/5", 4, 20, 5, 20),
    ZodiacSign(2, "♊", "Song Tử", "Khí", "Sao Thủy", "Linh hoạt, tò mò, hài hước và luôn tìm kiếm thông tin mới mẻ.", "21/5 – 20/6", 5, 21, 6, 20),
    ZodiacSign(3, "♋", "Cự Giải", "Thủy", "Mặt Trăng", "Nhạy cảm, chăm sóc, gắn bó với gia đình và có trực giác mạnh mẽ.", "21/6 – 22/7", 6, 21, 7, 22),
    ZodiacSign(4, "♌", "Sư Tử", "Hỏa", "Mặt Trời", "Tự tin, hào phóng, sáng tạo và luôn muốn trở thành trung tâm chú ý.", "23/7 – 22/8", 7, 23, 8, 22),
    ZodiacSign(5, "♍", "Xử Nữ", "Thổ", "Sao Thủy", "Tỉ mỉ, thực tế, phân tích tốt và luôn muốn hoàn thiện mọi thứ.", "23/8 – 22/9", 8, 23, 9, 22),
    ZodiacSign(6, "♎", "Thiên Bình", "Khí", "Kim Tinh", "Công bằng, hòa giải giỏi, yêu cái đẹp và luôn tìm kiếm sự cân bằng.", "23/9 – 22/10", 9, 23, 10, 22),
    ZodiacSign(7, "♏", "Bọ Cạp", "Thủy", "Sao Diêm Vương", "Mãnh liệt, bí ẩn, kiên quyết và có trực giác sâu sắc về con người.", "23/10 – 21/11", 10, 23, 11, 21),
    ZodiacSign(8, "♐", "Nhân Mã", "Hỏa", "Sao Mộc", "Lạc quan, ham học hỏi, yêu tự do và luôn hướng tới chân trời mới.", "22/11 – 21/12", 11, 22, 12, 21),
    ZodiacSign(9, "♑", "Ma Kết", "Thổ", "Sao Thổ", "Tham vọng, kỷ luật, thực dụng và luôn kiên trì theo đuổi mục tiêu.", "22/12 – 19/1", 12, 22, 1, 19),
    ZodiacSign(10, "♒", "Bảo Bình", "Khí", "Sao Thiên Vương", "Độc đáo, tiến bộ, nhân đạo và luôn có cái nhìn đột phá về thế giới.", "20/1 – 18/2", 1, 20, 2, 18),
    ZodiacSign(11, "♓", "Song Ngư", "Thủy", "Sao Hải Vương", "Nhạy cảm, từ bi, sáng tạo và có trí tưởng tượng phong phú.", "19/2 – 20/3", 2, 19, 3, 20),
)

fun getZodiacByDate(month: Int, day: Int): ZodiacSign {
    return ZODIAC_SIGNS.firstOrNull { sign ->
        when {
            sign.startMonth == sign.endMonth -> month == sign.startMonth && day >= sign.startDay && day <= sign.endDay
            month == sign.startMonth -> day >= sign.startDay
            month == sign.endMonth -> day <= sign.endDay
            sign.startMonth < sign.endMonth -> month > sign.startMonth && month < sign.endMonth
            else -> month > sign.startMonth || month < sign.endMonth
        }
    } ?: ZODIAC_SIGNS[11]
}
