// The deterministic layer of the automatic moderation: short lists of UNAMBIGUOUS Vietnamese phrases, matched on diacritic-free text (see normalize.ts). It runs before the model, costs nothing,
// and cannot be talked out of a decision. It is deliberately NARROW: only phrases that are almost never legitimate. Anything subtler (context, negation, news, warnings) is the model's job
// (classifier.ts).
//
// 🚨 WHY THE LISTS ARE SHORT. Once diacritics are folded, many ordinary Vietnamese phrases collide with a forbidden one, and a rule cannot tell them apart:
//   "mưa dầm" = "mua dam", "ghi đè" = "ghi de", "anh nóng tính" = "anh nong", "khoa Thận" = "khoa than" (a hospital department), "đừng lo, để mình" = "lo de" (and "lô đề" is lottery),
//   "bàn về ma túy" = "ban ve ma tuy", "không cam kết lợi nhuận" (a warning), "cho vay tín dụng đen" (news), "chống phá Nhà nước" and "âm mưu lật đổ chính quyền" (official news that
//   reports the offence), "chia rẽ dân tộc" (people say "we must not ..."). Those are NOT here: the model reads the context. Words like "lừa đảo" or "ma túy" alone are never here either:
//   people use them to WARN, and a warning must be able to be posted.
//
// The categories follow what Vietnamese law forbids on a platform: content against the State, incitement to violence/riot/terror, division of ethnic groups or religions, false information that
// causes panic, pornography, child sexual content, fraud, gambling and drugs, insults to honour and privacy. The owner and a lawyer own the exact scope; this file is the code form of it.
import { foldVietnamese, wordRegex } from './normalize'

export type ModerationCategory =
  | 'sexual_explicit'
  | 'child_safety'
  | 'anti_state'
  | 'division_hate'
  | 'violence_terror'
  | 'misinformation'
  | 'scam_fraud'
  | 'gambling'
  | 'drugs'
  | 'defamation_privacy'

export const MODERATION_CATEGORIES: readonly ModerationCategory[] = [
  'sexual_explicit', 'child_safety', 'anti_state', 'division_hate', 'violence_terror', 'misinformation', 'scam_fraud', 'gambling', 'drugs', 'defamation_privacy',
]

export interface RuleHit { category: ModerationCategory; rule: string }

interface PhraseRule { category: ModerationCategory; phrases: readonly string[]; /** also matched with all separators removed (long, distinctive phrases only) */ evasion?: boolean }

const PHRASES: readonly PhraseRule[] = [
  { category: 'sexual_explicit', evasion: true, phrases: ['khieu dam', 'phim sex', 'clip sex', 'anh sex', 'video sex', 'chat sex', 'sex online', 'sex cam', 'sexcam', 'phim heo', 'phim nguoi lon', 'mai dam', 'dich vu tinh duc', 'gai goi', 'ban than xac', 'pornhub', 'xvideos', 'hentai', 'porn', 'pornography'] },
  { category: 'child_safety', evasion: true, phrases: ['au dam', 'loli', 'lolicon', 'shota', 'khieu dam tre em', 'clip sex tre em', 'anh sex tre em', 'xam hai tinh duc tre em'] },
  // Only slurs and calls to act. Plain mentions of the offences ("lật đổ chính quyền", "chống phá Nhà nước") are NOT here: official news reports them.
  { category: 'anti_state', evasion: true, phrases: ['da dao dang cong san', 'da dao nha nuoc', 'bieu tinh lat do', 'khoi nghia lat do', 'doc tai cong san', 'bon cong san', 'lu cong san', 'cong san ngu dan'] },
  // No scam or misinformation phrases here, on purpose (found in a real run on UAT): a WARNING quotes the scam's own slogan ("cảnh báo: chiêu 'việc nhẹ lương cao' là lừa đảo", "'thần dược chữa ung
  // thư' là tin sai"), and a rule cannot tell the warning from the advert. The model reads the context.
  { category: 'gambling', evasion: true, phrases: ['ca do bong da', 'ca cuoc bong da', 'nha cai uy tin', 'danh bac online', 'xoc dia online', 'tai xiu online', 'soi cau lo de', 'casino online', 'game bai doi thuong', 'no hu doi thuong', 'sunwin', 'go88', '789bet', 'fb88', 'w88', 'bet88'] },
  // Selling: the verb and the thing must be ADJACENT ("bán ma túy"), never merely in the same sentence ("bàn về ma túy").
  { category: 'drugs', evasion: true, phrases: ['ban ma tuy', 'mua ma tuy', 'ship ma tuy', 'giao ma tuy', 'ban thuoc lac', 'mua thuoc lac', 'ban heroin', 'ban cocain', 'ban cocaine', 'ban ketamine', 'ban can sa', 'ban co my'] },
  { category: 'violence_terror', evasion: true, phrases: ['ban sung tu che', 'ban sung that', 'ban chat no', 'ban thuoc no', 'huong dan che tao bom'] },
]

// Sexual content that involves a child: a sexual word together with a word for a child or a minor, in the same text.
interface ComboRule { category: ModerationCategory; rule: string; a: readonly string[]; b: readonly string[] }
const COMBOS: readonly ComboRule[] = [
  { category: 'child_safety', rule: 'sexual_with_child', a: ['sex', 'khieu dam', 'mai dam', 'xxx', 'porn'], b: ['tre em', 'be gai', 'be trai', 'hoc sinh', 'nu sinh', 'nam sinh', 'duoi 18', 'chua du tuoi'] },
]

const compiled = PHRASES.map(r => ({ ...r, res: r.phrases.map(p => ({ p, re: wordRegex(p), compact: p.replace(/\s+/g, '') })) }))
const hasWord = (spaced: string, p: string) => wordRegex(p).test(spaced)

/** Every rule the text breaks. Empty array = nothing deterministic found. Pure. */
export function scanLexicon(text: string): RuleHit[] {
  const { spaced, compact } = foldVietnamese(text)
  if (!spaced) return []
  const hits: RuleHit[] = []
  const seen = new Set<string>()
  const add = (category: ModerationCategory, rule: string) => { const k = `${category}:${rule}`; if (!seen.has(k)) { seen.add(k); hits.push({ category, rule }) } }
  for (const r of compiled) {
    for (const { p, re, compact: c } of r.res) {
      if (re.test(spaced)) add(r.category, p)
      // Separator evasion ("k.h.i.e.u d.a.m"): only for distinctive phrases of 8+ letters, so a short term cannot match inside a longer, innocent word.
      // "Selling" phrases (ban/mua/ship/giao + thing) are excluded: "bán" and "bàn" fold to the same letters, so a compact match would join two unrelated words.
      else if (r.evasion && c.length >= 8 && !/^(ban|mua|ship|giao) /.test(p) && compact.includes(c)) add(r.category, `${p} (separated)`)
    }
  }
  for (const c of COMBOS) {
    if (c.a.some(x => hasWord(spaced, x)) && c.b.some(x => hasWord(spaced, x))) add(c.category, c.rule)
  }
  return hits
}
