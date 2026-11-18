import { NextResponse } from 'next/server'
import { getFreshProduct } from '@/lib/hugeprofit'
import { SHOP_WAREHOUSE_ID } from '@/lib/hugeprofit/client'
import { classifyExisting, reservationComplete, type OrderLine } from '@/lib/hugeprofit/order-rules'
import { createRemoteOrder, lookupRemoteOrders } from '@/lib/hugeprofit/orders'
import { getInvoiceStatus, paymentMode, payloadKeyring, verifyWebhook } from '@/lib/mono/client'
import { decryptPayload } from '@/lib/mono/payload'
import { MAX_WEBHOOK_BYTES, adverseEvidence, checkSignedEvent, parseIntegrationId, screenRequest } from '@/lib/mono/rules'
import { invoiceStatusSchema, type CheckoutPayload, type InvoiceStatus } from '@/lib/mono/types'

/**
 * plata by mono webhook — the only place a CRM order is created for a paid checkout.
 * 200 = handled or unfixable by a retry (logged for reconciliation); 503 = transient,
 * mono retries (three attempts in all). Never logs the query string or buyer data.
 */

export const maxDuration = 30

const ok = () => new NextResponse(null, { status: 200 })
const retry = () => new NextResponse(null, { status: 503 })

type Ctx = { invoiceId?: string; reference?: string; expectedKop?: number; reportedKop?: number; productIds?: string[] }

function reconcile(reason: string, ctx: Ctx) {
  console.error('[mono-callback] reconcile', { reason, ccy: 980, ...ctx })
  return ok()
}

export async function POST(request: Request) {
  const xSign = request.headers.get('x-sign')
  const screen = screenRequest(request.headers.get('content-length'), xSign)
  if (screen !== 'ok') {
    console.error('[mono-callback] rejected', { reason: screen })
    return ok()
  }
  const raw = Buffer.from(await request.arrayBuffer())
  if (raw.length > MAX_WEBHOOK_BYTES) {
    console.error('[mono-callback] rejected', { reason: 'too_large' })
    return ok()
  }

  const signature = await verifyWebhook(raw, xSign)
  if (signature === 'unavailable') return retry()
  if (signature === 'invalid') {
    console.error('[mono-callback] invalid signature')
    return ok()
  }

  let body: InvoiceStatus
  try {
    const parsed = invoiceStatusSchema.safeParse(JSON.parse(raw.toString('utf8')))
    if (!parsed.success) throw new Error('shape')
    body = parsed.data
  } catch {
    console.error('[mono-callback] unparsable signed body')
    return ok()
  }
  // Other statuses never touch the CRM; refunds and reversals surface in the reconcile report.
  if (body.status !== 'success') return ok()

  const mode = await paymentMode()
  if (!mode) {
    console.error('[mono-callback] payment mode check failed', { invoiceId: body.invoiceId })
    return retry()
  }
  const p = new URL(request.url).searchParams.get('p') ?? ''
  // Test mode only: what Task 10's replay rehearsals need. Never in live mode.
  if (mode === 'test') console.info('[mono-callback] replay', { p, raw: raw.toString('utf8'), xSign })

  const ring = payloadKeyring()
  const payload: CheckoutPayload | null = ring ? decryptPayload(p, ring) : null
  const ctx: Ctx = { invoiceId: body.invoiceId, reference: body.reference, reportedKop: body.amount }
  if (!payload) return reconcile('payload unreadable', ctx)
  ctx.expectedKop = payload.totalKop
  ctx.productIds = payload.lines.map((line) => line.productId)

  const signed = checkSignedEvent(body, payload)
  if (signed !== 'ok') return reconcile(signed, ctx)

  const warehouseId = String(SHOP_WAREHOUSE_ID)
  const integrationId = parseIntegrationId(process.env.CRM_INTEGRATION_ID)
  if (integrationId === null) {
    console.error('[mono-callback] CRM_INTEGRATION_ID missing or invalid', ctx)
    return retry()
  }
  const expected = {
    reference: payload.reference,
    invoiceId: body.invoiceId,
    totalKop: payload.totalKop,
    lines: payload.lines.map(({ productId, qty }) => ({ productId, qty })),
  }
  const existing = async () => classifyExisting(await lookupRemoteOrders(payload.reference), integrationId, expected, warehouseId)

  let state: Awaited<ReturnType<typeof existing>>
  try {
    state = await existing()
  } catch (error) {
    console.error('[mono-callback] CRM lookup failed', { ...ctx, error: error instanceof Error ? error.message : error })
    return retry()
  }
  if (state === 'recorded') return ok()
  if (state !== 'absent') return reconcile(`existing order ${state}`, ctx)

  try {
    const evidence = adverseEvidence(await getInvoiceStatus(body.invoiceId), body)
    if (evidence !== 'ok') return reconcile(evidence, ctx)
  } catch {
    return retry()
  }

  let fresh: Awaited<ReturnType<typeof getFreshProduct>>[]
  try {
    fresh = await Promise.all(payload.lines.map((line) => getFreshProduct(line.productId)))
  } catch {
    return retry()
  }
  if (fresh.some((product, i) => !product || product.available < payload.lines[i].qty)) {
    // Paid but sold out in the meantime — no automated refund; the operator handles it.
    return reconcile('paid but sold out', ctx)
  }

  const lines: OrderLine[] = payload.lines.map((line, i) => ({
    productId: line.productId,
    sku: fresh[i]!.sku ?? '',
    name: fresh[i]!.name,
    unitPriceKop: line.unitPriceKop, // the price actually charged, never the fresh one
    qty: line.qty,
  }))

  let reservedProducts: unknown
  try {
    ;({ reservedProducts } = await createRemoteOrder(payload.reference, lines, payload.contact, {
      isPaid: true,
      paymentType: 'plata by mono',
      orderText: `mono invoice ${body.invoiceId}`,
    }))
  } catch (error) {
    console.error('[mono-callback] CRM write failed', { ...ctx, error: error instanceof Error ? error.message : error })
    // Outcome unknown: look again, never write twice in one delivery.
    try {
      const after = await existing()
      if (after === 'recorded') return ok()
      if (after !== 'absent') return reconcile(`order after failed write ${after}`, ctx)
    } catch {
      /* fall through to retry */
    }
    return retry()
  }

  if (!reservationComplete(reservedProducts, lines, warehouseId)) return reconcile('unreserved', ctx)
  return ok()
}
