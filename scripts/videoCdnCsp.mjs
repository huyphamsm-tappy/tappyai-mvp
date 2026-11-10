// Explore video: the CDN host (VIDEO_CDN_HOST, no default) in the Content-Security-Policy and next/image. Pure, no I/O, so next.config.mjs and its test share it.
//
// The host is only trusted when it is a BARE hostname (letters, digits, dots, hyphens; at least one dot). A value with a scheme, path, port, wildcard, space or semicolon is ignored,
// so a mistyped variable can never widen the policy or inject a directive. Unset => every directive is returned exactly as it was.

const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

/** `https://<host>` for a valid VIDEO_CDN_HOST, or '' when it is unset or not a bare hostname. */
export function videoCdnOrigin(env = process.env) {
  const host = typeof env.VIDEO_CDN_HOST === 'string' ? env.VIDEO_CDN_HOST.trim().toLowerCase() : ''
  return host && HOST_RE.test(host) ? `https://${host}` : ''
}

/** The directive with the CDN origin appended (once), or unchanged when there is no CDN host. */
export function addVideoCdnHost(directive, env = process.env) {
  const origin = videoCdnOrigin(env)
  if (!origin || directive.split(' ').includes(origin)) return directive
  return `${directive} ${origin}`
}
