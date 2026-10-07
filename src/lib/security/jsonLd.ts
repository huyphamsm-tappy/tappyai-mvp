/**
 * Serialize a value for a `<script type="application/ld+json">` block.
 *
 * 🚨 `JSON.stringify` IS NOT SAFE HERE ON ITS OWN. It leaves `<`, `>` and `&` as they are, and a
 * script element ends at the first `</script` the HTML parser meets — JSON quoting means nothing
 * to it. So a string value like `</script><script>alert(1)</script>` closes the JSON-LD block and
 * runs as a real script. The public `/r/<slug>` page put the user-supplied share title and question
 * into JSON-LD exactly that way (security-audit C1), and the CSP (`script-src 'unsafe-inline'`)
 * does not stop an inline script.
 *
 * Escaping `<`, `>` and `&` as JSON unicode escapes keeps the markup inert and is still the same
 * JSON: `JSON.parse` returns the original value, so crawlers read identical data. U+2028 and
 * U+2029 are escaped as well — valid inside JSON strings, but line terminators to older
 * JavaScript parsers that treat the block as script.
 *
 * Every JSON-LD block goes through this (via `<JsonLd>`); `jsonLd.test.tsx` fails if a page renders
 * `application/ld+json` any other way.
 */

// Built from code points rather than escape sequences in the source: a raw U+2028 inside a regex
// literal is a line terminator and ends the regex (an editor turned the escape into the raw
// character while this file was being written).
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  [LINE_SEPARATOR]: '\\u2028',
  [PARAGRAPH_SEPARATOR]: '\\u2029',
}
const UNSAFE = new RegExp(`[<>&${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`, 'g')

export function serializeJsonLd(value: unknown): string {
  return (JSON.stringify(value) ?? 'null').replace(UNSAFE, (c) => ESCAPES[c])
}
