// Installs scripts/merge-guard/commit-msg as this repository's commit-msg hook.
//
// Hooks live in the COMMON git dir (or core.hooksPath), so one install covers every worktree of
// the clone. An existing commit-msg hook that is not ours is never overwritten — the install
// stops and says so. Re-running is safe: our own hook is replaced with the current copy.
//
//   npm run merge:install-hook
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'

const MARKER = 'tappyai-merge-guard-hook'
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()

const top = git('rev-parse', '--show-toplevel')
let hooksPath = ''
try { hooksPath = git('config', '--get', 'core.hooksPath') } catch { /* unset */ }
const dir = hooksPath ? (isAbsolute(hooksPath) ? hooksPath : join(top, hooksPath)) : join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'hooks')
const target = join(dir, 'commit-msg')
const source = readFileSync(join(top, 'scripts', 'merge-guard', 'commit-msg'), 'utf8').replace(/\r\n/g, '\n')

if (existsSync(target) && !readFileSync(target, 'utf8').includes(MARKER)) {
  console.error(`merge-guard: ${target} already exists and is not ours — not overwritten. Chain it by hand.`)
  process.exit(1)
}
mkdirSync(dir, { recursive: true })
writeFileSync(target, source)
chmodSync(target, 0o755)
console.log(`merge-guard: commit-msg hook installed at ${target}`)
