import { NextResponse } from 'next/server'
import { getFreshProduct } from '@/lib/hugeprofit'
import type { OrderDelivery } from '@/lib/hugeprofit/orders'
import { checkoutRequestSchema } from '@/lib/checkout/schema'
import { resolveDelivery } from '@/lib/checkout/delivery'
import { callbackUrl, lockLines, MAX_CALLBACK_URL_BYTES } from '@/lib/checkout/lock'
import { checkoutEnabled, createInvoice, payloadKeyring } from '@/lib/mono/client'
import { boundedInteger, invoiceLimitKop } from '@/lib/mono/config'
import { encryptPayload, newReference, resultToken } from '@/lib/mono/payload'
import { isAllowedPageUrl, siteInvoiceDestination } from '@/lib/mono/rules'
import type { OrderContact } from '@/lib/mono/types'
import { WEBSITE_URL } from '@/lib/site'

/**
 * Validates the cart against fresh CRM data and creates a plata by mono invoice.
 * No CRM order is created here — only mono-callback does that, once payment clears.
 * The order rides encrypted in our own webhook URL (spec approach A).
 */

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 })
}

export async function POST(request: Request) {
  const vercelEnv = process.env.VERCEL_ENV
  const maxTotalKop = invoiceLimitKop(process.env.MONO_MAX_TOTAL_KOP, vercelEnv)
  const maxCallbackBytes = boundedInteger(process.env.MONO_CALLBACK_MAX_BYTES, MAX_CALLBACK_URL_BYTES, MAX_CALLBACK_URL_BYTES)
  if (maxTotalKop === null || maxCallbackBytes === null || !(await checkoutEnabled())) {
    return NextResponse.json({ error: 'payments_disabled' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('invalid')
  }

  const result = checkoutRequestSchema.safeParse(body)
  if (!result.success) return badRequest('invalid')
  const parsed = result.data

  let delivery: OrderDelivery | null
  try {
    delivery = await resolveDelivery(parsed.delivery)
  } catch (error) {
    console.error('[checkout] Nova Poshta lookup failed', error)
    return NextResponse.json({ error: 'delivery_unavailable' }, { status: 503 })
  }
  if (!delivery) return badRequest('delivery')

  const { firstName, lastName, email, phone } = parsed.contact
  const contact: OrderContact = {
    name: `${firstName} ${lastName}`,
    email,
    phone,
    city: delivery.city,
    address: delivery.address,
    delivery: delivery.method,
  }

  // Checkout-time truth: bypasses the 5-minute catalog cache, one call per line
  // because `product_id` rejects a comma list.
  let fresh: Awaited<ReturnType<typeof getFreshProduct>>[]
  try {
    fresh = await Promise.all(parsed.items.map((i) => getFreshProduct(i.workId)))
  } catch (error) {
    console.error('[checkout] CRM stock read failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'generic' }, { status: 503 })
  }
  const lock = lockLines(parsed.items, fresh)
  if (!lock.ok) {
    if (lock.error === 'unavailable') return NextResponse.json({ error: 'unavailable', unavailable: lock.unavailable }, { status: 409 })
    if (lock.error === 'insufficient') return NextResponse.json({ error: 'insufficient', short: lock.short }, { status: 409 })
    if (lock.error === 'repriced') return NextResponse.json({ error: 'repriced', repriced: lock.repriced }, { status: 409 })
    console.error('[checkout] invalid CRM price', { productIds: lock.productIds })
    return badRequest('invalid')
  }
  if (lock.totalKop > maxTotalKop) return badRequest('amount_limit')

  const ring = payloadKeyring()!
  const reference = newReference()
  const webHookUrl = callbackUrl(
    WEBSITE_URL,
    encryptPayload({ v: 1, reference, lines: lock.lines, totalKop: lock.totalKop, contact }, ring),
    maxCallbackBytes,
    vercelEnv === 'preview' ? process.env.MONO_PREVIEW_BYPASS_SECRET : undefined,
  )
  if (!webHookUrl) {
    console.error('[checkout] callback URL over the cap', { reference })
    return badRequest('invalid')
  }

  let invoice: { invoiceId: string; pageUrl: string }
  try {
    invoice = await createInvoice({
      amountKop: lock.totalKop,
      reference,
      destination: siteInvoiceDestination(reference),
      redirectUrl: `${WEBSITE_URL}/checkout/result?ref=${reference}&t=${resultToken(reference, ring, Math.floor(Date.now() / 1000))}`,
      webHookUrl,
    })
  } catch (error) {
    // Outcome unknown: never retried. The buyer never saw this pageUrl, so it can't be paid.
    console.error('[checkout] mono invoice create failed', { reference, error: error instanceof Error ? error.message : error })
    return NextResponse.json({ error: 'generic' }, { status: 502 })
  }
  if (!isAllowedPageUrl(invoice.pageUrl)) {
    console.error('[checkout] unexpected mono pageUrl host', { reference, invoiceId: invoice.invoiceId })
    return NextResponse.json({ error: 'generic' }, { status: 502 })
  }

  const response = NextResponse.json({ pageUrl: invoice.pageUrl, reference }, { status: 200 })
  response.cookies.set(`mono_inv_${reference}`, invoice.invoiceId, {
    httpOnly: true,
    secure: WEBSITE_URL.startsWith('https'),
    sameSite: 'lax',
    path: '/checkout',
    maxAge: 86_400,
  })
  return response
}
