import type { OfficialEntity } from '../types'
import type { DirectoryService } from './types'
import { findMatchingBrand } from './matcher'
import { getCachedDirectory, setCachedDirectory } from '../cache/redisCache'

const SEED_DATA: OfficialEntity[] = [
  // Banks
  { id: 'vcb', brand: 'Vietcombank', category: 'bank', domains: ['vietcombank.com.vn'], website: 'https://vietcombank.com.vn', hotline: '1900 545413', aliases: ['VCB', 'VCB Digibank'] },
  { id: 'tcb', brand: 'Techcombank', category: 'bank', domains: ['techcombank.com.vn'], website: 'https://techcombank.com.vn', hotline: '1800 588822', aliases: ['TCB'] },
  { id: 'bidv', brand: 'BIDV', category: 'bank', domains: ['bidv.com.vn'], website: 'https://bidv.com.vn', hotline: '1900 9247' },
  { id: 'vpb', brand: 'VPBank', category: 'bank', domains: ['vpbank.com.vn'], website: 'https://vpbank.com.vn', hotline: '1900 545415', aliases: ['VPB', 'VPBank NEO'] },
  { id: 'acb', brand: 'ACB', category: 'bank', domains: ['acb.com.vn'], website: 'https://acb.com.vn', hotline: '1900 545486' },
  { id: 'mb', brand: 'MBBank', category: 'bank', domains: ['mbbank.com.vn'], website: 'https://mbbank.com.vn', hotline: '1900 545426', aliases: ['MB', 'MBB', 'MB Bank'] },
  { id: 'stb', brand: 'Sacombank', category: 'bank', domains: ['sacombank.com.vn'], website: 'https://sacombank.com.vn', hotline: '1900 5555 88', aliases: ['STB', 'Sacom'] },
  { id: 'agr', brand: 'Agribank', category: 'bank', domains: ['agribank.com.vn'], website: 'https://agribank.com.vn', hotline: '1900 558818', aliases: ['AGR'] },
  { id: 'tpb', brand: 'TPBank', category: 'bank', domains: ['tpb.vn', 'tpbank.vn'], website: 'https://tpb.vn', hotline: '1900 604668', aliases: ['TPB'] },
  { id: 'vib', brand: 'VIB', category: 'bank', domains: ['vib.com.vn'], website: 'https://vib.com.vn', hotline: '1800 8180' },
  { id: 'shb', brand: 'SHB', category: 'bank', domains: ['shb.com.vn'], website: 'https://shb.com.vn', hotline: '1900 5555 00' },
  { id: 'msb', brand: 'MSB', category: 'bank', domains: ['msb.com.vn'], website: 'https://msb.com.vn', hotline: '1900 6083' },
  { id: 'hdbank', brand: 'HDBank', category: 'bank', domains: ['hdbank.com.vn'], website: 'https://hdbank.com.vn', hotline: '1900 6060', aliases: ['HDB', 'HD Bank'] },
  { id: 'vietinbank', brand: 'VietinBank', category: 'bank', domains: ['vietinbank.vn'], website: 'https://vietinbank.vn', hotline: '1900 558868', aliases: ['VTB', 'CTG', 'Vietin'] },

  // E-Wallets
  { id: 'momo', brand: 'MoMo', category: 'ewallet', domains: ['momo.vn'], website: 'https://momo.vn', hotline: '1900 5454 41', aliases: ['Momo Wallet', 'Vi MoMo'] },
  { id: 'zalopay', brand: 'ZaloPay', category: 'ewallet', domains: ['zalopay.vn'], website: 'https://zalopay.vn', hotline: '1900 5454 36', aliases: ['Zalo Pay'] },
  { id: 'vnpay', brand: 'VNPAY', category: 'ewallet', domains: ['vnpay.vn'], website: 'https://vnpay.vn' },
  { id: 'shopeepay', brand: 'ShopeePay', category: 'ewallet', domains: ['shopeepay.vn'], website: 'https://shopeepay.vn' },

  // Government
  { id: 'dvc', brand: 'Dịch vụ công', category: 'government', domains: ['dichvucong.gov.vn'], website: 'https://dichvucong.gov.vn' },
  { id: 'tax', brand: 'Tổng cục Thuế', category: 'government', domains: ['gdt.gov.vn', 'thuedientu.gdt.gov.vn'], website: 'https://gdt.gov.vn' },
  { id: 'bhxh', brand: 'Bảo hiểm xã hội', category: 'government', domains: ['baohiemxahoi.gov.vn'], website: 'https://baohiemxahoi.gov.vn' },
  { id: 'congandanang', brand: 'Cổng DVCQG', category: 'government', domains: ['dichvucong.dancuquocgia.gov.vn'], website: 'https://dichvucong.dancuquocgia.gov.vn' },
  { id: 'ca', brand: 'Bộ Công An', category: 'government', domains: ['bocongan.gov.vn'], website: 'https://bocongan.gov.vn' },

  // Telecom
  { id: 'viettel', brand: 'Viettel', category: 'telecom', domains: ['viettel.vn', 'viettel.com.vn'], website: 'https://viettel.vn', hotline: '18008098', aliases: ['Viettel Pay', 'ViettelPay'] },
  { id: 'mobifone', brand: 'MobiFone', category: 'telecom', domains: ['mobifone.vn'], website: 'https://mobifone.vn', hotline: '18001090' },
  { id: 'vinaphone', brand: 'VinaPhone', category: 'telecom', domains: ['vinaphone.com.vn'], website: 'https://vinaphone.com.vn', hotline: '18001091' },
  { id: 'fpt', brand: 'FPT Telecom', category: 'telecom', domains: ['fpt.vn', 'fpt.com.vn'], website: 'https://fpt.vn', hotline: '19006600' },
  { id: 'vnpt', brand: 'VNPT', category: 'telecom', domains: ['vnpt.vn', 'vnpt.com.vn'], website: 'https://vnpt.vn', hotline: '18001260' },

  // Airlines
  { id: 'vna', brand: 'Vietnam Airlines', category: 'airline', domains: ['vietnamairlines.com'], website: 'https://www.vietnamairlines.com', hotline: '1900 1100', aliases: ['VNA', 'Vietnam Air'] },
  { id: 'vj', brand: 'VietJet', category: 'airline', domains: ['vietjetair.com'], website: 'https://www.vietjetair.com', hotline: '1900 1886', aliases: ['VJ', 'Vietjet Air'] },
  { id: 'bba', brand: 'Bamboo Airways', category: 'airline', domains: ['bambooairways.com'], website: 'https://www.bambooairways.com', hotline: '1900 1166' },

  // E-Commerce
  { id: 'shopee', brand: 'Shopee', category: 'ecommerce', domains: ['shopee.vn'], website: 'https://shopee.vn', hotline: '1900 1221' },
  { id: 'lazada', brand: 'Lazada', category: 'ecommerce', domains: ['lazada.vn'], website: 'https://lazada.vn', hotline: '1900 6546' },
  { id: 'tiki', brand: 'Tiki', category: 'ecommerce', domains: ['tiki.vn'], website: 'https://tiki.vn', hotline: '1900 6035' },
  { id: 'sendo', brand: 'Sendo', category: 'ecommerce', domains: ['sendo.vn'], website: 'https://sendo.vn' },
  { id: 'tgdd', brand: 'Thế Giới Di Động', category: 'ecommerce', domains: ['thegioididong.com'], website: 'https://www.thegioididong.com', hotline: '1800 1060' },
  { id: 'fptshop', brand: 'FPT Shop', category: 'ecommerce', domains: ['fptshop.com.vn'], website: 'https://fptshop.com.vn', hotline: '1800 6601' },
  { id: 'cellphones', brand: 'CellphoneS', category: 'ecommerce', domains: ['cellphones.com.vn'], website: 'https://cellphones.com.vn', hotline: '1800 2097' },
  { id: 'dienmayxanh', brand: 'Điện Máy Xanh', category: 'ecommerce', domains: ['dienmayxanh.com'], website: 'https://www.dienmayxanh.com', hotline: '1800 1061' },
]

let directory: OfficialEntity[] | null = null

async function loadDirectory(): Promise<OfficialEntity[]> {
  if (directory) return directory

  // The cache is content-addressed on SEED_DATA, so a hit can only ever be this same directory —
  // see the note on `directoryKey`. A directory change (an added entity, an added alias) is live
  // on the first request after deploy instead of waiting out a TTL on a stale copy.
  const cached = await getCachedDirectory(SEED_DATA)
  if (cached) {
    directory = cached as OfficialEntity[]
    return directory
  }

  directory = SEED_DATA
  await setCachedDirectory(directory)
  return directory
}

export const officialDirectory: DirectoryService = {
  async lookup(domain: string): Promise<OfficialEntity | null> {
    const entries = await loadDirectory()
    return findMatchingBrand(domain, entries)
  },

  async getAll(): Promise<OfficialEntity[]> {
    return loadDirectory()
  },
}
