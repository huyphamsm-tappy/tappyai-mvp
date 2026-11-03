import { normalizeVN } from '@/lib/ai/intent'
import { allScenarios } from './index'
import type { ScamScenario } from './types'

// Scam Shield · static scenario matching — SHORT inputs included (owner 02/10).
//
// WHY THIS EXISTS. "Bưu phẩm Trung thu kèm mã QR" (eight words, no verb, no link, no demand) matched
// none of the message rules — those look for a REQUEST (send money, read the OTP, tap the link) —
// and came out "An toàn". A short description of a known scam is exactly what a worried person
// types, so the library of official scenarios is matched on its own vocabulary:
//
//   * every one of the 25 scenarios in `bocongan2026.ts` has weighted phrases, written from that
//     scenario's own title / summary / warning signs / requests;
//   * text is lower-cased and diacritic-stripped (so "phạt nguội" == "phat nguoi"), phrases match on
//     WORD boundaries, each phrase counts once;
//   * the best-scoring scenario wins. score >= STRONG_AT  -> a strong match ("familiar scam signs");
//     score >= WEAK_AT -> a weak match ("some suspicious signs"); below that nothing is claimed.
//
// ZERO tokens, zero network, deterministic. A phrase list is a product decision, so it lives next to
// the data it describes and `match.test.ts` pins one fixture per scenario.

export const STRONG_AT = 6
export const WEAK_AT = 4

type Phrase = readonly [phrase: string, weight: number]

/** Phrases are written WITHOUT diacritics (matching runs on the stripped text). */
const PHRASES: Record<number, readonly Phrase[]> = {
  // 1 · Giả người thân qua video Deepfake
  1: [['deepfake', 6], ['gia nguoi than', 6], ['gia mao nguoi than', 6], ['cuoc goi video', 3], ['goi video', 3], ['hinh anh gia', 4], ['nguoi than', 1.5], ['chuyen khoan gap', 3], ['can tien gap', 3], ['hinh mo', 1.5], ['ket thuc dot ngot', 2]],
  // 2 · Làm giả giọng người quen bằng DeepVoice
  2: [['deepvoice', 6], ['deep voice', 6], ['lam gia giong', 6], ['gia giong', 5], ['giong noi gia', 6], ['giong nguoi quen', 5], ['giong noi', 2], ['vay tien', 2], ['so la', 1.5], ['giu bi mat', 2], ['khong the goi lai', 2]],
  // 9 · Gọi điện im lặng
  9: [['goi dien im lang', 6], ['cuoc goi im lang', 6], ['thu thap giong', 6], ['mau giong noi', 5], ['im lang', 2], ['khong noi chuyen', 2], ['a lo', 1.5], ['so la goi', 2], ['nhieu cuoc goi', 2]],
  // 3 · Mạo danh cơ quan tố tụng
  3: [['gia danh cong an', 6], ['mao danh co quan to tung', 6], ['co quan to tung', 5], ['lien quan vu an', 5], ['tai khoan tam giu', 6], ['chuyen tien de xac minh', 6], ['lenh bat', 5], ['rua tien', 4], ['vien kiem sat', 3], ['vu an', 3], ['cong an', 2], ['toa an', 2], ['giay trieu tap', 2], ['giu bi mat', 2]],
  // 4 · Giả nhân viên ngân hàng
  4: [['gia nhan vien ngan hang', 6], ['nhan vien ngan hang', 5], ['khoa tai khoan', 4], ['nang han muc', 4], ['giao dich la', 4], ['link dang nhap', 3], ['mat khau', 2], ['ma otp', 2], ['ngan hang', 1.5], ['dang nhap', 1.5], ['mo khoa', 2], ['otp', 1.5]],
  // 5 · Tin nhắn Brandname giả
  5: [['tin nhan brandname', 6], ['brandname', 6], ['sms gia', 4], ['tin nhan gia', 4], ['dang nhap bat thuong', 5], ['tai khoan bi khoa', 4], ['nhan tien hoan', 3], ['ten hien thi', 2]],
  // 10 · Giả danh giáo viên, nhà trường
  10: [['gia danh giao vien', 6], ['giao vien', 2], ['nha truong', 2], ['hoc sinh', 2], ['tai nan', 3], ['cap cuu', 3], ['vien phi', 4], ['con em', 1.5], ['con ban', 1.5]],
  // 11 · Mạo danh nhân viên y tế
  11: [['mao danh nhan vien y te', 6], ['nhan vien y te', 5], ['bac si', 2], ['dieu duong', 2], ['nhap vien', 3], ['cap cuu', 3], ['vien phi', 4], ['tam ung', 3], ['nguoi than', 1.5]],
  // 12 · Dọa khóa SIM
  12: [['khoa sim', 6], ['sim sap bi khoa', 6], ['chuan hoa sim', 5], ['chuan hoa thue bao', 5], ['xac thuc sim', 5], ['nang cap sim', 5], ['chuyen huong cuoc goi', 4], ['thue bao', 2], ['sim', 1.5]],
  // 13 · Giả chương trình hoàn tiền
  13: [['chuong trinh hoan tien', 6], ['hoan hoc phi', 5], ['hoan thue', 5], ['nhan hoan tien', 5], ['nhan tien hoan', 5], ['hoan tien', 4], ['phi kich hoat', 4]],
  // 17 · Mạo danh điện lực, cấp nước, viễn thông
  17: [['no cuoc', 6], ['cat dien', 6], ['cat nuoc', 5], ['cat mang', 5], ['nop cuoc', 4], ['tra cuu cuoc', 4], ['thanh toan cuoc', 4], ['dien luc', 3], ['cap nuoc', 3], ['tien dien', 3], ['hoa don dien', 3], ['vien thong', 2]],
  // 18 · Giả danh cơ quan BHXH, y tế, lao động
  18: [['vssid', 6], ['dong bo cccd', 6], ['so bhxh', 4], ['bhxh', 4], ['bao hiem xa hoi', 4], ['cap nhat ho so', 3], ['tro cap', 3], ['anh cccd', 3], ['cccd', 2], ['ho so', 1]],
  // 22 · Giả thông báo phạt nguội
  22: [['phat nguoi', 6], ['nop phat truc tuyen', 6], ['tra cuu vi pham', 5], ['nop phat', 4], ['vi pham giao thong', 4], ['csgt', 3], ['canh sat giao thong', 3], ['thong bao phat', 3]],
  // 14 · Lừa tuyển cộng tác viên
  14: [['viec nhe luong cao', 6], ['tuyen cong tac vien', 6], ['dat don ao', 6], ['cong tac vien', 4], ['lam nhiem vu', 4], ['nang cap thanh vien', 4], ['rut duoc so du', 4], ['viec nhe', 3], ['nhiem vu', 3], ['hoa hong', 3], ['luong cao', 2]],
  // 15 · Mời đầu tư lợi nhuận cao
  15: [['cam ket loi nhuan', 6], ['loi nhuan co dinh', 6], ['loi nhuan cao', 5], ['khong rui ro', 5], ['loi nhuan hap dan', 5], ['nap tien vao san', 5], ['forex', 4], ['tien so', 3], ['tien ao', 3], ['crypto', 3], ['ngoai hoi', 3], ['san giao dich', 3], ['nang cap goi', 3], ['chung khoan', 2], ['dau tu', 2], ['chuyen gia', 1.5]],
  // 16 · Tạo nhóm đầu tư giả
  16: [['nhom dau tu', 5], ['thay doc lenh', 6], ['lenh vip', 6], ['nop thue de rut', 6], ['khoe lai', 5], ['doc lenh', 5], ['rut lai nho', 5], ['chan rut tien', 5], ['vao lenh', 4], ['phi bao hiem', 4], ['nhom chat', 2]],
  // 23 · Thông báo trúng thưởng giả
  23: [['trung thuong', 6], ['trung giai', 5], ['nhan thuong', 4], ['phi van chuyen', 4], ['thue thu nhap', 3], ['tien thuong', 3], ['nhan qua', 2], ['qua tang', 1.5]],
  // 24 · Lừa đảo tình cảm
  24: [['lua dao tinh cam', 6], ['phi hai quan', 6], ['qua bi giu o hai quan', 6], ['nhan hang ho', 6], ['chuyen hang ho', 6], ['quen qua mang', 4], ['tranh gap mat', 4], ['chua tung gap', 4], ['hai quan', 3], ['tinh cam', 2], ['nguoi yeu', 2], ['ket ban', 1.5]],
  // 25 · Giả nhân viên tuyển dụng
  25: [['phi ho so', 6], ['phi dao tao', 6], ['tien dong phuc', 6], ['dat coc thiet bi', 6], ['trung tuyen', 5], ['khong can phong van', 5], ['tuyen dung', 3], ['nha tuyen dung', 3], ['nhan viec', 2], ['phong van', 1]],
  // 7 · Làm giả bằng chứng giao dịch
  7: [['chuyen khoan gia', 6], ['bien lai gia', 6], ['hoan tien thua', 6], ['anh chuyen khoan', 5], ['ngan hang dang xu ly', 5], ['chua nhan duoc tien', 4], ['tien thua', 4], ['bang chung giao dich', 4], ['bien lai', 3], ['da chuyen khoan', 3], ['nguoi mua', 1.5]],
  // 21 · Lừa mua bán hàng hóa
  21: [['khong cho kiem hang', 6], ['khong ship cod', 6], ['gia re bat thuong', 5], ['chi nhan coc', 5], ['dat coc', 4], ['coc truoc', 4], ['chuyen khoan truoc', 4], ['shop moi lap', 4], ['nguoi ban', 2], ['mua ban', 1.5]],
  // 19 · Mã QR giả — "kèm mã QR" next to a parcel/gift word is the shape the owner reported
  19: [['ma qr gia', 6], ['qr gia', 6], ['ma qr la', 6], ['qr dan de', 6], ['qr lam gia', 6], ['qr la', 5], ['kem ma qr', 5], ['dinh kem ma qr', 5], ['gui kem ma qr', 5], ['quet qr', 4], ['ma qr', 3], ['quet ma', 2], ['buu pham', 2], ['buu kien', 2], ['kien hang', 2], ['qua trung thu', 2], ['qua tang', 1.5], ['qua tet', 2], ['in roi', 2]],
  // 20 · Dụ cài ứng dụng điều khiển từ xa
  20: [['dieu khien tu xa', 6], ['teamviewer', 5], ['anydesk', 5], ['ultraviewer', 5], ['quyen tro nang', 5], ['file apk', 5], ['apk', 4], ['chia se man hinh', 4], ['cai ung dung', 3], ['cai phan mem', 3], ['ho tro ky thuat', 3], ['ma id', 2]],
  // 6 · Phát tán đường link giả mạo
  6: [['duong link gia', 6], ['link gia', 6], ['lien ket gia', 6], ['dang nhap qua link', 5], ['xac minh qua link', 5], ['duong link la', 5], ['ten mien la', 5], ['link la', 4], ['link xac minh', 4], ['link rut gon', 3], ['bam vao link', 3], ['bam link', 3], ['link', 1]],
  // 8 · Chiếm đoạt tài khoản mạng xã hội
  8: [['chiem doat tai khoan', 6], ['facebook bi hack', 6], ['hack tai khoan', 6], ['ban be nhan vay tien', 6], ['nhan vay tien', 5], ['nhan tin muon tien', 5], ['vay tien gap', 4], ['bi hack', 4], ['binh chon', 4], ['mat tai khoan', 3], ['tai khoan ban be', 3], ['tai khoan facebook', 2], ['xem anh', 2], ['zalo', 1]],
}

export interface ScenarioMatch {
  scenario: ScamScenario
  score: number
  strength: 'strong' | 'weak'
  /** The phrases that fired (diacritic-free) — for tests and logs; never shown to the user. */
  phrases: string[]
}

const boundary = (p: string) => new RegExp(`(?<![a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`)
const COMPILED = Object.fromEntries(
  Object.entries(PHRASES).map(([n, list]) => [n, list.map(([p, w]) => ({ p, w, re: boundary(p) }))]),
) as Record<string, Array<{ p: string; w: number; re: RegExp }>>

/** Official numbers that have a phrase list — the coverage test compares it with the dataset. */
export function coveredScenarioNumbers(): number[] {
  return Object.keys(PHRASES).map(Number).sort((a, b) => a - b)
}

export function scoreScenarios(text: string): Array<{ scenario: ScamScenario; score: number; phrases: string[] }> {
  const t = normalizeVN(text.toLowerCase()).replace(/\s+/g, ' ')
  const out: Array<{ scenario: ScamScenario; score: number; phrases: string[] }> = []
  for (const scenario of allScenarios()) {
    const list = COMPILED[String(scenario.officialNumber)]
    if (!list) continue
    const hit = list.filter(({ re }) => re.test(t))
    // A phrase wholly contained in a longer phrase that also matched is the SAME evidence, counted
    // once ("kem ma qr" inside "gui kem ma qr"), so a bare "kem ma QR" cannot reach the strong band.
    const kept = hit.filter(a => !hit.some(b => b !== a && b.p.length > a.p.length && b.p.includes(a.p)))
    const score = kept.reduce((n, { w }) => n + w, 0)
    if (score > 0) out.push({ scenario, score, phrases: kept.map(k => k.p) })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** The best official scenario for a (possibly very short) text, or null when nothing is claimed. */
export function matchScenario(text: string): ScenarioMatch | null {
  if (!text || !text.trim()) return null
  const best = scoreScenarios(text)[0]
  if (!best || best.score < WEAK_AT) return null
  return { scenario: best.scenario, score: best.score, strength: best.score >= STRONG_AT ? 'strong' : 'weak', phrases: best.phrases }
}
