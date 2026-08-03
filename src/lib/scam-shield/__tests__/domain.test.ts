import { describe, it, expect } from 'vitest'
import { registrableDomain } from '../domain'

describe('registrableDomain', () => {
  it('extracts eTLD+1 for standard TLDs', () => {
    expect(registrableDomain('www.google.com')).toBe('google.com')
    expect(registrableDomain('sub.example.org')).toBe('example.org')
  })

  it('returns 2-part domains as-is', () => {
    expect(registrableDomain('google.com')).toBe('google.com')
    expect(registrableDomain('example.org')).toBe('example.org')
  })

  it('handles Vietnamese .com.vn correctly', () => {
    expect(registrableDomain('vietcombank.com.vn')).toBe('vietcombank.com.vn')
    expect(registrableDomain('www.vietcombank.com.vn')).toBe('vietcombank.com.vn')
  })

  it('handles Vietnamese .gov.vn correctly', () => {
    expect(registrableDomain('dichvucong.gov.vn')).toBe('dichvucong.gov.vn')
  })

  it('handles .co.uk correctly', () => {
    expect(registrableDomain('www.bbc.co.uk')).toBe('bbc.co.uk')
    expect(registrableDomain('bbc.co.uk')).toBe('bbc.co.uk')
  })

  it('handles single-part hostnames', () => {
    expect(registrableDomain('localhost')).toBe('localhost')
  })

  it('is case-insensitive', () => {
    expect(registrableDomain('WWW.VIETCOMBANK.COM.VN')).toBe('vietcombank.com.vn')
  })

  it('treats unknown multi-level as standard TLD', () => {
    expect(registrableDomain('sub.example.xyz')).toBe('example.xyz')
  })

  it('does not false-positive on .vn without multi-level prefix', () => {
    expect(registrableDomain('tpb.vn')).toBe('tpb.vn')
    expect(registrableDomain('www.tpb.vn')).toBe('tpb.vn')
  })
})
