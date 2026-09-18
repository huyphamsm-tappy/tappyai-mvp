// TappyAI browser extension — service worker (Manifest V3).
//
// What it does: registers four context-menu items and, when one is clicked,
// opens ONE TappyAI tab for the thing that was right-clicked. That is the
// whole behaviour.
//
// What it deliberately does NOT do:
//   · no content script, no tabs/history/webNavigation permission — the
//     extension cannot see what you browse; it only receives the selection,
//     link or page URL that Chrome hands to the menu click handler.
//   · no storage of anything it is given: the URL is built and opened, then
//     forgotten.
//   · no network request of its own: the web app is opened in a tab, the
//     same as typing the address.
import { readSettings } from './src/settings.js'
import { MENU, destinationFor } from './src/menu.js'

function installMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.askSelection, title: chrome.i18n.getMessage('menuAskSelection'), contexts: ['selection'] })
    chrome.contextMenus.create({ id: MENU.askPage, title: chrome.i18n.getMessage('menuAskPage'), contexts: ['page'] })
    chrome.contextMenus.create({ id: MENU.checkLink, title: chrome.i18n.getMessage('menuCheckLink'), contexts: ['link'] })
    chrome.contextMenus.create({ id: MENU.checkPage, title: chrome.i18n.getMessage('menuCheckPage'), contexts: ['page'] })
  })
}

chrome.runtime.onInstalled.addListener(installMenus)
chrome.runtime.onStartup.addListener(installMenus)

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const settings = await readSettings()
  const url = destinationFor(info.menuItemId, info, tab, settings)
  if (url) chrome.tabs.create({ url })
})
