// (d) Chat on the REAL UAT brain — the owner's prompts. For every turn: the reply streams (a progress /
// partial state is seen), the finished reply reads clean on screen (no **, no marker, no raw URL, no
// glued links, no run of spaces), the đặt/mua/xem buttons point at the right kind of merchant, and a
// tap on the first one really opens that destination (the VIEW intent, read from logcat). A clarify
// turn is answered with ONE TAP on its first quick-reply chip (consultative flow). The trip plan card
// is shared to Zalo and TikTok (stand-in apps, android/e2e/share-stub). Web twin: /chat, same prompts.
//
// Runs only in the FINAL pass (owner 2026-09-28: real AI calls on UAT only once, at the end).
import { asUser } from '../lib/api.mjs'

export const webAccount = 'e2e.android.pro@example.com'

// expect: which merchant hosts a đặt/mua button may lead to (affiliate wrappers are unwrapped first).
const CASES = [
  { id: 'saigon-tonight', turns: ['tối nay có chỗ nào đi chơi ở sài gòn ko'], expect: /google\.|maps|ticketbox|grab|facebook|\.vn|\.com/ },
  { id: 'pho-q3', turns: ['quán phở ngon quận 3'], expect: /grab\.com|google\.|maps/ },
  { id: 'pho-q1', turns: ['quán phở ngon quận 1'], expect: /grab\.com|google\.|maps/ },
  { id: 'pho-delivery', turns: ['đặt phở giao tận nhà quận 1'], expect: /grab\.com|shopeefood|google\.|maps/ },
  { id: 'headphones', turns: ['tai nghe bluetooth dưới 1 triệu'], expect: /shopee|lazada|tiki|cellphones|thegioididong|fptshop/ },
  { id: 'snacks-then-q1', turns: ['mua đồ ăn vặt', 'tối nay đi đâu chơi quận 1'], expect: /google\.|maps|grab|shopee|lazada|ticketbox|\.vn|\.com/ },
  { id: 'concert', turns: ['vé concert tháng 10'], expect: /ticketbox|ticketgo|vebo|google\./ },
  { id: 'flight', turns: ['vé máy bay đi Đà Nẵng'], expect: /traveloka|trip\.com|vietjet|vietnamairlines|bambooairways|agoda|booking|google\./ },
  { id: 'hotel', turns: ['khách sạn Đà Lạt cuối tuần'], expect: /booking\.com|agoda|traveloka|trip\.com|google\./ },
  { id: 'trip', turns: ['đi du lịch Đà Nẵng 3 ngày 2 đêm'], expect: /booking\.com|agoda|traveloka|trip\.com|vexere|grab|xanhsm|google\./, plan: true, share: true },
]

const unwrap = (u) => {
  try {
    const x = new URL(u)
    const inner = x.searchParams.get('url') || x.searchParams.get('u')
    return inner ? new URL(inner).host : x.host
  } catch { return '' }
}
const ctaOf = (raw) => {
  const m = raw.match(/\[CTA_BUTTONS\]\s*(\{[\s\S]*?\})\s*(\[\/CTA_BUTTONS\]|$)/)
  try { return JSON.parse(m[1]).buttons || [] } catch { return [] }
}
const followupsOf = (raw) => (raw.match(/\[FOLLOWUPS\]([^\n]*?)(\[\/FOLLOWUPS\]|\n|$)/g) || [])
  .flatMap((b) => b.replace(/\[\/?FOLLOWUPS\]/g, '').split('|')).map((s) => s.trim()).filter(Boolean)
const strip = (s) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim() // a label's leading emoji

/** Raw content of the last assistant message in the user's newest conversation containing [prompt]. */
async function lastReply(email, prompt) {
  const api = await asUser(email)
  for (let i = 0; i < 8; i++) {
    const r = await api('/api/conversations')
    const conv = (r.json || []).find((c) => (c.messages || []).some((m) => m.role === 'user' && (m.content || '').includes(prompt)))
    const msgs = conv?.messages || []
    const last = [...msgs].reverse().find((m) => m.role === 'assistant')
    if (last && msgs.indexOf(last) > msgs.findLastIndex((m) => m.role === 'user' && (m.content || '').includes(prompt))) return last.content || ''
    await new Promise((res) => setTimeout(res, 2500))
  }
  return ''
}

function screenLint(texts) {
  const joined = texts.join('\n')
  return {
    bold: texts.find((t) => t.includes('**')),
    marker: texts.find((t) => /\[\/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]|\{"[a-z_]+":/.test(t)),
    url: texts.find((t) => /https?:\/\/\S+/.test(t) && t.length > 30),
    spaces: texts.find((t) => /\S {3,}\S/.test(t)),
    glued: /[a-zà-ỹ][A-ZÀ-Ỹ][a-zà-ỹ]+ (Maps|Website)/.test(joined) ? 'glued link text' : null,
  }
}

async function send(a, text) {
  await a.tap('Nhắn tin cho Tappy…', { after: 500 })
  await a.pasteText(text)
  await a.tap('Gửi', { after: 3000 })
}

/** Waits for the turn to finish: the Stop button is gone and the send button is back. */
async function settle(a, shot, label) {
  const t0 = Date.now()
  let sawProgress = false
  while (Date.now() - t0 < 180000) {
    const nodes = a.dump()
    const busy = !!a.find('Dừng', nodes)
    if (busy && !sawProgress) { sawProgress = true; shot(`${label}-streaming`) }
    if (!busy && Date.now() - t0 > 4000) break
    await a.sleep(2500)
  }
  await a.sleep(1500)
  return { sawProgress, secs: Math.round((Date.now() - t0) / 1000) }
}

export async function android({ a, shot, check, seeded }) {
  const email = seeded.users.pro.email
  a.installShareStubs()
  await a.signIn(email)
  for (const c of CASES) {
    await a.launch({ fresh: true })
    await a.tap('Chat', { after: 3000 })
    let raw = ''
    for (const [i, prompt] of c.turns.entries()) {
      await send(a, prompt)
      const s = await settle(a, shot, `${c.id}-t${i + 1}`)
      check(`${c.id} t${i + 1}: trả lời xong, thấy trạng thái đang tìm/đang viết`, s.sawProgress, `${s.secs} s`)
      raw = await lastReply(email, prompt)
      // A clarify turn: one tap on the first quick reply continues the consultation.
      if (!ctaOf(raw).length && followupsOf(raw).length && !c.plan && i === c.turns.length - 1) {
        const chip = followupsOf(raw)[0]
        const node = await a.scrollTo(chip, { max: 4 }).catch(() => null)
        check(`${c.id}: câu hỏi làm rõ có nút trả lời một chạm «${chip}»`, !!node)
        if (node) {
          await a.tap(node, { after: 3000 })
          const s2 = await settle(a, shot, `${c.id}-chip`)
          check(`${c.id}: bấm nút trả lời → Tappy trả lời tiếp`, s2.secs < 180)
          raw = await lastReply(email, chip) || raw
        }
      }
    }
    shot(`${c.id}-done`)
    // Read the whole reply on screen, top to bottom.
    const seen = new Set()
    for (let k = 0; k < 6; k++) { a.texts().forEach((t) => seen.add(t)); a.swipe('down'); await a.sleep(700) }
    const lint = screenLint([...seen])
    check(`${c.id}: không có ** / marker / URL thô / link dính / khoảng trắng lạ trên màn hình`, !lint.bold && !lint.marker && !lint.url && !lint.spaces && !lint.glued,
      JSON.stringify(lint).slice(0, 160))
    const buttons = ctaOf(raw)
    const hosts = buttons.map((b) => unwrap(b.url))
    check(`${c.id}: nút đặt/mua dẫn đúng loại trang`, buttons.length === 0 || hosts.some((h) => c.expect.test(h)), hosts.join(', ') || '(không có nút — xem ảnh)')
    if (c.plan) check(`${c.id}: có thẻ kế hoạch`, /\[TAPPY_PLAN\]/.test(raw) && [...seen].some((t) => /Chia sẻ lịch trình|Ngày 1/.test(t)))
    // Tap the first button and prove where it goes.
    if (buttons.length) {
      const label = strip(buttons[0].label)
      const node = await a.scrollTo(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { max: 6 }).catch(() => null)
      if (node) {
        a.clearLog()
        await a.tap(node, { after: 4000 })
        const log = a.adb(['logcat', '-d', '-s', 'ActivityTaskManager:I'], { allowFail: true }) || ''
        const dat = (log.match(/act=android\.intent\.action\.VIEW dat=(\S+)/) || [])[1] || ''
        shot(`${c.id}-cta-opened`)
        check(`${c.id}: bấm «${label}» mở ${unwrap(buttons[0].url)}`, !!dat && dat.includes(new URL(buttons[0].url).host), dat.slice(0, 90))
        await a.dismissForeign(); await a.launch()
      } else check(`${c.id}: thấy nút «${label}» trên màn hình`, false)
    }
    if (c.share) await sharePlan(a, shot, check, c.id)
  }
}

async function sharePlan(a, shot, check, id) {
  await a.tap('Chat', { after: 2000 })
  for (const [tile, pkg, wantFile] of [['Zalo', 'com.zing.zalo', false], ['TikTok (gửi ảnh)', 'com.zhiliaoapp.musically', true]]) {
    const btn = await a.scrollTo(/Chia sẻ lịch trình/, { max: 8 }).catch(() => null)
    if (!btn) { check(`${id}: nút "Chia sẻ lịch trình"`, false); return }
    await a.tap(btn, { after: 2500 })
    shot(`${id}-sheet-${pkg}`)
    const sheet = a.texts().join(' | ')
    check(`${id}: sheet chia sẻ kế hoạch có Zalo/Facebook/TikTok`, /Zalo/.test(sheet) && /Facebook/.test(sheet) && /TikTok/.test(sheet), sheet.slice(0, 120))
    a.clearLog()
    const t = await a.scrollRowTo(tile, /Zalo|Facebook|Messenger/).catch(() => a.find(tile))
    await a.tap(t, { after: 6000 })
    const got = a.receivedShares().find((s) => s.receiver === pkg)
    shot(`${id}-received-${pkg}`)
    check(`${id}: ${tile} nhận ${wantFile ? 'ẢNH (file)' : 'nội dung'} kế hoạch`, !!got && (wantFile ? /^image\//.test(got.streamMime || got.type || '') && got.streamBytes > 5000 : !!(got.text || got.streamBytes)),
      got ? `${got.type} ${got.streamMime || ''} ${got.streamBytes || 0}B ${(got.text || '').slice(0, 60)}` : 'không nhận gì')
    check(`${id}: ${tile} kèm link kế hoạch UAT`, !!got?.text && /https:\/\/uat\.tappyai\.com\//.test(got.text), (got?.text || '').slice(0, 80))
    await a.dismissForeign(); await a.launch(); await a.tap('Chat', { after: 2000 })
  }
}

export async function web({ w, page, shot, check }) {
  for (const c of CASES) {
    await w.go('/chat', 4000)
    for (const prompt of c.turns) {
      const box = page.getByRole('textbox').last()
      await box.fill(prompt)
      await box.press('Enter')
      await page.waitForTimeout(4000)
      await shot(`${c.id}-streaming`)
      // Done when the stop control is gone.
      await page.waitForFunction(() => !document.querySelector('[aria-label*="Dừng"],[aria-label*="Stop"]'), null, { timeout: 180000 }).catch(() => {})
      await page.waitForTimeout(2000)
    }
    await shot(`${c.id}-done`)
    const t = await page.locator('main').innerText().catch(() => '')
    check(`${c.id}: web không có ** / marker`, !/\*\*|\[\/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]/.test(t))
    const hrefs = await page.locator('main a[href^="http"]').evaluateAll((as) => as.map((x) => x.href)).catch(() => [])
    const hosts = hrefs.map(unwrap)
    check(`${c.id}: web nút/đường dẫn đúng loại trang`, hosts.some((h) => c.expect.test(h)), [...new Set(hosts)].slice(0, 6).join(', '))
  }
}
