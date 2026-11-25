// 17/11/2026 (UAT, a clip whose place name was "Tiệm Bánh Mì Góc Phố (UAT)"): a code-built search link went into the answer as a markdown
// link, and the link broke at the ")" of the name: the reader saw "Google Maps%20Qu%E1%BA%ADn…)" as text. encodeURIComponent leaves
// ( ) ! * ' as they are (they are legal in a URL), but a markdown link ends at the first unescaped ")". A query that goes into a link the
// answer may carry is encoded with those escaped too.

/** encodeURIComponent, plus the characters it leaves raw that end or confuse a markdown link: ( ) ! * ' */
export function encodeQuery(value: string): string {
  return encodeURIComponent(value).replace(/[()!*']/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}
