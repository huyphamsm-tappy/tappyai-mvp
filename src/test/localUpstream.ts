// A loopback HTTP server for tests of the provider transport. Test scope only: nothing in production imports this. The server listens on
// 127.0.0.1 and is reachable only through the documented loopback test seam (LLM_RESPONSES_BASE_URL). No real upstream is contacted.
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface LocalUpstream {
  url: string
  close: () => Promise<void>
}

export async function startLocalUpstream(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, rawBody: string) => void,
): Promise<LocalUpstream> {
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => handler(req, res, raw))
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(r => { server.close(() => r()); server.closeAllConnections?.() }),
  }
}
