import { readFile } from 'fs/promises'
import { join } from 'path'

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

export async function GET() {
  const raw = await readFile(
    join(process.cwd(), 'public', 'games', 'supertux', 'supertux2.html'),
    'utf-8'
  )
  let html = raw
    .replace('<head>', '<head>' + DEBUG_SCRIPT + '<base href="/games/supertux/">')
    .replace(OLD_ONERROR, NEW_ONERROR)

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-store',
    },
  })
}
