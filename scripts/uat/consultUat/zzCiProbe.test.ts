// TEMPORARY probe (02/11): why the live-trial guard refuses the node command line on GitHub's runner and not locally. Prints only paths and flags
// of the node command line (never an env value). Removed in the next commit.
import { it, expect } from 'vitest'
import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

it('probe: the worker command line', () => {
  const cwd = process.cwd()
  const want = join(cwd, 'node_modules', 'vitest', 'suppress-warnings.cjs')
  let wantReal = 'n/a'
  try { wantReal = realpathSync(want) } catch (e) { wantReal = `realpath failed: ${String(e).slice(0, 80)}` }
  const requireValues = process.execArgv.map((a, i, all) => (a === '--require' || a === '-r' ? all[i + 1] : a.startsWith('--require=') ? a.slice(10) : null)).filter(Boolean) as string[]
  const reals = requireValues.map(v => { try { return realpathSync(v) } catch { return `unreadable:${v}` } })
  console.log('ZZPROBE ' + JSON.stringify({ node: process.version, platform: process.platform, cwd, execArgv: process.execArgv, wantExists: existsSync(want), wantReal, requireValues, reals }))
  expect(true).toBe(true)
})
