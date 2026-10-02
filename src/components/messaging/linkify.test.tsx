// @vitest-environment jsdom
//
// Message bodies in the Tappy Inbox become clickable ONLY for https URLs the
// shared guard admits. Anything else — javascript:, data:, http:, private
// hosts — stays inert text. A brochure shared into the Inbox must be usable
// (Maps / website links open) without opening an injection vector.

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { linkifySafe } from './linkify'

afterEach(cleanup)

function anchors(body: string) {
  const { container } = render(<div>{linkifySafe(body)}</div>)
  return {
    hrefs: [...container.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    rels: [...container.querySelectorAll('a')].map((a) => a.getAttribute('rel')),
    text: container.textContent ?? '',
  }
}

describe('linkifySafe', () => {
  it('returns the input untouched when there is nothing to link', () => {
    expect(linkifySafe('xin chào')).toBe('xin chào')
    expect(linkifySafe('')).toBe('')
  })

  it('links https URLs, keeps every character of the body, opens safely', () => {
    const body = 'Bản đồ: https://maps.google.com/?cid=123\nWebsite: https://quanmoc.vn/menu'
    const r = anchors(body)
    expect(r.hrefs).toEqual(['https://maps.google.com/?cid=123', 'https://quanmoc.vn/menu'])
    expect(r.text).toBe(body)
    for (const rel of r.rels) expect(rel).toBe('noopener noreferrer nofollow')
  })

  it('leaves trailing punctuation outside the anchor', () => {
    const r = anchors('xem tại https://tappyai.com/reviews/a. Nhé!')
    expect(r.hrefs).toEqual(['https://tappyai.com/reviews/a'])
    expect(r.text).toBe('xem tại https://tappyai.com/reviews/a. Nhé!')
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'http://insecure.example/x',
    'https://localhost/admin',
    'https://127.0.0.1/',
    'https://169.254.169.254/latest/meta-data/',
    'ftp://files.example/x',
  ])('never links %s', (bad) => {
    const r = anchors(`click ${bad} now`)
    expect(r.hrefs).toEqual([])
    expect(r.text).toBe(`click ${bad} now`)
  })

  it('links the safe URL and leaves the unsafe one as text in the same body', () => {
    const r = anchors('a https://maps.google.com/?q=x b https://localhost/x c')
    expect(r.hrefs).toEqual(['https://maps.google.com/?q=x'])
    expect(r.text).toBe('a https://maps.google.com/?q=x b https://localhost/x c')
  })

  it('does not swallow quotes or angle brackets into a URL', () => {
    const r = anchors('"https://tappyai.com/reviews/a"<b>')
    expect(r.hrefs).toEqual(['https://tappyai.com/reviews/a'])
    expect(r.text).toBe('"https://tappyai.com/reviews/a"<b>')
  })
})
