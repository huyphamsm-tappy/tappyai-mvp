// Usage: node ios/scripts/add_strings.mjs strings.json
// strings.json = { "key": { "en": "...", "vi": "..." }, ... } — merged into Localizable.xcstrings.
import fs from 'node:fs'
const target = new URL('../TappyAI/Resources/Localizable.xcstrings', import.meta.url)
const cat = JSON.parse(fs.readFileSync(target, 'utf8'))
const add = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
for (const [k, v] of Object.entries(add)) {
  cat.strings[k] = {
    extractionState: 'manual',
    localizations: Object.fromEntries(
      Object.entries(v).map(([l, s]) => [l, { stringUnit: { state: 'translated', value: s } }]),
    ),
  }
}
fs.writeFileSync(target, JSON.stringify(cat, null, 2) + '\n')
console.log('added', Object.keys(add).length)
