// (i) Sharing an Explore clip hands the real FILE (video/photo) to the system share sheet; picking
// Zalo or TikTok there delivers it — proven with stand-in apps under the real package names
// (android/e2e/share-stub), which log exactly what they received. Opening the real apps is left to
// the owner's phone. Web twin: the clip's share menu (tiles + copy).
export const webAccount = 'e2e.android.pro@example.com'

export async function android({ a, shot, check, seeded }) {
  a.installShareStubs()
  await a.signIn(seeded.users.pro.email)
  for (const [label, pkg] of [['E2E TikTok', 'com.zhiliaoapp.musically'], ['E2E Zalo', 'com.zing.zalo']]) {
    await a.tap('Khám phá', { after: 5000 })
    a.clearLog()
    // The clip's real file is fetched first (a video can take a while), THEN the system sheet opens.
    await a.tap('Chia sẻ', { after: 1500 })
    const t0 = Date.now()
    while (Date.now() - t0 < 90000 && !a.foreground().includes('intentresolver') && !a.foreground().includes('Chooser')) await a.sleep(1500)
    await a.sleep(2000)
    shot(`sheet-${label}`)
    const sheet = a.texts().join(' | ')
    check(`share sheet hệ thống mở với 1 FILE (${label})`, /Sharing 1 file|Chia sẻ 1 tệp/.test(sheet) && /\.(mp4|jpg|jpeg|png|webp)/.test(sheet), sheet.slice(0, 120))
    const target = await a.scrollTo(label, { max: 6 }).catch(() => null)
    check(`${label} có trong share sheet`, !!target)
    if (!target) { await a.back(); continue }
    await a.tap(target, { after: 4000 })
    const got = a.receivedShares().find((s) => s.receiver === pkg)
    shot(`received-${label}`)
    check(`${label} nhận ACTION_SEND`, got?.action === 'android.intent.action.SEND', JSON.stringify(got || {}).slice(0, 160))
    check(`${label} nhận FILE (video/ảnh), đọc được`, !!got && /^(video|image)\//.test(got.streamMime || got.type || '') && got.streamBytes > 10000, got ? `${got.streamMime} ${got.streamBytes}B` : '')
    check(`${label} nhận kèm link bài (text)`, !!got?.text && /https:\/\/uat\.tappyai\.com\/reviews\//.test(got.text), got?.text?.slice(0, 80))
    await a.launch()
  }
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
