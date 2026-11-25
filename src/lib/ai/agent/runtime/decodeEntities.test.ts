// 19/11 (owner, the reader beside the chat): a page that writes its accented letters as named entities showed "Th&aacute;ng 8/1945, H&ograve;a" as plain text.
import { describe, it, expect } from 'vitest'
import { decodeEntities } from './pageExtract'

describe('decodeEntities: Latin-1 letters by name, both cases, and the typographic marks', () => {
  it('turns the entities of a Vietnamese page into its letters', () => {
    expect(decodeEntities('Th&aacute;ng 8/1945, H&ograve;a b&igrave;nh, Ch&iacute;nh ph&uacute;, ng&agrave;y 2/9, Tuy&ecirc;n ng&ocirc;n')).toBe('Tháng 8/1945, Hòa bình, Chính phú, ngày 2/9, Tuyên ngôn')
    expect(decodeEntities('&Aacute;&Agrave;&Acirc;&Atilde;&Eacute;&Egrave;&Ecirc;&Iacute;&Igrave;&Oacute;&Ograve;&Ocirc;&Otilde;&Uacute;&Ugrave;&Yacute;')).toBe('ÁÀÂÃÉÈÊÍÌÓÒÔÕÚÙÝ')
    expect(decodeEntities('&agrave;&aacute;&acirc;&atilde;&egrave;&eacute;&ecirc;&igrave;&iacute;&ograve;&oacute;&ocirc;&otilde;&ugrave;&uacute;&yacute;')).toBe('àáâãèéêìíòóôõùúý')
  })
  // 19/11 (review): a page's "&constructor;" returned Object's own function, and "&Yuml;" came out as a sharp s
  it('names of Object members stay text, and Yuml is the capital Y with a diaeresis', () => {
    expect(decodeEntities('a &constructor; b &toString; c &valueOf; d &hasOwnProperty; e')).toBe('a &constructor; b &toString; c &valueOf; d &hasOwnProperty; e')
    expect(decodeEntities('&yuml;&Yuml;')).toBe('ÿŸ')
  })
  it('quotes, bullets and the entities it already knew keep working; an unknown name and a stray ampersand stay as written', () => {
    expect(decodeEntities('&ldquo;Tuy&ecirc;n ng&ocirc;n&rdquo; &bull; A&nbsp;&amp;&nbsp;B &#273; &#x111;')).toBe('“Tuyên ngôn” • A & B đ đ')
    expect(decodeEntities('R&D &notanentity; 5 &lt; 6')).toBe('R&D &notanentity; 5 < 6')
  })
})
