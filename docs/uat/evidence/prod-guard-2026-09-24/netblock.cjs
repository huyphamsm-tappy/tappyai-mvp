// Network tripwire for the startup-guard test. Loaded via NODE_OPTIONS=--require in EVERY
// node process of the run (parent CLI + forked server). Logs every socket connect / DNS
// lookup / fetch, and BLOCKS anything that is not loopback or a local IPC pipe, so the test
// can never reach any remote host — production included — even if the guard were broken.
const fs = require('fs')
const net = require('net')
const dns = require('dns')
const LOG = process.env.NETLOG
const log = (kind, target, blocked) => {
  try { fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), pid: process.pid, kind, target, blocked }) + '\n') } catch {}
}
const isLoop = (h) => h == null || h === '' || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h === '::'

log('preload', process.argv.slice(1, 3).join(' '), false)

const origConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  let host, port, path
  const a0 = Array.isArray(args[0]) ? args[0][0] : args[0]
  if (a0 && typeof a0 === 'object') { host = a0.host; port = a0.port; path = a0.path }
  else if (typeof a0 === 'string' && isNaN(Number(a0))) { path = a0 }
  else { port = a0; host = typeof args[1] === 'string' ? args[1] : undefined }
  if (path) { log('ipc', String(path).slice(-60), false); return origConnect.apply(this, args) }
  const target = `${host ?? 'localhost'}:${port}`
  if (isLoop(host)) { log('connect-loopback', target, false); return origConnect.apply(this, args) }
  log('connect-REMOTE', target, true)
  throw new Error(`netblock: remote connect blocked -> ${target}`)
}

const origLookup = dns.lookup
dns.lookup = function (hostname, ...rest) {
  if (isLoop(hostname)) return origLookup.call(this, hostname, ...rest)
  log('dns-REMOTE', hostname, true)
  const cb = rest.find((r) => typeof r === 'function')
  const err = Object.assign(new Error(`netblock: dns blocked -> ${hostname}`), { code: 'ENOTFOUND' })
  if (cb) process.nextTick(() => cb(err)); else throw err
}
if (dns.promises && dns.promises.lookup) {
  const origP = dns.promises.lookup
  dns.promises.lookup = async (hostname, ...rest) => {
    if (isLoop(hostname)) return origP(hostname, ...rest)
    log('dns-REMOTE(promise)', hostname, true)
    throw Object.assign(new Error(`netblock: dns blocked -> ${hostname}`), { code: 'ENOTFOUND' })
  }
}
if (typeof globalThis.fetch === 'function') {
  const origFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input)
    let host = ''; try { host = new URL(url).hostname } catch {}
    if (isLoop(host)) return origFetch(input, init)
    log('fetch-REMOTE', url.slice(0, 120), true)
    throw new Error(`netblock: fetch blocked -> ${host}`)
  }
}
