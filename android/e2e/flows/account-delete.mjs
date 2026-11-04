// Account deletion (Play "Data deletion" declaration) — runs the branch the UAT server's flag selects:
//   flags.accountSelfDelete = false → «Yêu cầu xóa tài khoản» → confirm → email request (nothing is deleted);
//   flags.accountSelfDelete = true  → «Xóa tài khoản» → type XÓA → «Xóa vĩnh viễn tài khoản» → done screen →
//                                     signed out, and the auth user is really gone (checked with the AUDIT admin API).
// Only a THROWAWAY account created for the run, on the AUDIT database (lib/env.mjs refuses any other project).
// No AI call, no real password typed, no email sent (the mailto is dismissed).
import crypto from 'node:crypto'
import { UAT_BASE, bypassSecret, env } from '../lib/env.mjs'
import { ensureUser, rest } from '../lib/supabase.mjs'

const ROW = /^(Yêu cầu xóa tài khoản|Xóa tài khoản)$/

async function flagOn() {
  const r = await fetch(`${UAT_BASE}/api/config`, { headers: { 'x-vercel-protection-bypass': bypassSecret() } })
  const j = await r.json().catch(() => null)
  return { on: j?.flags?.accountSelfDelete === true, status: r.status }
}

async function adminUserExists(id) {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  })
  return r.status === 200
}

async function adminDeleteUser(id) {
  await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  })
}

export async function android({ a, shot, check }) {
  const flag = await flagOn()
  check(`UAT /api/config đọc được (cờ accountSelfDelete = ${flag.on})`, flag.status === 200)
  const email = `e2e.android.delete.${crypto.randomBytes(4).toString('hex')}@example.com`
  const user = await ensureUser(email, 'E2E Xoá')
  await rest.patch(`profiles?id=eq.${user.id}`, { full_name: 'E2E Xoá', onboarded: true, language: 'vi' })
  await rest.upsert('user_demographics', [{ user_id: user.id, date_of_birth: '1994-06-15', age_declared_at: new Date().toISOString() }], 'user_id')
  try {
    await a.signIn(email)
    await a.tap('Tôi', { after: 2500 })
    await a.scrollTo('Cài đặt')
    await a.tap('Cài đặt', { after: 3500 })
    const row = await a.scrollTo(ROW, { max: 14 })
    shot('settings-delete-row')
    const label = a.texts().find((t) => ROW.test(t)) || ''
    if (!flag.on) {
      check('cờ TẮT: hàng đúng nhãn «Yêu cầu xóa tài khoản» (không phải xoá ngay)', label === 'Yêu cầu xóa tài khoản', label)
      await a.tap(row, { after: 2500 })
      shot('request-dialog')
      check('cờ TẮT: hộp «Yêu cầu xóa tài khoản?» nói bộ phận hỗ trợ xác minh, KHÔNG có ô gõ XÓA',
        a.visible('Yêu cầu xóa tài khoản?') && !a.find(/Xóa vĩnh viễn tài khoản/))
      // «Tiếp tục» opens a mailto (no email app on the emulator → the app's own toast). Nothing is sent.
      await a.tap('Tiếp tục', { after: 3000 })
      shot('request-continue')
      await a.dismissForeign(); await a.launch()
      const stillThere = await adminUserExists(user.id)
      check('cờ TẮT: bấm «Tiếp tục» KHÔNG xoá gì — tài khoản vẫn còn', stillThere)
    } else {
      check('cờ BẬT: hàng đổi nhãn «Xóa tài khoản»', label === 'Xóa tài khoản', label)
      await a.tap(row, { after: 2500 })
      shot('delete-dialog')
      // R29 text: the lead sentence, the plan line (generic when the app does not know a paid plan; the test account is free → none), the lists.
      check('cờ BẬT: hộp có chữ R29 «Xóa tài khoản vĩnh viễn? … bị xóa ngay và không thể khôi phục…» + danh sách dữ liệu bị xoá', !!a.find(/Xóa tài khoản vĩnh viễn\?/) && !!a.find(/Việc xóa sẽ loại bỏ vĩnh viễn/))
      // The typed field sits BELOW the lists (the dialog body scrolls): reach it, focus it, type the word.
      for (let k = 0; k < 8 && !a.find(/Gõ .* để xác nhận/); k++) { a.sh('input', 'swipe', '540', '1300', '540', '600', '400'); await a.sleep(700) }
      check('cờ BẬT: có ô «Gõ XÓA để xác nhận.»', !!a.find(/Gõ .* để xác nhận/))
      await a.tap(a.find(/Gõ .* để xác nhận/), { after: 800 })
      await a.pasteText('XÓA')
      await a.hideKeyboard()
      await a.sleep(800)
      shot('delete-typed')
      await a.tap('Xóa vĩnh viễn tài khoản', { after: 9000 })
      shot('delete-done')
      check('cờ BẬT: màn «Tài khoản của bạn đã được xóa»', a.visible('Tài khoản của bạn đã được xóa'))
      await a.tap('Về trang chủ', { after: 4000 })
      shot('after-delete')
      await a.tap('Tôi', { after: 3000 })
      check('cờ BẬT: đã đăng xuất (tab Tôi hỏi đăng nhập)', a.visible('Đăng nhập để lưu lại'))
      check('cờ BẬT: người dùng thật sự biến mất khỏi Auth (admin API AUDIT)', !(await adminUserExists(user.id)))
    }
  } finally {
    await adminDeleteUser(user.id).catch(() => {})
  }
}

// Web twin: the public page that the Play declaration links to.
export async function web({ w, page, shot, check }) {
  const flag = await flagOn()
  await w.go('/delete-account', 4000)
  await shot('delete-account-page', true)
  const t = await page.locator('body').innerText()
  check('/delete-account tải được và nói về xoá tài khoản', /xóa tài khoản|delete/i.test(t))
  check(`/delete-account khớp cờ (${flag.on ? 'BẬT: nói xoá ngay trong app' : 'TẮT: nói gửi yêu cầu'})`,
    flag.on ? /XÓA|ngay|immediately|Delete account/i.test(t) : /Yêu cầu xóa tài khoản|Request account deletion/i.test(t))
}
