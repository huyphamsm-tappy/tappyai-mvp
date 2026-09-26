// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buildSystem } from './promptBuilder'

// ── "Cảnh báo lừa đảo" checks a MESSAGE, a LINK or a QR CODE — never a person ────
//
// Phone-number lookup was removed deliberately (F-022: a pasted number returns INCONCLUSIVE),
// and labelling a specific person's bank account carries the same defamation risk. Session C
// (2026-09-22) shipped a prompt sentence telling users to paste "số điện thoại / tài khoản" into
// the checker; the owner caught it. This test fails if any prompt, dictionary or Scam Shield /
// chat UI copy tells the user to check, look up or paste a phone number or a bank account.

/** "check / look up / paste … phone number / account", either order, within one clause. */
const TELLS_USER_TO_CHECK_A_NUMBER = new RegExp(
  // "verify" is left out on purpose: the message analyser's own prompt QUOTES scam pretexts
  // ("verify your phone number") as things to flag — the opposite of an instruction to the user.
  '(?:kiem tra|kiểm tra|tra cuu|tra cứu|dan |dán |paste|check|look up|nhap |nhập |enter)[^.\\n]{0,70}'
  + '(?:so dien thoai|số điện thoại|sdt\\b|sđt\\b|so tai khoan|số tài khoản|tai khoan ngan hang|tài khoản ngân hàng|phone number|bank account|account number)'
  + '|(?:so dien thoai|số điện thoại|so tai khoan|số tài khoản|tai khoan ngan hang|tài khoản ngân hàng|phone number|bank account|account number)[^.\\n]{0,70}'
  + '(?:vao \\*\\*Canh bao|vào \\*\\*Cảnh báo|Canh bao lua dao|Cảnh báo lừa đảo|scam shield|kiem tra an toan|Kiểm Tra An Toàn|de kiem tra|để kiểm tra|to check)',
  'iu',
)

const ROOT = join(__dirname, '..', '..')
function filesUnder(dir: string, out: string[] = []): string[] {
  let names: string[]
  try { names = readdirSync(dir) } catch { return out } // a surface another branch owns (/kiem-tra)
  for (const name of names) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) filesUnder(p, out)
    else if (/\.(ts|tsx|json)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('the scam checker is never presented as a phone-number or bank-account lookup', () => {
  it('the system prompt points at message / link / QR only', () => {
    for (const lang of ['vi', 'en']) {
      const { shared, dynamic } = buildSystem(null, 'unknown', true, '', lang, '', null, null, false)
      const all = shared + dynamic
      expect(all).toContain('dán tin nhắn, link hoặc mã QR của người bán vào **Cảnh báo lừa đảo**')
      const hit = all.match(TELLS_USER_TO_CHECK_A_NUMBER)
      expect(hit, `prompt (${lang}) tells the user to check a number: ${hit?.[0]}`).toBeNull()
    }
  })

  it('no UI copy, dictionary or scam-shield source does either', () => {
    const scan = [
      ...filesUnder(join(ROOT, 'lib', 'i18n')),
      ...filesUnder(join(ROOT, 'app', 'scam-shield')),
      ...filesUnder(join(ROOT, 'app', 'kiem-tra')),
      ...filesUnder(join(ROOT, 'lib', 'scam-shield')),
      ...filesUnder(join(ROOT, 'components')),
      join(ROOT, 'lib', 'ai', 'promptBuilder.ts'),
    ]
    const offenders: string[] = []
    for (const f of scan) {
      let text = ''
      try { text = readFileSync(f, 'utf8') } catch { continue }
      // Only user-facing strings and prompt text matter; the Bộ Công an knowledge base describes
      // scams ("yêu cầu cung cấp tài khoản ngân hàng") and never asks the user to look one up, but
      // it is scanned all the same — the regex requires the instruction shape, not the noun.
      const m = text.match(TELLS_USER_TO_CHECK_A_NUMBER)
      if (m) offenders.push(`${f.replace(ROOT, 'src')}: "${m[0].slice(0, 120)}"`)
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
