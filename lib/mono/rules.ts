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
  if (!i.merchantId) return null
  const isTest = i.merchantId.startsWith('test_')
  if (i.vercelEnv === 'production') {
    return !isTest && i.merchantId === i.liveMerchantId && i.warehouseId === '34998' ? 'live' : null
  }
  return isTest && i.merchantId === i.testMerchantId && i.warehouseId === '51630' ? 'test' : null
}

export const SITE_REFERENCE = /^\d{15}$/

export function siteInvoiceDestination(reference: string): string {
  return `Замовлення Plai Pich #${reference}`
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

type InvoiceIdentity = Pick<Status, 'invoiceId' | 'reference' | 'ccy' | 'amount'>

export function sameInvoice(a: InvoiceIdentity, b: InvoiceIdentity): boolean {
  return a.invoiceId === b.invoiceId && a.reference === b.reference && a.ccy === b.ccy && a.amount === b.amount
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
  if (!sameInvoice(read, signed)) return 'status read mismatch'
  if (read.status === 'reversed' || read.status === 'failure') return `status ${read.status}`
  if (read.cancelList && read.cancelList.length > 0) return 'cancelList present'
  if (read.status === 'success') {
    return read.finalAmount === undefined || read.finalAmount === read.amount ? 'ok' : 'status finalAmount differs'
  }
  if (read.status === 'created' || read.status === 'processing') {
    // Before settlement mono may send 0; an intermediate nonzero value can't be treated as a full charge.
    const canBeUnsettled = read.finalAmount === undefined || read.finalAmount === 0 || read.finalAmount === read.amount
    const older = !read.modifiedDate || Date.parse(read.modifiedDate) < Date.parse(signed.modifiedDate ?? '')
    if (canBeUnsettled && older) return 'ok'
  }
  return `status ${read.status}`
}

/** Our HugeProfit integration id. A missing or garbled one would make every lookup "absent": fail closed. */
export function parseIntegrationId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
