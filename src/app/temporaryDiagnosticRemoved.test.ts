// @vitest-environment node
//
// ── The temporary Zalo diagnostic must not come back ─────────────────────────
//
// #202 shipped a passive client-error recorder to production for ONE purpose: capturing the
// Zalo → Chat → Home client exception on an iPhone, where no console is reachable without a Mac.
// It listened on window, wrote redacted records to sessionStorage, and exposed them at /diag.
//
// The owner has confirmed that flow no longer reproduces, so the instrument is done. Diagnostics
// that outlive their investigation are how a debug surface becomes permanent: /diag was reachable
// by anyone who typed the URL, and the recorder ran on every page of every session.
//
// This locks the removal. It is deliberately a source-level check rather than a behavioural one,
// because the thing being asserted is an ABSENCE — there is no runtime left to observe.
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'

describe('the temporary Zalo diagnostic is gone', () => {
  for (const path of [
    'src/lib/diag',
    'src/lib/diag/clientErrorRecord.ts',
    'src/components/ClientErrorDiag.tsx',
    'src/app/diag',
    'src/app/diag/page.tsx',
  ]) {
    it(`${path} does not exist`, () => expect(existsSync(path)).toBe(false))
  }

  it('the root layout no longer mounts or mentions it', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8')
    expect(layout).not.toContain('ClientErrorDiag')
    expect(layout).not.toContain('/diag')
  })

  it('nothing anywhere still references the recorder or its storage key', () => {
    // The listener, the storage key and the reader all have to go together — leaving any one of
    // them is how a "removed" diagnostic keeps writing.
    // This file is excluded because it names those identifiers itself, in the pattern below and
    // in the prose above. Without the exclusion the test matches its own text and fails — which
    // it did in CI, where the file is tracked, while passing locally where it was not yet added.
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const hits = execSync(
      'git grep -l -E "ClientErrorDiag|clientErrorRecord|tappy_diag_v1|DIAG_KEY" -- src ":!src/app/temporaryDiagnosticRemoved.test.ts" || true',
      { encoding: 'utf8' },
    ).trim()
    expect(hits, `still referenced in:\n${hits}`).toBe('')
  })
})

describe('the REAL error handling is untouched', () => {
  it('the app still has its own error boundary', () => {
    // Removing the diagnostic must not remove the thing that actually handles errors for users,
    // and must not be replaced by a blanket boundary either.
    expect(existsSync('src/app/error.tsx')).toBe(true)
  })
})
