import type { DeliveryMethod } from '@/lib/checkout/schema'
import { fromKop, parseCrmLineTotal, toKop } from '@/lib/mono/money'
import type { OrderContact } from '@/lib/mono/types'

/**
 * Pure CRM order rules (no I/O, no server-only) so `npm test` can run them.
 * Field shapes confirmed on live dev orders 2026-08-13, 2026-09-08 and 2026-11-18.
 */

export type OrderDelivery = { method: DeliveryMethod; city: string; address: string }

export type OrderLine = { productId: string; sku: string; name: string; unitPriceKop: number; qty: number }

export type PaymentInfo = { isPaid: boolean; paymentType: string; orderText?: string }

/** `first_name` is required; the form's two name fields arrive joined. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
}

function isNovaPoshta(method: DeliveryMethod | undefined): boolean {
  return method === 'branch' || method === 'locker' || method === 'courier'
}

/** Amounts go out as `kop / 100`, which JSON-serializes to the exact two-decimal value (spec Money rule 5). */
export function buildOrderPayload(reference: string, lines: OrderLine[], contact: OrderContact, payment: PaymentInfo) {
  const { first, last } = splitName(contact.name)
  const total = lines.reduce((sum, line) => sum + line.unitPriceKop * line.qty, 0)
  return {
    data: {
      order_id: reference,
      order_name: `Замовлення з сайту #${reference}`,
      price: fromKop(total),
      currency: 'UAH',
      status: 'pending',
      first_name: first,
      last_name: last,
      phone: contact.phone,
      ...(contact.email ? { email: contact.email } : {}),
      address_1: {
        address_1: contact.address,
        city: contact.city,
        // Always 0 — the site does not price delivery (checkout.md).
        delivery_cost: 0,
        ...(isNovaPoshta(contact.delivery) ? { delivery_operator: 'nova_poshta' } : {}),
      },
      info: {
        is_paid: payment.isPaid,
        payment_type: payment.paymentType,
        ...(payment.orderText ? { order_text: payment.orderText } : {}),
      },
      order_data: lines.map((line) => ({
        // `product_id` is the *marketplace* remote id; ours live in HugeProfit (local_product_id).
        product_id: null,
        local_product_id: Number(line.productId),
        id: Number(line.productId),
        name: line.name,
        sku: line.sku,
        quantity: line.qty,
        price: fromKop(line.unitPriceKop),
        total: fromKop(line.unitPriceKop * line.qty),
        is_paid: payment.isPaid,
        payment_type: payment.paymentType,
      })),
    },
  }
}

export type CrmRemoteOrder = {
  integration_id: number
  order_id: string
  sales_id: number | null
  price: number
  currency: string
  info?: { is_paid?: boolean; order_text?: string }
  order_data?: { local_product_id: number; quantity: number; total?: unknown; is_reserved?: boolean; mid?: string | number }[]
}

export type Expected = {
  reference: string
  invoiceId: string
  totalKop: number
  lines: { productId: string; qty: number }[]
}

const isUah = (currency: string) => currency === 'UAH' || currency === 'грн'

function reservationProblems(order: CrmRemoteOrder, warehouseId: string): string[] {
  if (order.sales_id !== null) return [] // converted to a sale: the CRM released the reservation by design
  const problems = new Set<string>()
  for (const line of order.order_data ?? []) {
    if (line.is_reserved !== true) problems.add('unreserved line')
    else if (String(line.mid) !== warehouseId) problems.add('reserved in wrong warehouse')
  }
  return [...problems]
}

/**
 * Is this payment already in the CRM? Only our integration's entries count —
 * the lookup also returns other integrations' orders. A differing order is never rewritten.
 */
export function classifyExisting(
  orders: CrmRemoteOrder[],
  integrationId: number,
  expected: Expected,
  warehouseId: string,
): 'absent' | 'recorded' | 'partial' | 'conflict' {
  const mine = orders.filter((order) => order.integration_id === integrationId)
  if (mine.length === 0) return 'absent'
  if (mine.length > 1) return 'conflict'
  const order = mine[0]
  const identical =
    String(order.order_id) === expected.reference &&
    order.info?.is_paid === true &&
    (order.info.order_text ?? '').includes(expected.invoiceId) &&
    isUah(order.currency) &&
    toKop(order.price) === expected.totalKop
  if (!identical) return 'conflict'

  const want = new Map(expected.lines.map((line) => [line.productId, line.qty]))
  for (const line of order.order_data ?? []) {
    if (want.get(String(line.local_product_id)) !== line.quantity) return 'conflict'
    want.delete(String(line.local_product_id))
  }
  if (want.size > 0) return 'partial' // a line the CRM silently dropped
  return reservationProblems(order, warehouseId).length > 0 ? 'partial' : 'recorded'
}

/** POST response `reservedProducts`: `[product_id, warehouse_id]` pairs (no quantity). */
export function reservationComplete(reserved: unknown, lines: { productId: string }[], warehouseId: string): boolean {
  if (!Array.isArray(reserved)) return false
  const ok = new Set(
    reserved
      .filter((pair): pair is [unknown, unknown] => Array.isArray(pair) && String(pair[1]) === warehouseId)
      .map((pair) => String(pair[0])),
  )
  return lines.every((line) => ok.has(line.productId))
}

/** Report checks the CRM alone can prove (spec "Zero deliveries"). Empty = healthy. */
export function orderHealth(order: CrmRemoteOrder, warehouseId: string): string[] {
  const problems: string[] = []
  const totals = (order.order_data ?? []).map((line) => parseCrmLineTotal(line.total))
  if (totals.some((kop) => kop === null)) problems.push('unverifiable line totals')
  else if (totals.reduce<number>((sum, kop) => sum + kop!, 0) !== toKop(order.price)) {
    problems.push('total differs from line sum')
  }
  return [...problems, ...reservationProblems(order, warehouseId)]
}
