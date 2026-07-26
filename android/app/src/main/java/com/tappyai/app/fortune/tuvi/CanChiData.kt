package com.tappyai.app.fortune.tuvi

data class CanChi(
    val id: Int,
    val emoji: String,
    val nameVi: String,
    val animalVi: String,
    val traits: String,
) {
    /** The web string id the deterministic engine seeds with (e.g. `ty`, `ty2`). Index maps to
     *  [CANCHI_SEED_IDS]; readings are byte-identical to web only when this matches. */
    val seedId: String get() = CANCHI_SEED_IDS[id]
}

// Web parity (src/lib/boi/canChiData.ts): the label is the CHI only ("Tý", "Sửu", …). The old
// Android data fabricated a fixed heavenly-stem per animal ("Canh Tý", "Tân Sửu", …), but the stem
// cycles every 10 years, so a hardcoded stem is correct for only one birth year per animal and wrong
// for the rest. Match the web: chi name + web's exact emoji set, no fabricated stem.
private val CAN_CHI: List<CanChi> = listOf(
    CanChi(0, "🐀", "Tý", "Chuột", "Thông minh, nhanh nhẹn, có khiếu kinh doanh và rất nhạy cảm với xu hướng."),
    CanChi(1, "🐂", "Sửu", "Trâu", "Cần cù, bền bỉ, đáng tin cậy và luôn hoàn thành những gì đã cam kết."),
    CanChi(2, "🐯", "Dần", "Hổ", "Can đảm, quyết đoán, có khả năng lãnh đạo và không sợ thử thách."),
    CanChi(3, "🐱", "Mão", "Mèo", "Khéo léo, tinh tế, có gu thẩm mỹ tốt và biết cách duy trì hòa khí."),
    CanChi(4, "🐉", "Thìn", "Rồng", "Tự tin, sáng tạo, có tầm nhìn xa và thường đạt được những điều vĩ đại."),
    CanChi(5, "🐍", "Tỵ", "Rắn", "Khôn ngoan, trực giác tốt, bí ẩn và có chiều sâu tâm lý đặc biệt."),
    CanChi(6, "🐴", "Ngọ", "Ngựa", "Năng động, tự do, nhiệt huyết và luôn khát khao những điều mới mẻ."),
    CanChi(7, "🐐", "Mùi", "Dê", "Sáng tạo, nhân từ, nhạy cảm và có tâm hồn nghệ sĩ phong phú."),
    CanChi(8, "🐒", "Thân", "Khỉ", "Lanh lợi, thích nghi tốt, hài hước và luôn tìm ra giải pháp mới."),
    CanChi(9, "🐓", "Dậu", "Gà", "Tỉ mỉ, chăm chỉ, thẳng thắn và có trách nhiệm cao với công việc."),
    CanChi(10, "🐕", "Tuất", "Chó", "Trung thành, chính trực, bảo vệ người thân và luôn đứng về phía công lý."),
    CanChi(11, "🐖", "Hợi", "Heo", "Hào phóng, chân thành, yêu hòa bình và biết tận hưởng cuộc sống."),
)

fun getCanChiByYear(birthYear: Int): CanChi {
    val index = ((birthYear - 4) % 12 + 12) % 12
    return CAN_CHI[index]
}

/**
 * Ngũ Hành (five elements) by birth year, mirroring web `getNguHanhByYear` (`canChiData.ts`): keyed
 * by the year's last digit — 0/1→Kim, 2/3→Thủy, 4/5→Mộc, 6/7→Hỏa, 8/9→Thổ.
 */
fun getNguHanhByYear(birthYear: Int): String = when (birthYear % 10) {
    0, 1 -> "Kim"
    2, 3 -> "Thủy"
    4, 5 -> "Mộc"
    6, 7 -> "Hỏa"
    else -> "Thổ"
}
