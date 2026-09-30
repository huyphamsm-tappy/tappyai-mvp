// Vercel "Ignored Build Step" (vercel.json ignoreCommand). Exit 0 = SKIP the build, exit 1 = BUILD.
// Owner 30/09 (Function Storage at 100% on Hobby): only the release branch `rc/web-uat` (UAT) and `main` (production)
// ever build; every other branch — ios/*, luna/*, security/*, phase8/*, android/*, wip/*, claude/* … — is skipped.
// Kept from before: a commit that touches only android/ builds nothing on any branch.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const BUILD_BRANCHES = ['rc/web-uat', 'main']

/** true = build. `onlyAndroid` null = unknown (no parent commit, shallow clone) → build. */
export function shouldBuild(branch, onlyAndroid) {
  if (!BUILD_BRANCHES.includes(branch ?? '')) return false
  return onlyAndroid !== true
}

function onlyAndroidChanged() {
  try {
    // --quiet exits 0 when nothing outside android/ changed between the parent and this commit.
    execFileSync('git', ['diff', '--quiet', 'HEAD^', 'HEAD', '--', '.', ':(exclude)android/'], { stdio: 'ignore' })
    return true
  } catch (e) {
    return e && e.status === 1 ? false : null
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? ''
  const build = shouldBuild(branch, BUILD_BRANCHES.includes(branch) ? onlyAndroidChanged() : null)
  console.log(`vercel-ignore: branch=${branch || '(none)'} → ${build ? 'BUILD' : 'SKIP'}`)
  process.exit(build ? 1 : 0)
}
