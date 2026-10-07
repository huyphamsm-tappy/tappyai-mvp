// (f) The 18+ gate is the D:/redesign screen (Ngày / Tháng / Năm) = web /age-check, for an ACCOUNT
// without a date of birth: "Gợi ý cho bạn" asks it instead of failing, and after "Tiếp tục" the
// page loads. The seed clears the date of birth of e2e.android.nodob before every run.
export const webAccount = 'e2e.android.nodob@example.com'
import { rest, readAccounts } from '../lib/supabase.mjs'
/** Each platform starts from "no date of birth" (the Android half sets one). */
const clearDob = () => rest.del(`user_demographics?user_id=eq.${readAccounts()['e2e.android.nodob@example.com'].id}`)

/** Opens one of the three date dropdowns and picks [value], scrolling inside the menu. */
async function fill(a, placeholder, value) {
  await a.tap(a.find(placeholder) || placeholder, { after: 900 })
  for (let i = 0; i < 25; i++) {
    const nodes = a.dump()
    const hit = nodes.find((n) => n.text === value && n.y1 > 150 && n.y2 < 2250)
    if (hit) { await a.tap(hit, { after: 800 }); return }
    const nums = nodes.filter((n) => /^\d{2,4}$/.test(n.text))
    if (nums.length < 2) throw new Error(`menu for ${placeholder} not open`)
    const first = nums[0], last = nums[nums.length - 1]
    // Menu values run ascending (days, months) or descending (years): scroll toward [value].
    const forward = Number(value) > Number(last.text) === (Number(last.text) > Number(first.text))
    const x = String(Math.round((first.x1 + first.x2) / 2))
    if (forward) a.sh('input', 'swipe', x, String(last.y1), x, String(first.y1), '500')
    else a.sh('input', 'swipe', x, String(first.y1), x, String(last.y1), '500')
    await a.sleep(700)
  }
  throw new Error(`could not pick ${value} for ${placeholder}`)
}

export async function android({ a, shot, check, seeded }) {
  await clearDob()
  await a.signIn(seeded.users.nodob.email)
  await a.tap('Trang chủ', { after: 2000 })
  await a.scrollTo('Gợi ý địa điểm du lịch')
  await a.tap('Gợi ý địa điểm du lịch', { after: 6000 })
  shot('recommendations-asks-18')
  check('"Gợi ý cho bạn" mở màn 18+ thay vì báo lỗi', a.visible('Xác nhận bạn đủ 18 tuổi') || (a.visible(/Xác nhận bạn/) && a.visible('đủ 18 tuổi')) || a.visible(/Xác nhận bạn đủ 18 tuổi/))
  check('không còn "Không tải được"', !a.visible('Không tải được'))
  check('có 3 ô Ngày / Tháng / Năm', a.visible('Ngày') && a.visible('Tháng') && a.visible('Năm'))
  check('có hộp "Ngày sinh của bạn được giữ riêng tư"', a.visible('Ngày sinh của bạn được giữ riêng tư'))
  // An invalid date first: the web's error sentence.
  await fill(a, 'DD', '31'); await fill(a, 'MM', '02'); await fill(a, 'YYYY', '1994')
  await a.tap('Tiếp tục', { after: 1500 })
  shot('invalid-date')
  check('ngày không hợp lệ → "Ngày sinh không hợp lệ. Vui lòng kiểm tra lại."', a.visible('Ngày sinh không hợp lệ. Vui lòng kiểm tra lại.'))
  check('ô chọn dạng dropdown như mockup (DD ▾)', a.visible('31') && a.visible('02'))
  await fill(a, '31', '15')
  await a.sleep(600)
  await a.tap('Tiếp tục', { after: 7000 })
  shot('after-continue')
  check('sau "Tiếp tục": trang Gợi ý cho bạn tải được', a.visible(/Gợi ý cho bạn/) && !a.visible(/Xác nhận bạn/))
}

export async function web({ w, page, shot, check }) {
  await clearDob()
  await w.go('/recommendations', 6000)
  await shot('recommendations-asks-18', true)
  check('/recommendations đưa sang /age-check', new URL(page.url()).pathname === '/age-check')
  const selects = page.locator('select')
  await selects.nth(0).selectOption({ label: '15' }).catch(() => selects.nth(0).selectOption('15'))
  await selects.nth(1).selectOption({ label: '06' }).catch(() => selects.nth(1).selectOption('6'))
  await selects.nth(2).selectOption({ label: '1994' }).catch(() => selects.nth(2).selectOption('1994'))
  await shot('filled', true)
  await page.getByText('Tiếp tục').first().click()
  await page.waitForTimeout(6000)
  await shot('after-continue', true)
  check('sau "Tiếp tục": quay lại trang gợi ý', new URL(page.url()).pathname !== '/age-check')
}
