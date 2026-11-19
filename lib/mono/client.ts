import 'server-only'
import { boundedInteger } from '@/lib/mono/config'
import { parseKeyring, type Keyring } from '@/lib/mono/payload'
import { parseIntegrationId, resolvePaymentMode, type PaymentMode } from '@/lib/mono/rules'
import { verifySignature } from '@/lib/mono/signature'
import { invoiceStatusSchema, type InvoiceStatus } from '@/lib/mono/types'

/** plata by mono (monobank acquiring). Facts verified 2026-11-18: see the spec's API table. */
const BASE = 'https://api.monobank.ua/api/merchant'
const TIMEOUT_MS = 10_000

/** Messages carry the path and status only — never a response body. */
export class MonoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'MonoError'
  }
}

async function monoFetch(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<unknown> {
  const token = process.env.MONO_TOKEN
  if (!token) throw new MonoError('MONO_TOKEN is not set')
  let res: Response
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: init.method ?? 'GET',
      headers: { 'X-Token': token, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new MonoError(`mono ${path} unreachable`)
  }
  if (!res.ok) throw new MonoError(`mono ${path} responded ${res.status}`, res.status)
  try {
    return await res.json()
  } catch {
    throw new MonoError(`mono ${path} returned non-JSON`)
  }
}

export function payloadKeyring(): Keyring | null {
  return parseKeyring(process.env.MONO_PAYLOAD_KEYS)
}

// Per instance; only a successful read is cached, so a failed one is retried next call.
let merchantId: string | null = null

export async function paymentMode(): Promise<PaymentMode | null> {
  if (!merchantId) {
    try {
      const details = (await monoFetch('details')) as { merchantId?: unknown }
      if (typeof details.merchantId === 'string') merchantId = details.merchantId
    } catch (error) {
      console.error('[mono] merchant details read failed', error instanceof Error ? error.message : error)
    }
  }
  return resolvePaymentMode({
    vercelEnv: process.env.VERCEL_ENV,
    merchantId,
    liveMerchantId: process.env.MONO_MERCHANT_ID,
    testMerchantId: process.env.MONO_TEST_MERCHANT_ID,
    warehouseId: process.env.CRM_WAREHOUSE_ID,
  })
}

/** New invoices only; callbacks and the payment report keep working while paused (spec "Rollback"). */
export async function checkoutEnabled(): Promise<boolean> {
  if (!process.env.MONO_TOKEN || !payloadKeyring() || process.env.PAYMENTS_PAUSED === '1') return false
  if (parseIntegrationId(process.env.CRM_INTEGRATION_ID) === null) return false
  if (process.env.VERCEL_ENV === 'production') {
    if (process.env.WEBSITE_URL !== 'https://www.pich.co.ua' || !process.env.PRIVACY_DATA_CONTROLLER?.trim()) return false
    if (!process.env.REPORT_KEY || boundedInteger(process.env.REPORT_WINDOW_DAYS, 31, 7) === null) return false
  }
  return (await paymentMode()) !== null
}

/** Never retried: an ambiguous outcome is reported as an error and the buyer resubmits under a new reference. */
export async function createInvoice(r: {
  amountKop: number
  reference: string
  destination: string
  redirectUrl: string
  webHookUrl: string
}): Promise<{ invoiceId: string; pageUrl: string }> {
  const json = (await monoFetch('invoice/create', {
    method: 'POST',
    body: {
      amount: r.amountKop,
      ccy: 980,
      paymentType: 'debit',
      merchantPaymInfo: { reference: r.reference, destination: r.destination },
      redirectUrl: r.redirectUrl,
      webHookUrl: r.webHookUrl,
    },
  })) as { invoiceId?: unknown; pageUrl?: unknown }
  if (typeof json.invoiceId !== 'string' || typeof json.pageUrl !== 'string') {
    throw new MonoError('mono invoice/create returned no invoiceId/pageUrl')
  }
  return { invoiceId: json.invoiceId, pageUrl: json.pageUrl }
}

export async function getInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
  const json = await monoFetch(`invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`)
  const parsed = invoiceStatusSchema.safeParse(json)
  if (!parsed.success || parsed.data.invoiceId !== invoiceId) {
    throw new MonoError('mono invoice/status returned an unexpected invoice')
  }
  return parsed.data
}

export type StatementItem = InvoiceStatus & { date?: string }

export async function getStatement(fromUnix: number, toUnix: number): Promise<StatementItem[]> {
  const json = (await monoFetch(`statement?from=${fromUnix}&to=${toUnix}`)) as { list?: unknown }
  if (!Array.isArray(json.list)) throw new MonoError('mono statement returned no list')
  return json.list.map((item) => {
    const parsed = invoiceStatusSchema.safeParse(item)
    if (!parsed.success) throw new MonoError('mono statement item has an unexpected shape')
    return parsed.data as StatementItem
  })
}

/* Public key: cached per instance; after a failed check refreshed at most once per 10 s (inside mono's
   ~1 min of retries, so a rotated key still lands), with one shared in-flight fetch: forged requests can't
   drive a mono call each. */
const PUBKEY_REFRESH_MS = 10_000
let pubkey: string | null = null
let pubkeyTriedAt = 0
let pubkeyInFlight: Promise<string | null> | null = null

/** `null`: the fetch failed, or one was tried within PUBKEY_REFRESH_MS — the caller answers "retry later". */
function fetchPubkey(): Promise<string | null> {
  if (pubkeyInFlight) return pubkeyInFlight
  if (Date.now() - pubkeyTriedAt < PUBKEY_REFRESH_MS) return Promise.resolve(null)
  pubkeyTriedAt = Date.now()
  pubkeyInFlight = monoFetch('pubkey')
    .then((json) => {
      const key = (json as { key?: unknown }).key
      if (typeof key !== 'string') return null
      pubkey = Buffer.from(key, 'base64').toString('utf8')
      return pubkey
    })
    .catch(() => null)
    .finally(() => {
      pubkeyInFlight = null
    })
  return pubkeyInFlight
}

export async function verifyWebhook(rawBody: Buffer, xSign: string | null): Promise<'valid' | 'invalid' | 'unavailable'> {
  if (!xSign) return 'invalid'
  const key = pubkey ?? (await fetchPubkey())
  if (!key) return 'unavailable'
  if (verifySignature(rawBody, xSign, key)) return 'valid'
  // Can't refresh yet: "retry later", so a real webhook signed with a just-rotated key isn't dropped.
  const fresh = await fetchPubkey()
  if (!fresh) return 'unavailable'
  return verifySignature(rawBody, xSign, fresh) ? 'valid' : 'invalid'
}
