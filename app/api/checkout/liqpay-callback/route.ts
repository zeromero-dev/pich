import { NextResponse } from 'next/server'
import { getFreshProduct } from '@/lib/hugeprofit'
import { verifyCallback, decodeCallback, paymentsEnabled } from '@/lib/liqpay/client'
import { decodePayload } from '@/lib/liqpay/payload'
import { createRemoteOrder, type OrderLine } from '@/lib/hugeprofit/orders'

/**
 * LiqPay's server_url webhook — the only place a CRM order is created for a
 * paid checkout. Cart lines + contact travel in the payment's `info`, which
 * LiqPay echoes back inside its signed `data`.
 */
export async function POST(request: Request) {
  // No keys means no signature can be verified, so nothing here is trustworthy.
  if (!paymentsEnabled()) return new NextResponse(null, { status: 400 })

  const form = await request.formData()
  const data = form.get('data')
  const signature = form.get('signature')
  if (typeof data !== 'string' || typeof signature !== 'string') {
    return new NextResponse(null, { status: 400 })
  }

  if (!verifyCallback(data, signature)) {
    console.error('[liqpay-callback] signature mismatch')
    return new NextResponse(null, { status: 401 })
  }

  const callback = decodeCallback(data)
  // `?payload=` is the pre-2026-11-05 carrier: payments started before deploy still notify that way.
  const encodedPayload =
    typeof callback.info === 'string' ? callback.info : new URL(request.url).searchParams.get('payload')
  // Our own tag on top of LiqPay's signature: a paid order holds only what our server put in it.
  const payload = encodedPayload ? decodePayload(encodedPayload) : null
  if (!payload) {
    console.error('[liqpay-callback] payload missing or signature mismatch', { orderId: callback.order_id })
    return new NextResponse(null, { status: 400 })
  }

  try {
    if (callback.status !== 'success' && callback.status !== 'sandbox') {
      return new NextResponse(null, { status: 200 })
    }

    const orderId = Number(callback.order_id)
    const { paymentId, lines: locked, contact } = payload

    if (paymentId !== orderId) {
      // The payload's order binding doesn't match what LiqPay's signature attested to —
      // either a bug or a replay/tamper attempt. Loud on purpose, same as the sold-out branch.
      console.error('[liqpay-callback] payload/order_id mismatch', { orderId, paymentId })
      return new NextResponse(null, { status: 200 })
    }

    const fresh = await Promise.all(locked.map((line) => getFreshProduct(line.productId)))
    const stillAvailable = fresh.every(
      (product, index) => !!product && product.available >= locked[index].qty,
    )

    if (!stillAvailable) {
      // Paid but sold out in the meantime — no automated refund exists.
      // Loud on purpose: this needs a human, never silently swallowed.
      console.error('[liqpay-callback] paid order not created — stock changed', {
        orderId,
        productIds: locked.map((l) => l.productId),
      })
      return new NextResponse(null, { status: 200 })
    }

    const lines: OrderLine[] = locked.map((line, index) => {
      const product = fresh[index]!
      return {
        productId: line.productId,
        sku: product.sku ?? '',
        name: product.name,
        price: line.price, // the price actually charged, not the (possibly stale) fresh price
        qty: line.qty,
      }
    })

    await createRemoteOrder(orderId, lines, contact, {
      isPaid: true,
      paymentType: 'LiqPay',
      orderText: `LiqPay order_id ${callback.order_id}`,
    })
  } catch (error) {
    console.error('[liqpay-callback] processing failed', {
      encodedPayloadPresent: !!encodedPayload,
      error,
    })
  }

  return new NextResponse(null, { status: 200 })
}
