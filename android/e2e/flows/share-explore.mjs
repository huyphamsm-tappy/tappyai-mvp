// (i) Sharing an Explore post goes through the approved sheet #6 (share layouts, owner 29/09): the
// file-taking apps (TikTok) get the ONE card file — proven in share-cards, incl. an uploaded clip going as
// its own video — and the link-only apps (Zalo, Facebook, Messenger: LINK_ONLY_TARGETS) get the post's
// LINK. Here: Zalo from Explore, via the stand-in app under the real package (android/e2e/share-stub),
// which logs exactly what it received. Opening the real apps is left to the owner's phone.
export const webAccount = 'e2e.android.pro@example.com'

/** Scroll INSIDE the bottom sheet: up only — a downward drag at its top would dismiss the sheet. */
async function sheetScrollTo(a, q, max = 8) {
  for (let i = 0; i <= max; i++) {
    const n = a.find(q)
    if (n && n.y1 > 200 && n.y2 < 2150) return n
    a.sh('input', 'swipe', '540', '1700', '540', '900', '500'); await a.sleep(900)
  }
  return null
}

export async function android({ a, shot, check, seeded }) {
  a.installShareStubs()
  await a.signIn(seeded.users.pro.email)
  await a.tap('Khám phá', { after: 5000 })
  a.clearLog()
  await a.tap('Chia sẻ', { after: 4000 })
  shot('sheet')
  check('Khám phá → «Chia sẻ» mở sheet mẫu #6', a.visible('Chia sẻ với mọi người'))
  const zalo = await sheetScrollTo(a, /^Zalo$/)
  check('sheet có ô Zalo', !!zalo)
  if (!zalo) return
  await a.tap(zalo, { after: 4000 })
  let got = null
  for (let i = 0; i < 15 && !got; i++) { got = a.receivedShares().find((r) => r.receiver === 'com.zing.zalo'); if (!got) await a.sleep(1000) }
  shot('received-zalo')
  check('Zalo nhận ACTION_SEND', got?.action === 'android.intent.action.SEND', JSON.stringify(got || {}).slice(0, 160))
  check('Zalo nhận LINK bài (ứng dụng chỉ-link — không gửi file)', !!got?.text && /https:\/\/uat\.tappyai\.com\/reviews\//.test(got.text), got?.text?.slice(0, 80))
  await a.launch()
}

export async function web({ w, page, shot, check }) {
  await w.go('/reviews', 6000)
  await shot('explore')
  const share = page.getByRole('button', { name: /Chia sẻ|Share/ }).first()
  await share.click().catch(() => {})
  await page.waitForTimeout(2500)
  await shot('share-menu')
  const t = await page.locator('body').innerText()
  check('menu chia sẻ có Zalo / Facebook / TikTok', /Zalo/.test(t) && /Facebook/.test(t) && /TikTok/.test(t))
}
