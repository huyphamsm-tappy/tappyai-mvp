const ts = require(process.cwd() + '/node_modules/typescript')
const fs = require('fs')
const src = fs.readFileSync('src/lib/media/clipMetadata.ts', 'utf8')
let js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None, removeComments: true } }).outputText
js = js.replace(/^export /gm, '').replace(/^"use strict";\s*/m, '').replace(/Object\.defineProperty\(exports[^\n]*\n/g, '').replace(/^exports\.[^\n]*\n/gm, '')
js = '(() => {\n' + js + '\nwindow.__neutralize = neutralizeClipMetadata; window.__findId = findIdentifyingMetadata;\n})();'
fs.writeFileSync(process.argv[2], js)
console.log(js.length, /\bexports\b|\brequire\(/.test(js) ? 'HAS CJS LEFTOVERS' : 'clean')
