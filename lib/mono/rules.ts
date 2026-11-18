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

export const MAX_WEBHOOK_BYTES = 16_384

/** Cheap header screen before reading the body; the body length is checked again after reading. */
export function screenRequest(contentLength: string | null, xSign: string | null): 'ok' | 'too_large' | 'unsigned' {
  if (!xSign) return 'unsigned'
  return contentLength !== null && Number(contentLength) > MAX_WEBHOOK_BYTES ? 'too_large' : 'ok'
}

type Status = {
  invoiceId: string
  status: string
  amount: number
  ccy: number
  finalAmount?: number
  reference?: string
  modifiedDate?: string
  cancelList?: unknown[]
}

/** The signed event must be a full, unrefunded success for exactly what the payload locked (spec Money rule 4). */
export function checkSignedEvent(body: Status, payload: { reference: string; totalKop: number }): 'ok' | string {
  if (body.status !== 'success') return 'not success'
  if (!body.invoiceId) return 'missing invoiceId'
  if (body.reference !== payload.reference) return 'reference mismatch'
  if (body.ccy !== 980) return 'currency'
  if (!Number.isSafeInteger(body.amount) || body.amount !== payload.totalKop) return 'amount mismatch'
  if (body.finalAmount !== undefined && body.finalAmount !== body.amount) return 'finalAmount differs'
  if (body.cancelList && body.cancelList.length > 0) return 'cancelList present'
  return 'ok'
}

/**
 * The fresh status read blocks on any adverse evidence, whatever its timestamp
 * (`modifiedDate` is optional). A read that merely lags (created/processing) is not
 * evidence: the signed success stands, so no delivery attempt is spent on a 503.
 */
export function adverseEvidence(read: Status, signed: Status): 'ok' | string {
  if (read.invoiceId !== signed.invoiceId || read.reference !== signed.reference || read.ccy !== signed.ccy || read.amount !== signed.amount) {
    return 'status read mismatch'
  }
  if (read.status === 'reversed' || read.status === 'failure') return `status ${read.status}`
  // finalAmount is 0 before settlement (probe 2026-11-18), so it only means "refunded" on a success.
  if (read.status === 'success' && read.finalAmount !== undefined && read.finalAmount < read.amount) return 'refunded'
  if (read.cancelList && read.cancelList.length > 0) return 'cancelList present'
  return 'ok'
}

/** Our HugeProfit integration id. A missing or garbled one would make every lookup "absent": fail closed. */
export function parseIntegrationId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
