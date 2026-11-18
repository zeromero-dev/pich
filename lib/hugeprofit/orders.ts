import 'server-only'

import { crmFetchUncached, crmPost, CrmError } from './client'
import { buildOrderPayload, type CrmRemoteOrder, type OrderLine, type PaymentInfo } from './order-rules'
import type { OrderContact } from '@/lib/mono/types'

/**
 * `POST /bapi/remote_orders`, verified end to end against the mock `dev`
 * warehouse (2026-09-08, 2026-11-05). The CRM reserves stock into the warehouse
 * its integration settings name, not the one we query. Payload rules: order-rules.ts.
 */

export type { CrmRemoteOrder, OrderDelivery, OrderLine, PaymentInfo } from './order-rules'
export type { OrderContact } from '@/lib/mono/types'

type RemoteOrderResponse = { success?: boolean; reservedProducts?: unknown }

export async function createRemoteOrder(
  reference: string,
  lines: OrderLine[],
  contact: OrderContact,
  payment: PaymentInfo,
): Promise<{ reservedProducts: unknown }> {
  const body = await crmPost<RemoteOrderResponse>('remote_orders', buildOrderPayload(reference, lines, contact, payment))
  return { reservedProducts: body.reservedProducts }
}

/** Every integration's orders with this `order_id`, whatever their date and state; callers filter by ours. */
export async function lookupRemoteOrders(reference: string): Promise<CrmRemoteOrder[]> {
  const body = await crmFetchUncached<{ success?: unknown; response?: unknown }>('remote_orders', { order_id: reference })
  if (body.success !== true || !Array.isArray(body.response)) {
    throw new CrmError('CRM remote_orders lookup returned an unexpected shape')
  }
  return body.response as CrmRemoteOrder[]
}
