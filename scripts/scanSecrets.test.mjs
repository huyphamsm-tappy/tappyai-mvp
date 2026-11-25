import { describe, it, expect } from 'vitest'
import { findSecrets, isAllowedPath } from './scanSecrets.mjs'

// The samples are built from pieces so this file holds no credential-shaped text itself.
const OPENAI = 'sk-' + 'a1B2c3D4'.repeat(5)
const AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP'
const GH = 'ghp_' + 'x'.repeat(36)
const JWT = ['eyJ' + 'hbGciOiJIUzI1NiJ9', 'eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0', 'abcDEF123456_-abcDEF123456'].join('.')
const PEM = '-----BEGIN ' + 'RSA PRIVATE KEY-----'

describe('findSecrets', () => {
  it.each([
    ['OpenAI-style secret key', `const k = "${OPENAI}"`],
    ['AWS access key id', `aws = ${AWS}`],
    ['GitHub token', `token: ${GH}`],
    ['JSON web token', `Authorization: Bearer ${JWT}`],
    ['private key block', PEM],
  ])('finds a %s and reports line and kind only', (kind, line) => {
    const f = findSecrets(`first line\n${line}\nlast`)
    expect(f).toEqual([{ line: 2, kind }])
    expect(JSON.stringify(f)).not.toContain('a1B2c3D4')
  })
  it('stays quiet on ordinary code, short ids and the names of variables', () => {
    expect(findSecrets('const key = process.env.OPENAI_API_KEY\nconst id = "sk-short"\nhttps://example.com/a.b.c')).toEqual([])
  })
  it('a documented example is allowed on its own line, and only on that line', () => {
    expect(findSecrets(`${OPENAI} // secret-scan:allow documented example\n${OPENAI}`)).toEqual([{ line: 2, kind: 'OpenAI-style secret key' }])
  })
  it('allows the scanner itself and the lock file, nothing else', () => {
    expect(isAllowedPath('scripts/scanSecrets.mjs')).toBe(true)
    expect(isAllowedPath('package-lock.json')).toBe(true)
    expect(isAllowedPath('src/lib/config/product.ts')).toBe(false)
    expect(isAllowedPath('docs/anything.md')).toBe(false)
  })
})
