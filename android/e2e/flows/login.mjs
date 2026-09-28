// (e) Login card = web /login: Google · Zalo · hoặc · Email · Mật khẩu · Đăng nhập · Tạo tài khoản ·
// Tiếp tục với tư cách Khách. The password path is exercised with a WRONG password (a random string,
// never a real credential): the app must show the web's single refusal sentence (no enumeration
// oracle). A real sign-in is proven everywhere else through the session hook.
import crypto from 'node:crypto'

const WRONG = () => 'x' + crypto.randomBytes(9).toString('hex')

export async function android({ a, shot, check, seeded }) {
  await a.signOut()
  await a.tap('Tôi', { after: 3000 })
  await a.tap('Đăng nhập để lưu lại', { after: 4000 })
  await a.scrollTo('Tiếp tục với tư cách Khách', { max: 6 })
  shot('login-card')
  for (const t of ['Tiếp tục với Google', 'Tiếp tục với Zalo', 'hoặc', 'Email', 'Mật khẩu', 'Đăng nhập', 'Tạo tài khoản', 'Tiếp tục với tư cách Khách']) {
    check(`có "${t}"`, a.visible(t))
  }
  // Paste, never type: the emulator's Vietnamese Telex keyboard rewrites typed ASCII ("ex" → "ẽ").
  await a.tap('Email', { after: 700 })
  await a.pasteText(seeded.users.free.email)
  a.sh('input', 'keyevent', '61') // TAB → the password field
  await a.sleep(500)
  await a.pasteText(WRONG())
  a.sh('input', 'keyevent', '4') // hide the keyboard
  await a.sleep(800)
  await a.scrollTo('Tiếp tục với tư cách Khách', { max: 4 })
  const submit = a.dump().filter((n) => n.text === 'Đăng nhập').pop()
  await a.tap(submit, { after: 6000 })
  shot('wrong-password')
  check('sai mật khẩu → "Email hoặc mật khẩu không đúng."', a.visible('Email hoặc mật khẩu không đúng.'))
  check('mật khẩu bị che (không hiện chữ đã gõ)', !a.texts().some((x) => /^x[0-9a-f]{18}$/.test(x)))

  await a.tap('Tạo tài khoản', { after: 5000 })
  shot('create-account')
  const fg = a.foreground()
  const url = a.sh('dumpsys', 'activity', 'activities').match(/dat=(https:\/\/[^\s}]+)/)?.[1] || ''
  check('"Tạo tài khoản" mở trình duyệt', !fg.includes('com.tappyai.app.staging') || url.includes('/register'), fg.split('/')[0])
  // Back from the browser, the way a person returns: the login card must still be there.
  // (UAT only: Chrome has no Vercel bypass, so /register shows Vercel's own login — ANDROID-PROGRESS.)
  for (let i = 0; i < 4 && !a.foreground().includes('com.tappyai.app'); i++) await a.back()
  await a.sleep(1500)
  check('Back từ trình duyệt → vẫn ở thẻ đăng nhập', a.foreground().includes('com.tappyai.app') && !!a.find(/Tạo tài khoản|Tiếp tục với tư cách Khách|Đăng nhập TappyAI/))

  await a.scrollTo('Tiếp tục với tư cách Khách', { max: 4 })
  await a.tap('Tiếp tục với tư cách Khách', { after: 4000 })
  shot('guest')
  check('"Tiếp tục với tư cách Khách" quay lại app (thanh điều hướng)', a.visible('Trang chủ') && a.visible('Tôi'))
}

export async function web({ w, page, shot, check }) {
  await w.go('/login', 4000)
  await shot('login-card', true)
  const t = await page.locator('body').innerText()
  for (const x of ['Tiếp tục với Google', 'Tiếp tục với Zalo', 'hoặc', 'Email', 'Mật khẩu', 'Đăng nhập', 'Tạo tài khoản', 'Tiếp tục với tư cách Khách']) check(`có "${x}"`, t.includes(x))
  await page.locator('#login-email').fill('e2e.android.free@example.com')
  await page.locator('#login-password').fill(WRONG())
  await page.locator('#login-password').press('Enter')
  await page.waitForTimeout(5000)
  await shot('wrong-password')
  check('sai mật khẩu → "Email hoặc mật khẩu không đúng."', (await page.locator('body').innerText()).includes('Email hoặc mật khẩu không đúng.'))
  await page.getByText('Tạo tài khoản').first().click()
  await page.waitForTimeout(3000)
  await shot('create-account')
  check('"Tạo tài khoản" → /register', new URL(page.url()).pathname === '/register')
}
