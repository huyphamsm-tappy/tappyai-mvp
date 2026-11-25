// The dev test harness route must not exist in production: the page itself answers 404 there (not only a hidden button), nothing in the product links to it,
// and its modules are imported by nothing but the route.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

vi.mock('./HarnessClient', () => ({ default: () => null }))

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

async function load() {
  vi.resetModules()
  return (await import('./page')).default
}

// ORDER MATTERS: React's JSX runtime is a CommonJS module loaded once, by the first import, for the NODE_ENV of that moment. The two rendering cases run first (development
// build of the runtime); the production case throws before it draws anything, so it does not need the runtime to work.
describe('/dev/v206 is development only', () => {
  it('development: the page renders the harness', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const Page = await load()
    expect(() => Page({ searchParams: { s: '2' } })).not.toThrow()
  })

  it('test environment is not production either (the harness can be rendered by tests)', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const Page = await load()
    expect(() => Page({ searchParams: {} })).not.toThrow()
  })

  it('production: the page throws the framework\'s not-found, whatever the query', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const Page = await load()
    for (const q of [undefined, { s: '3' }, { s: '3', bar: '0' }]) {
      let err: unknown
      try { Page({ searchParams: q }) } catch (e) { err = e }
      expect((err as { digest?: string } | undefined)?.digest).toBe('NEXT_NOT_FOUND')
    }
  })
})

const SRC = join(process.cwd(), 'src')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const rel = (p: string) => relative(SRC, p).split(sep).join('/')

describe('nothing in the product reaches the harness', () => {
  const files = walk(SRC).filter(f => !/\.test\.(ts|tsx)$/.test(f))
  const insideHarness = (f: string) => rel(f).startsWith('app/(app)/dev/v206/') || rel(f).startsWith('lib/dev/v206Harness/')

  it('no product file links to /dev/v206', () => {
    const offenders = files.filter(f => !insideHarness(f) && /\/dev\/v206/.test(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('no product file imports the harness fixtures or its fetch wrapper', () => {
    const offenders = files.filter(f => !insideHarness(f) && /lib\/dev\/v206Harness/.test(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('the route\'s page is the ONLY file under it that reads NODE_ENV (one place decides)', () => {
    const inRoute = files.filter(f => rel(f).startsWith('app/(app)/dev/v206/'))
    const readers = inRoute.filter(f => /NODE_ENV/.test(readFileSync(f, 'utf8'))).map(rel)
    expect(readers).toEqual(['app/(app)/dev/v206/page.tsx'])
  })
})
