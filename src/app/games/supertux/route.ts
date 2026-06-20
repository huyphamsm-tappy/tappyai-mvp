import { readFile } from 'fs/promises'
import { join } from 'path'

// Mobile fixes injected before any game script:
// 1. Viewport meta — without this, iOS/Android use the 980px default virtual viewport inside
//    the iframe; window.innerWidth returns ~980 instead of device width → canvas wrong size,
//    touch coordinates are off by the scale factor.
// 2. touch-action:none on canvas — prevents OS scroll from eating touchmove events before
//    SDL/Emscripten sees them (fixes "swipe scrolls the page instead of controlling game").
// 3. alert() override — navigator.storage.persist() returns false on most iOS visits, which
//    triggers a blocking alert("Your browser denied persistent storage...") that freezes the
//    loading overlay inside the iframe. We redirect storage alerts to console.warn; all other
//    alerts (e.g. WebGL context lost) still block as intended.
// 4. SharedArrayBuffer feature check — if COOP/COEP didn't land (old browser, HTTPS miscfg),
//    the game would hang on a black screen with no message; we show a readable error instead.
const MOBILE_FIXES_SCRIPT = `<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>canvas.emscripten{touch-action:none;-webkit-tap-highlight-color:transparent;}</style>
<script>
(function(){
  // 1. Silence blocking storage alerts — iOS almost always denies persist(), so the original
  //    alert() would fire on every page load and freeze the loading screen inside the iframe.
  var _alert = window.alert;
  window.alert = function(msg) {
    if (String(msg).indexOf('persistent storage') !== -1) {
      console.warn('[ST] storage:', String(msg).substring(0, 140));
      return;
    }
    _alert.call(window, msg);
  };
  // 2. SharedArrayBuffer / cross-origin isolation check — show a readable error instead of
  //    a silent black screen when the browser can't run the WASM threads build.
  if (typeof SharedArrayBuffer === 'undefined' || !self.crossOriginIsolated) {
    document.addEventListener('DOMContentLoaded', function() {
      var s = document.getElementById('status');
      if (s) s.innerHTML = 'Trình duyệt không hỗ trợ <b>SharedArrayBuffer</b>.<br>Vui lòng dùng Chrome ≥ 67 hoặc Safari ≥ 15.2 (iOS ≥ 15.2).';
      var sp = document.getElementById('spinner');
      if (sp) sp.style.display = 'none';
    });
  }
})();
</script>`

// Debug XHR interceptor injected into the page to capture HTTP status codes
// and error sources without needing browser DevTools.
const DEBUG_SCRIPT = `<script>
(function(){
  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (String(url).includes('.data') || String(url).includes('supertux')) {
      this._stUrl = String(url);
      try { this._stStack = new Error().stack; } catch(e) { this._stStack = ''; }
    }
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    var req = this;
    if (req._stUrl) {
      req.addEventListener('load', function() {
        window._stXHRLog = (window._stXHRLog||[]);
        window._stXHRLog.push('LOAD status=' + req.status + ' text="' + req.statusText + '" url=' + req.responseURL + ' size=' + (req.response&&req.response.byteLength||0));
      });
      req.addEventListener('error', function() {
        window._stXHRLog = (window._stXHRLog||[]);
        window._stXHRLog.push('ERROR status=' + req.status + ' url=' + (req.responseURL||req._stUrl));
      });
    }
    return _send.apply(this, arguments);
  };
})();
</script>`

// Replacement for the window.onerror handler that shows HTTP status, line/col, and stack
const OLD_ONERROR = `    window.onerror = function (e) {
      Module.setStatus("Oops!<br><br>An error occured and SuperTux crashed.<br><br><pre>" + e + "</pre>");`

const NEW_ONERROR = `    window.onerror = function (e, src, line, col, err) {
      var xhrLog = (window._stXHRLog||[]).join('<br>');
      var stack = (err && err.stack) ? err.stack.substring(0, 800) : '(no stack)';
      Module.setStatus("CRASH: " + e + "<br>src:" + src + " L" + line + ":C" + col + "<br>XHR log:<br>" + xhrLog + "<br><pre>" + stack + "</pre>");`

// Inject before <script async src="supertux2.js"> to override asset URLs when
// Vercel Blob env vars are set, and to register the caching service worker.
function buildInjectScript(dataUrl: string, wasmUrl: string): string {
  const blobPatch = (dataUrl || wasmUrl) ? `
  // Redirect large assets to Vercel Blob CDN (faster, proper Range-request support)
  var _ST_DATA_URL = ${JSON.stringify(dataUrl)};
  var _ST_WASM_URL = ${JSON.stringify(wasmUrl)};
  var _origLocate = Module.locateFile;
  Module.locateFile = function(path, prefix) {
    if (path === 'supertux2.data' && _ST_DATA_URL) return _ST_DATA_URL;
    if (path === 'supertux2.wasm' && _ST_WASM_URL) return _ST_WASM_URL;
    return _origLocate ? _origLocate(path, prefix) : (prefix || '') + path;
  };` : ''

  return `<script>
(function() {${blobPatch}
  // Register caching service worker for supertux assets
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/games/supertux-sw.js').then(function(reg) {
      console.log('[ST SW] registered scope:', reg.scope);
    }).catch(function(err) {
      console.warn('[ST SW] registration failed:', err);
    });
  }
})();
</script>`
}

export async function GET() {
  const dataUrl = process.env.NEXT_PUBLIC_SUPERTUX_DATA_URL ?? ''
  const wasmUrl = process.env.NEXT_PUBLIC_SUPERTUX_WASM_URL ?? ''

  const raw = await readFile(
    join(process.cwd(), 'public', 'games', 'supertux', 'supertux2.html'),
    'utf-8'
  )

  const injectScript = buildInjectScript(dataUrl, wasmUrl)

  let html = raw
    .replace('<head>', '<head>' + DEBUG_SCRIPT + MOBILE_FIXES_SCRIPT + '<base href="/games/supertux/">')
    .replace(OLD_ONERROR, NEW_ONERROR)
    // Inject blob URL override + SW registration just before the async loader
    .replace('<script async src="supertux2.js"></script>', injectScript + '<script async src="supertux2.js"></script>')

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-store',
    },
  })
}
