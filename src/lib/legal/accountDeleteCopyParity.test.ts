import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { vi as copyVi, en as copyEn } from '@/lib/i18n/accountDelete'

// UAT3 P0: the in-app deletion says the same thing on web and Android. Android's strings were
// generated from `accountDelete.ts`; this keeps them from drifting apart afterwards.

const PAIRS: Array<[keyof typeof copyVi, string]> = [
  ['settings.deleteAccountSelf', 'settings_delete_account_self'],
  ['accountDelete.warning', 'account_delete_warning'],
  ['accountDelete.removes.heading', 'account_delete_removes_heading'],
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((i): [keyof typeof copyVi, string] => [`accountDelete.removes.${i}` as keyof typeof copyVi, `account_delete_removes_${i}`]),
  ['accountDelete.kept.heading', 'account_delete_kept_heading'],
  ['accountDelete.kept.lead', 'account_delete_kept_lead'],
  ['accountDelete.kept.1', 'account_delete_kept_1'],
  ['accountDelete.kept.2', 'account_delete_kept_2'],
  ['accountDelete.confirm.word', 'account_delete_confirm_word'],
  ['accountDelete.done.title', 'account_delete_done_title'],
  ['accountDelete.done.p1', 'account_delete_done_p1'],
]

function androidString(xml: string, name: string): string | null {
  const m = new RegExp(`<string name="${name}"[^>]*>([\\s\\S]*?)</string>`).exec(xml)
  return m ? m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&').trim() : null
}

describe('in-app deletion copy — web and Android say the same thing', () => {
  const en = readFileSync('android/app/src/main/res/values/strings_account_delete.xml', 'utf8')
  const vi = readFileSync('android/app/src/main/res/values-vi/strings_account_delete.xml', 'utf8')
  it.each(PAIRS)('%s ↔ %s', (webKey, androidName) => {
    expect(androidString(en, androidName)).toBe(copyEn[webKey])
    expect(androidString(vi, androidName)).toBe(copyVi[webKey])
  })
})
