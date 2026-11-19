import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { statusFromLookup, toResultStatus, type ResultStatus } from '@/lib/checkout/attempt'
import { lookupRemoteOrders } from '@/lib/hugeprofit/orders'
import { ourOrders } from '@/lib/hugeprofit/order-rules'
import { getInvoiceStatus, getStatement, payloadKeyring } from '@/lib/mono/client'
import { resultTokenValid } from '@/lib/mono/payload'
import { parseIntegrationId } from '@/lib/mono/rules'
import { ResultView } from '@/components/checkout/result-view'

export const metadata: Metadata = {
  title: 'Оформлення',
  robots: { index: false },
}

const STATEMENT_DAYS = 2

/** Cookie first (this browser's invoice); else the signed link: our CRM order, then mono's statement. */
async function resultStatus(ref: string, token: string): Promise<ResultStatus> {
  if (!/^\d{15}$/.test(ref)) return 'unknown'
  const invoiceId = (await cookies()).get(`mono_inv_${ref}`)?.value
  if (invoiceId) {
    try {
      const read = await getInvoiceStatus(invoiceId)
      if (read.reference === ref) return toResultStatus(read, ref)
    } catch {
      return 'pending' // temporarily unavailable: the page offers a refresh
    }
  }
  const ring = payloadKeyring()
  const integrationId = parseIntegrationId(process.env.CRM_INTEGRATION_ID)
  if (!ring || integrationId === null || !resultTokenValid(ref, token, ring)) return 'unknown'
  try {
    const orders = ourOrders(await lookupRemoteOrders(ref), integrationId, ref).length
    if (orders > 0) return 'paid'
    const now = Math.floor(Date.now() / 1000)
    const paid = (await getStatement(now - STATEMENT_DAYS * 86_400, now)).find((item) => item.reference === ref)
    return statusFromLookup(orders, paid)
  } catch {
    return 'pending'
  }
}

/** Buyer-facing status only — never creates or promises a CRM order (mono-callback does that). */
export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; t?: string }>
}) {
  const { ref = '', t = '' } = await searchParams
  return <ResultView status={await resultStatus(ref, t)} reference={ref} token={t} />
}
