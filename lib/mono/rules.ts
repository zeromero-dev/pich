/** Pure payment rules (no I/O, no server-only) so `npm test` can run them. */

export type PaymentMode = 'live' | 'test'

/**
 * Fail closed: only two combinations take payments, each identity matched
 * positively. A live token outside Production, a test token in Production, an
 * unknown merchant or a failed details read (merchantId null) all mean "no payments".
 */
export function resolvePaymentMode(i: {
  vercelEnv?: string
  merchantId: string | null
  liveMerchantId?: string
  testMerchantId?: string
  warehouseId?: string
}): PaymentMode | null {
  const is = (id: string | undefined) => !!id && i.merchantId === id
  if (i.vercelEnv === 'production') {
    return is(i.liveMerchantId) && i.warehouseId === '34998' ? 'live' : null
  }
  return is(i.testMerchantId) && i.warehouseId === '51630' ? 'test' : null
}

/** `pay.monobank.ua` seen in the 2026-11-18 probe; `pay.mbnk.biz` in mono's docs example. */
export const PAGE_HOSTS = ['pay.monobank.ua', 'pay.mbnk.biz']

export function isAllowedPageUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && PAGE_HOSTS.includes(parsed.hostname)
  } catch {
    return false
  }
}
