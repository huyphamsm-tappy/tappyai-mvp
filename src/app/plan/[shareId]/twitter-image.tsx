// The X/Twitter card is the same image as the Open Graph one — one composition,
// two file-convention entry points, so the previews cannot drift apart.
// `runtime` must be a literal here: Next reads segment config statically.
export const runtime = 'edge'
export { default, alt, size, contentType } from './opengraph-image'
