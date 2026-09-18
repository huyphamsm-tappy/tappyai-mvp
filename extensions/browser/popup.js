// TappyAI popup. Reads the ACTIVE tab's url/title (granted by 'activeTab'
// only for the moment the person opens the popup) and offers three ways into
// TappyAI. Nothing is read until the popup opens; nothing is stored.
import { askUrl, askAboutPageUrl, scamCheckUrl, homeUrl, forwardablePageUrl } from './src/links.js'
import { readSettings, writeLang } from './src/settings.js'

const $ = (id) => document.getElementById(id)

function applyI18n() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = chrome.i18n.getMessage(el.dataset.i18n)
  $('q').placeholder = chrome.i18n.getMessage('popupAskPlaceholder')
}

async function activeTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab ?? null
  } catch { return null }
}

function open(url) {
  if (!url) return
  chrome.tabs.create({ url })
  window.close()
}

async function main() {
  applyI18n()
  const settings = await readSettings()
  const opts = () => ({ origin: settings.origin, lang: settings.lang })
  $('lang').value = settings.lang
  $('lang').addEventListener('change', async (e) => { settings.lang = e.target.value; await writeLang(settings.lang) })

  const tab = await activeTab()
  const pageUrl = forwardablePageUrl(tab?.url)
  if (pageUrl) {
    const u = new URL(pageUrl)
    $('page-title').textContent = tab.title || u.hostname
    $('page-title').hidden = false
    $('page-host').textContent = u.hostname
    $('page-host').hidden = false
  } else {
    $('not-web').hidden = false
    $('ask-page').disabled = true
    $('check-page').disabled = true
  }

  $('ask').addEventListener('submit', (e) => { e.preventDefault(); open(askUrl($('q').value, opts())) })
  $('ask-page').addEventListener('click', () => open(askAboutPageUrl({ url: tab?.url, title: tab?.title }, opts())))
  $('check-page').addEventListener('click', () => open(scamCheckUrl(tab?.url, opts())))
  $('open').addEventListener('click', () => open(homeUrl(opts())))
  $('q').focus()
}

main()
