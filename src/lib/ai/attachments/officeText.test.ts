// 15/11: Word and Excel attachments. The packages are built here with fflate (real ZIPs), so the reader is tested on real bytes, not on mocks.
import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { docxToText, xlsxToText, zipDirectory, OFFICE_LIMITS, DOCX_MIME, XLSX_MIME } from './officeText'
import { validateClientInput } from '@/lib/ai/security/clientInput'
import { pdfPartsToText } from './pdfAttachments'

const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

const DOCX = zip({
  '[Content_Types].xml': '<Types/>',
  'word/document.xml': '<w:document><w:body>'
    + '<w:p><w:r><w:t>Hợp đồng thuê nhà</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t xml:space="preserve">Giá: </w:t></w:r><w:r><w:t>5 &amp; 6 triệu</w:t></w:r><w:r><w:tab/><w:t>mỗi tháng</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Phòng</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Giá</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>4,5</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '</w:body></w:document>',
})

const XLSX = zip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="Chi tiêu" sheetId="1" r:id="rId1"/><sheet name="Ẩn" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Khoản</t></si><si><t>Số tiền</t></si><si><r><t>Ăn </t></r><r><t>uống</t></r></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><f>1000*3</f><v>3000</v></c></row>'
    + '<row r="3"><c r="C3" t="inlineStr"><is><t>ghi chú</t></is></c></row>'
    + '<row r="4"></row>'
    + '</sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>999</v></c></row></sheetData></worksheet>',
})

describe('docxToText', () => {
  it('paragraphs, a tab, entities and table rows', () => {
    const t = docxToText(DOCX)!
    expect(t).toContain('Hợp đồng thuê nhà')
    expect(t).toContain('Giá: 5 & 6 triệu\tmỗi tháng')
    expect(t).toMatch(/Phòng\tGiá/)
    expect(t).toMatch(/A1\t4,5/)
  })
  it('not a package, or no document part: null', () => {
    expect(docxToText(strToU8('plain text, not a zip at all'))).toBeNull()
    expect(docxToText(zip({ 'other.xml': '<a/>' }))).toBeNull()
  })
})

describe('xlsxToText', () => {
  it('visible sheets only; shared strings, formula values and sparse cells keep their column', () => {
    const r = xlsxToText(XLSX)!
    expect(r.cut).toBe(false)
    expect(r.text).toContain('## Sheet: Chi tiêu')
    expect(r.text).toContain('Khoản\tSố tiền')
    expect(r.text).toContain('Ăn uống\t3000')
    expect(r.text).toContain('\t\tghi chú') // C3: two empty columns before it
    expect(r.text).not.toContain('999') // the hidden sheet
  })
  it('rows past the cap are cut and say so', () => {
    const rows = Array.from({ length: OFFICE_LIMITS.maxRowsPerSheet + 5 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join('')
    const big = zip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
    })
    const r = xlsxToText(big)!
    expect(r.cut).toBe(true)
    expect(r.text.split('\n').length).toBeLessThanOrEqual(OFFICE_LIMITS.maxRowsPerSheet + 3)
  })
  it('not a package: null', () => { expect(xlsxToText(strToU8('nope'))).toBeNull() })
})

describe('the ZIP directory is checked before anything is inflated (zip bomb)', () => {
  it('a package that declares more than the limit is refused without reading it', () => {
    const bomb = zip({ 'word/document.xml': 'a'.repeat(OFFICE_LIMITS.maxInflatedBytes + 1) })
    expect(bomb.length).toBeLessThan(200_000) // tiny on the wire
    expect(zipDirectory(bomb)).toBeNull()
    expect(docxToText(bomb)).toBeNull()
  })
  it('a normal package lists its entries', () => {
    expect(zipDirectory(DOCX)!.map(e => e.name)).toContain('word/document.xml')
  })
})

describe('the chat route reads them: trust boundary then fenced text', () => {
  const user = (url: string, contentType: string, name: string) => ({ messages: [{ role: 'user', content: 'tóm tắt giúp', experimental_attachments: [{ url, contentType, name }] }] })
  it('a .docx and an .xlsx are admitted as document parts and count with the PDFs', () => {
    const d = validateClientInput(user(`data:${DOCX_MIME};base64,${b64(DOCX)}`, DOCX_MIME, 'hop-dong.docx'))
    expect(d).toMatchObject({ ok: true })
    const x = validateClientInput(user(`data:${XLSX_MIME};base64,${b64(XLSX)}`, XLSX_MIME, 'chi-tieu.xlsx'))
    expect(x).toMatchObject({ ok: true })
    const one = { url: `data:${DOCX_MIME};base64,${b64(DOCX)}`, contentType: DOCX_MIME, name: 'a.docx' }
    expect(validateClientInput({ messages: [{ role: 'user', content: 'x', experimental_attachments: [one, one, one, one] }] })).toMatchObject({ ok: false, code: 'too_many_files' })
  })
  it('a text type is never admitted; a url that is not the declared data URL is refused', () => {
    expect(validateClientInput(user('data:text/html;base64,PGI+', 'text/html', 'x.html'))).toMatchObject({ ok: false })
    expect(validateClientInput(user('https://evil.example/a.docx', DOCX_MIME, 'x.docx'))).toMatchObject({ ok: false })
    expect(validateClientInput(user(`data:${XLSX_MIME};base64,AAAA`, DOCX_MIME, 'x.docx'))).toMatchObject({ ok: false })
  })
  it('the model gets the text inside the user_document fence, with the file kind named; an unreadable file becomes one honest note', async () => {
    const parts = (url: string, mimeType: string, name: string) => [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'tóm tắt' }, { type: 'file' as const, data: url, mimeType: mimeType as never, name }] }]
    const d = await pdfPartsToText(parts(`data:${DOCX_MIME};base64,${b64(DOCX)}`, DOCX_MIME, 'hop-dong.docx'))
    const dt = (d.messages[0].content as Array<{ text?: string }>)[1].text!
    expect(dt).toContain('Tệp Word người dùng gửi: "hop-dong.docx"')
    expect(dt).toContain('Hợp đồng thuê nhà')
    expect(dt).toContain('user_document')
    expect(d.docs[0].outcome).toBe('read')
    const x = await pdfPartsToText(parts(`data:${XLSX_MIME};base64,${b64(XLSX)}`, XLSX_MIME, 'chi-tieu.xlsx'))
    expect((x.messages[0].content as Array<{ text?: string }>)[1].text).toContain('Tệp Excel người dùng gửi')
    const bad = await pdfPartsToText(parts(`data:${XLSX_MIME};base64,${b64(strToU8('not a zip'))}`, XLSX_MIME, 'hong.xlsx'))
    expect((bad.messages[0].content as Array<{ text?: string }>)[1].text).toContain('không đọc được tệp này')
    expect(bad.docs[0].outcome).toBe('no_text')
  })
})
