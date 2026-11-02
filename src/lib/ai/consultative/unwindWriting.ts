// ── Unwind step 3 (28/10/2026): the writing step is told what a ChatGPT-like answer needs, not to stay short ──────────────────────────────
//
// Diagnosis (chan-doan-6-luot.md §2.5, §2.6, §2.2d): replies were short even with the data in hand (STYLE_LUNA6 "câu đơn giản 2-4 dòng",
// LUNA_CORE "ấm, ngắn, rõ"), a land-price answer opened with "Mình chọn …" (the pick frame on a turn that picks nothing), and a source
// dated 13/09 was given as today's price with no word on its age. The pre-search pick (R2) showed the model three rows and the prompt said
// "1 chính + tối đa 2".
// This block is appended AFTER those lines (the byte-identical cached prefix is untouched) and overrides them for the turn. General lines
// only: no word list, no example taken from an evaluation set. The ages are already in the tool results (read_page: published_at,
// age_days; search results: date). W6 measured that a writing note alone did not move the grades (V1 ≈ V0): this is a step of the
// unwinding, measured with the rest, not a claim.
//   S3A  freshness: today's date and the order to state each figure's source date, say "chưa rõ ngày" for an undated one, and judge the age.
//   S3B  length by difficulty, headings / table / list when comparing or splitting money, figures only from this turn's evidence, one
//        honest caveat, one follow-up question; no "Mình chọn" on a turn that picks nothing. (route.ts also lifts the output ceiling.)
//   S3C  a pick shows 3-4 options with price, hours and address when the data has them (route.ts gives the model 4 rows; the prose-shape
//        guard keeps 3 alternatives).
// Pure.

export interface UnwindWritingInput {
  /** S3A: today's date in Vietnam (YYYY-MM-DD), or absent. */
  freshToday?: string
  /** S3B on. */
  writing: boolean
  /** S3B: this turn picks nothing (no "Mình chọn"). */
  nonPick: boolean
  /** S3C: this is a pick turn with the wider shortlist. */
  wideShortlist: boolean
  lang: string
}

/** The model rows a pick turn sees with S3C (HEAD: 3). */
export const UNWIND_PICK_ROWS = 4
/** The alternatives the prose-shape guard keeps with S3C (HEAD: 2). */
export const UNWIND_PICK_ALTERNATIVES = 3
/** The output ceiling of a turn that carries tools with S3B (HEAD: 2048; the hard ceiling is 4000). */
export const UNWIND_MAX_TOKENS = 4000
/** The sentence cap of the prose-shape guard on a consult turn with S3B (HEAD: 9, or 13 with the advice block). */
export const UNWIND_MAX_SENTENCES = 20

/**
 * CONSULT_UNWIND_S4A. The keyword reading of the message (intent.detectForcedTool) no longer decides the domain or the pre-search; the model
 * reads it as a hint it may ignore. Measured 28/10: "tiệm vàng" forced the place tool, a bare "mua" the product tool.
 */
export function unwindToolHint(tool: string, lang: string): string {
  return lang === 'en'
    ? `\n\n- TOOL HINT (not binding; decide from the question itself): ${tool}`
    : `\n\n- GOI Y CONG CU (khong bat buoc; tu quyet theo chinh cau hoi): ${tool}`
}

export function unwindWritingBlock(i: UnwindWritingInput): string {
  const lines: string[] = []
  if (i.writing) {
    lines.push(
      '- Do dai theo do kho cua cau hoi: cau don gian tra loi ngan; cau can thong tin (so lieu, so sanh, ke hoach, chia tien) tra loi DU Y, KHONG bi gioi han "2-4 dong" hay "ngan".',
      '- So sanh nhieu phuong an hoac chia tien: dung tieu de ngan, bang hoac danh sach.',
      '- So lieu (gia, gio, ty le, ngay) chi lay tu ket qua cong cu / trang da doc cua luot nay; khong co thi noi ro "chua co so lieu", khong uoc doan.',
      '- Mot luu y trung thuc khi can (dieu chua chac, dieu nen kiem lai). Ket bang MOT cau hoi tiep ngan.',
    )
    if (i.nonPick) lines.push('- Luot nay KHONG phai chon cho / chon mon: KHONG viet cau "Mình chọn: ..." va khong chot mot lua chon.')
  }
  if (i.wideShortlist) lines.push('- Luot chon: dua 3-4 lua chon (1 chinh + 2-3 khac), moi lua chon mot dong kem gia, gio, dia chi KHI co trong du lieu.')
  if (i.freshToday) lines.push(`- DO MOI: hom nay la ${i.freshToday}. Khi dung so lieu tu mot nguon, noi ro ngay cua nguon (published_at / date / age_days trong ket qua); nguon khong co ngay thi noi "chua ro ngay". Tu danh gia nguon con hop voi thoi diem cau hoi nhac toi khong; nguon cu thi noi ro do cu.`)
  if (lines.length === 0) return ''
  return `\n\n===== CACH VIET LUOT NAY (GHI DE cac dong ve do dai / khung o tren) =====\n${lines.join('\n')}\n=====`
}
