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
  { id: 'pho-q3', turns: ['quán phở ngon quận 3'], expect: /grab\.com|google\.|maps|zalo\.me/ },
  { id: 'pho-q1', turns: ['quán phở ngon quận 1'], expect: /grab\.com|google\.|maps|zalo\.me/ },
  { id: 'pho-delivery', turns: ['đặt phở giao tận nhà quận 1'], expect: /grab\.com|shopeefood|google\.|maps|zalo\.me/ },
  { id: 'headphones', turns: ['tai nghe bluetooth dưới 1 triệu'], expect: /shopee|lazada|tiki|cellphones|thegioididong|fptshop/ },
  { id: 'snacks-then-q1', turns: ['mua đồ ăn vặt', 'tối nay đi đâu chơi quận 1'], expect: /google\.|maps|grab|shopee|lazada|ticketbox|\.vn|\.com/ },
  { id: 'concert', turns: ['vé concert tháng 10'], expect: /ticketbox|ticketgo|vebo|google\./ },
  { id: 'flight', turns: ['vé máy bay đi Đà Nẵng'], expect: /traveloka|trip\.com|vietjet|vietnamairlines|bambooairways|agoda|booking|google\./ },
  { id: 'hotel', turns: ['khách sạn Đà Lạt cuối tuần'], expect: /booking\.com|agoda|traveloka|trip\.com|google\./ },
  // R14 (chatSessionId): the follow-up «xem thêm» carries no topic of its own — the server's state
  // for this chat must keep it on phở in District 1.
  { id: 'followup-more', turns: ['quán phở ngon quận 1', 'xem thêm'], expect: /grab\.com|google\.|maps|zalo\.me/, mustMention: /phở/i },
  { id: 'trip', turns: ['đi du lịch Đà Nẵng 3 ngày 2 đêm'], expect: /booking\.com|agoda|traveloka|trip\.com|vexere|grab|xanhsm|google\./, plan: true },
  // Every fact given up front, so the consult has nothing left to ask: the plan card + its share.
  { id: 'trip-full', turns: ['Lên kế hoạch đi Đà Nẵng 3 ngày 2 đêm tuần sau cho 2 người, ngân sách 10 triệu, bay từ TP.HCM, thích biển và ăn hải sản'], expect: /booking\.com|agoda|traveloka|trip\.com|vexere|grab|xanhsm|google\./, plan: true, share: true },
]

// E2E_CASES=trip,hotel runs a subset (debugging); the final pass runs all.
const ONLY = (process.env.E2E_CASES || '').split(',').filter(Boolean)
const cases = () => (ONLY.length ? CASES.filter((c) => ONLY.includes(c.id)) : CASES)
// Consult V2: a plan is written only when the user ACCEPTS it (server button).
const ACCEPT_PLAN = 'Lên kế hoạch chi tiết'

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
/** Consult V2 ASK questions ([TAPPY_ASK], web AskCard / Android AskCard). */
const askOf = (raw) => {
  const m = raw.match(/\[TAPPY_ASK\]([\s\S]*?)\[\/TAPPY_ASK\]/)
  try { return (JSON.parse(m[1]).questions || []).filter((q) => Array.isArray(q.options) && q.options.length >= 2) } catch { return [] }
}
const strip = (s) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim() // a label's leading emoji

/** Raw content of the last assistant message in the user's newest conversation containing [prompt]. */
let caseStart = 0 // conversations older than the running case are someone else's answer (an earlier run)
async function lastReply(email, prompt) {
  const api = await asUser(email)
  for (let i = 0; i < 8; i++) {
    const r = await api('/api/conversations')
    const conv = (r.json || []).find((c) => Date.parse(c.updated_at || 0) >= caseStart && (c.messages || []).some((m) => m.role === 'user' && (m.content || '').includes(prompt)))
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
  // A permission prompt left over (pm grant normally prevents it) would swallow the send.
  const allow = a.find(/^(While using the app|Khi dùng ứng dụng)$/)
  if (allow) await a.tap(allow, { after: 1500 })
  // The emulator's software-GPU ANR (§ANR: main thread drawing text) — answer "Wait", never close.
  for (let k = 0; k < 3 && a.find(/isn.t responding/); k++) { const w = a.find('Wait'); if (w) await a.tap(w, { after: 3000 }) }
  // The paste can be lost right after a (re)launch: check the box holds the text, paste again if not.
  for (let k = 0; k < 3; k++) {
    await a.tap('Nhắn tin cho Tappy…', { after: 500 }).catch(() => {})
    await a.pasteText(text)
    if (a.find(text) || a.texts().some((t) => t.includes(text.slice(0, 12)))) break
    await a.sleep(1500)
  }
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
  // Chat asks for location on the first send (the reply is biased to where the phone is). Grant it
  // and put the emulator in District 1, Sài Gòn, like a user who tapped "While using the app".
  for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) a.sh('pm', 'grant', a.PKG, `android.permission.${p}`)
  a.adb(['emu', 'geo', 'fix', '106.7009', '10.7769'], { allowFail: true })
  await a.signIn(email)
  for (const c of cases()) {
    caseStart = Date.now() - 5000
    await a.launch({ fresh: true })
    await a.tap('Chat', { after: 3000 })
    let raw = ''
    for (const [i, prompt] of c.turns.entries()) {
      await send(a, prompt)
      const s = await settle(a, shot, `${c.id}-t${i + 1}`)
      await a.hideKeyboard()
      raw = await lastReply(email, prompt)
      // A reply that lands inside one poll (~2.5 s after send: canned / clarify turns) has no
      // visible "searching" phase to catch; it still has to have ARRIVED.
      check(`${c.id} t${i + 1}: trả lời xong${s.sawProgress ? ', thấy trạng thái đang tìm/đang viết' : ' (nhanh, không có pha tìm kiếm)'}`, s.sawProgress || (!!raw && s.secs <= 15), `${s.secs} s`)
      // A clarify turn: one tap on the first quick reply continues the consultation.
      // ASK card (server honours x-tappy-caps: ask, R10): the first option of each question, then Gửi.
      if (!ctaOf(raw).length && askOf(raw).length && i === c.turns.length - 1) {
        for (let k = 0; k < 8 && !a.find('Hoặc gõ thêm ý khác…'); k++) { a.swipe('up'); await a.sleep(700) }
        const qs = askOf(raw)
        const picked = []
        for (const q of qs) { const n = a.find(q.options[0]); if (n) { await a.tap(n, { after: 500 }); picked.push(q.options[0]) } }
        shot(`${c.id}-ask-picked`)
        const send = a.dump().find((n) => n.text === 'Gửi' && n.clickable !== undefined)
        check(`${c.id}: thẻ hỏi nhanh có ${qs.length} câu, chọn được ${picked.length}, có nút Gửi`, picked.length === qs.length && !!send, picked.join(' · '))
        if (send) {
          await a.tap(send, { after: 3000 })
          const s2 = await settle(a, shot, `${c.id}-ask`)
          await a.hideKeyboard()
          check(`${c.id}: gửi câu trả lời → Tappy trả lời tiếp`, s2.secs < 180)
          raw = (await lastReply(email, picked.join(' · '))) || raw
        }
      } else if (!ctaOf(raw).length && followupsOf(raw).length && !/\[TAPPY_PLAN\]/.test(raw) && !followupsOf(raw).includes(ACCEPT_PLAN) && i === c.turns.length - 1) {
        const chips = followupsOf(raw)
        const chip = chips[0]
        // Chips sit in a horizontal row at the end of the reply: reach the row, then scroll it.
        for (let k = 0; k < 8 && !a.find(chip) && !chips.some((x) => a.find(x)); k++) { a.swipe('up'); await a.sleep(700) }
        const node = a.find(chip) || await a.scrollRowTo(chip, new RegExp(chips.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))).catch(() => null)
        check(`${c.id}: câu hỏi làm rõ có nút trả lời một chạm «${chip}»`, !!node)
        if (node) {
          await a.tap(node, { after: 3000 })
          const s2 = await settle(a, shot, `${c.id}-chip`)
          check(`${c.id}: bấm nút trả lời → Tappy trả lời tiếp`, s2.secs < 180)
          raw = await lastReply(email, chip) || raw
        }
      }
    }
    // Plan case: accept the plan the way a user does — the server's "Lên kế hoạch chi tiết" chip.
    if (c.plan && !/\[TAPPY_PLAN\]/.test(raw)) {
      for (let k = 0; k < 10 && !a.find(ACCEPT_PLAN); k++) { a.swipe('up'); await a.sleep(700) }
      const acc = a.find(ACCEPT_PLAN)
      check(`${c.id}: có nút «${ACCEPT_PLAN}»`, !!acc)
      if (acc) {
        await a.tap(acc, { after: 3000 })
        await settle(a, shot, `${c.id}-accept`)
        await a.hideKeyboard()
        raw = (await lastReply(email, ACCEPT_PLAN)) || raw
      }
    }
    if (c.mustMention) {
      const prose = raw.replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/g, '')
      check(`${c.id}: lượt cuối vẫn đúng chủ đề (${c.mustMention})`, c.mustMention.test(prose), prose.slice(0, 120).replace(/\n/g, ' '))
    }
    shot(`${c.id}-done`)
    // Read the whole reply on screen: the app shows a finished reply from its TOP, so read downward.
    await a.hideKeyboard()
    const seen = new Set()
    for (let k = 0; k < 12; k++) { a.texts().forEach((t) => seen.add(t)); a.swipe('up'); await a.sleep(700) }
    a.texts().forEach((t) => seen.add(t))
    const lint = screenLint([...seen])
    check(`${c.id}: không có ** / marker / URL thô / link dính / khoảng trắng lạ trên màn hình`, !lint.bold && !lint.marker && !lint.url && !lint.spaces && !lint.glued,
      JSON.stringify(lint).slice(0, 160))
    const buttons = ctaOf(raw)
    const hosts = buttons.map((b) => unwrap(b.url))
    check(`${c.id}: nút đặt/mua dẫn đúng loại trang`, buttons.length === 0 || hosts.some((h) => c.expect.test(h)), hosts.join(', ') || '(không có nút — xem ảnh)')
    if (c.plan) check(`${c.id}: có thẻ kế hoạch`, /\[TAPPY_PLAN\]/.test(raw) && [...seen].some((t) => /Chia sẻ lịch trình|Ngày 1/.test(t)))
    // Tap the first đặt/mua/xem button ACTUALLY on screen and prove where it goes. A model CTA that
    // duplicates a place-card action is dropped by design (ctaButtonsOutsideCards, web parity), so
    // the candidates are: the CTA labels still shown, then the card's own action buttons.
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const shownCta = buttons.map((b) => strip(b.label)).filter((l) => seen.has(l) || [...seen].some((t) => t.endsWith(l)))
    // Button labels are short and never questions ("Đặt cho mấy người? (…)" is an ASK line, not a button).
    const ACTION = /^(Tìm trên [^?()]{2,40}|Đặt [^?()]{2,40}|Mua [^?()]{2,40}|Xem trên [^?()]{2,40}|Đặt ngay|Đặt chỗ|Đặt bàn|Mua vé|Xem bản đồ|Bản đồ)$/
    const cardAction = [...seen].find((t) => ACTION.test(t))
    const label = shownCta[0] || cardAction
    if (label) {
      const node = await a.scrollTo(new RegExp('^\\W*' + esc(label) + '$'), { max: 8 }).catch(() => null)
      if (node) {
        a.clearLog()
        await a.tap(node, { after: 4000 })
        const log = a.adb(['logcat', '-d', '-s', 'ActivityTaskManager:I'], { allowFail: true }) || ''
        const dat = (log.match(/act=android\.intent\.action\.VIEW dat=(\S+)/) || [])[1] || ''
        shot(`${c.id}-cta-opened`)
        // logcat truncates the URL after the host ("https://go.isclix.com/..."): behind the affiliate
        // wrapper the merchant is the one the button names ("Tìm trên Lazada").
        const host = unwrap(dat) || dat
        const ok = !!dat && (c.expect.test(host) || (/isclix|accesstrade|atrk/.test(host) && c.expect.test(label.toLowerCase())))
        check(`${c.id}: bấm «${label}» mở đúng loại trang`, ok, dat.slice(0, 90))
        await a.dismissForeign(); await a.launch()
      } else check(`${c.id}: bấm được nút «${label}»`, false)
    } else check(`${c.id}: có nút đặt/mua/xem trên màn hình`, buttons.length === 0 && !/\[TAPPY_PLAN\]/.test(raw), '(câu trả lời không có nút — xem ảnh)')
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
  for (const c of cases()) {
    caseStart = Date.now() - 5000
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
    // The web keeps the same conversation server-side: its CTA block + every link on the page.
    let raw = await lastReply(webAccount, c.turns[c.turns.length - 1])
    // Consult V2 ASK card: the first option of each question, then Gửi (same as Android).
    const qs = askOf(raw)
    const chips = followupsOf(raw)
    if (!ctaOf(raw).length && qs.length) {
      const picked = []
      for (const q of qs) {
        const b = page.locator(`[data-ask-option="${q.id}"]`).first()
        if (await b.count()) { await b.click(); picked.push(q.options[0]) }
      }
      await shot(`${c.id}-ask-picked`)
      check(`${c.id}: web thẻ hỏi nhanh ${qs.length} câu, chọn được ${picked.length}`, picked.length === qs.length, picked.join(' · '))
      await page.locator('[data-ask-send]').last().click().catch(() => {})
      await page.waitForTimeout(4000)
      await page.waitForFunction(() => !document.querySelector('[aria-label*="Dừng"],[aria-label*="Stop"]'), null, { timeout: 180000 }).catch(() => {})
      await page.waitForTimeout(2000)
      raw = (await lastReply(webAccount, picked.join(' · '))) || raw
    } else if (!ctaOf(raw).length && chips.length && !chips.includes(ACCEPT_PLAN) && !c.plan) {
      const chip = page.getByText(chips[0], { exact: true }).last()
      const had = await chip.count()
      check(`${c.id}: web câu hỏi làm rõ có nút «${chips[0]}»`, had > 0)
      if (had) {
        await chip.click()
        await page.waitForTimeout(4000)
        await page.waitForFunction(() => !document.querySelector('[aria-label*="Dừng"],[aria-label*="Stop"]'), null, { timeout: 180000 }).catch(() => {})
        await page.waitForTimeout(2000)
        raw = (await lastReply(webAccount, chips[0])) || raw
      }
    }
    if (c.plan && !/\[TAPPY_PLAN\]/.test(raw)) {
      const acc = page.getByText(ACCEPT_PLAN, { exact: true }).last()
      const has = await acc.count()
      check(`${c.id}: web có nút «${ACCEPT_PLAN}»`, has > 0)
      if (has) {
        await acc.click()
        await page.waitForTimeout(4000)
        await page.waitForFunction(() => !document.querySelector('[aria-label*="Dừng"],[aria-label*="Stop"]'), null, { timeout: 180000 }).catch(() => {})
        await page.waitForTimeout(2000)
        raw = (await lastReply(webAccount, ACCEPT_PLAN)) || raw
        check(`${c.id}: web có thẻ kế hoạch`, /\[TAPPY_PLAN\]/.test(raw))
      }
    }
    await shot(`${c.id}-done`)
    const t = await page.locator('body').innerText().catch(() => '')
    check(`${c.id}: web không có ** / marker`, !/\*\*|\[\/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]/.test(t))
    const hrefs = await page.locator('a[href^="http"]').evaluateAll((as) => as.map((x) => x.href)).catch(() => [])
    const hosts = [...ctaOf(raw).map((b) => unwrap(b.url)), ...hrefs.map(unwrap)].filter((h) => h && !/tappyai\.com$/.test(h))
    check(`${c.id}: web nút/đường dẫn đúng loại trang`, hosts.some((h) => c.expect.test(h)), [...new Set(hosts)].slice(0, 6).join(', '))
  }
}
