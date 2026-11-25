import { describe, it, expect } from 'vitest'
import { attachmentOnlyTask, attachmentTaskSystemLine } from './routeTask'

const img = { type: 'image', image: 'data:image/png;base64,AAAA' }
const pdf = { type: 'file', data: 'data:application/pdf;base64,AAAA', mimeType: 'application/pdf', name: 'a.pdf' }
const user = (content: unknown) => ({ role: 'user', content })

describe('attachmentOnlyTask', () => {
  it('an image with no text, or whitespace/format-only text, is the implicit task', () => {
    expect(attachmentOnlyTask([user([img])])?.task).toBe('DESCRIBE_OR_SUMMARIZE_ATTACHMENT')
    expect(attachmentOnlyTask([user([{ type: 'text', text: '  ​\n ' }, img])])?.task).toBe('DESCRIBE_OR_SUMMARIZE_ATTACHMENT')
    expect(attachmentOnlyTask([user([pdf])])?.task).toBe('DESCRIBE_OR_SUMMARIZE_ATTACHMENT')
  })
  it('any text means the person\'s own words rule (no implicit task)', () => {
    expect(attachmentOnlyTask([user([{ type: 'text', text: 'ảnh này là gì' }, img])])).toBeNull()
  })
  it('no attachment, or only an earlier turn\'s attachment, is not an attachment-only turn', () => {
    expect(attachmentOnlyTask([user('xin chào')])).toBeNull()
    expect(attachmentOnlyTask([user([img]), { role: 'assistant', content: 'đây là ảnh' }, user('cảm ơn')])).toBeNull()
    expect(attachmentOnlyTask([])).toBeNull()
  })
  it('only the LAST user turn counts', () => {
    expect(attachmentOnlyTask([user('hi'), { role: 'assistant', content: 'x' }, user([img])])?.task).toBe('DESCRIBE_OR_SUMMARIZE_ATTACHMENT')
  })
  it('the system line is server metadata: says no tools, data not instructions, both languages', () => {
    for (const l of ['vi', 'en'] as const) {
      const s = attachmentTaskSystemLine(l)
      expect(s.length).toBeGreaterThan(40)
    }
    expect(attachmentTaskSystemLine('en')).toMatch(/untrusted|data/i)
    expect(attachmentTaskSystemLine('vi')).toMatch(/dữ liệu/)
  })
})
