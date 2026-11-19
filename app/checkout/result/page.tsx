import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { toResultStatus, type ResultStatus } from '@/lib/checkout/attempt'
import { lookupRemoteOrders } from '@/lib/hugeprofit/orders'
import { ourOrders } from '@/lib/hugeprofit/order-rules'
import { getInvoiceStatus, getStatement, payloadKeyring } from '@/lib/mono/client'
import { resultTokenIssuedAt } from '@/lib/mono/payload'
import { parseIntegrationId } from '@/lib/mono/rules'
import { ResultView } from '@/components/checkout/result-view'

export const metadata: Metadata = {
  title: 'Оформлення',
  robots: { index: false },
}

const DAY = 86_400
// Statement lag on a fresh payment (unverified, cutover Task 4). Longer would tell a buyer whose payment
// failed "don't pay again" (pending copy); «не знайдено» covers both cases.
const RECENT_S = 15 * 60
const MAX_SPAN = 31 * DAY // mono statement limit

/**
 * Only a link our checkout signed may make this page call mono or the CRM. The invoice comes from this
 * browser's cookie, else mono's statement, else our CRM order's note; its live status tells paid from refunded.
 */
async function resultStatus(ref: string, token: unknown): Promise<ResultStatus> {
  if (!/^\d{15}$/.test(ref)) return 'unknown'
  const ring = payloadKeyring()
  const issuedAt = ring ? resultTokenIssuedAt(ref, token, ring) : null
  if (issuedAt === null) return 'unknown'
  const now = Math.floor(Date.now() / 1000)
  try {
    // A cookie that isn't this reference's invoice (or can't be read) is ignored, so the page never says
    // anything about invoice ids a browser makes up.
    const cookieId = (await cookies()).get(`mono_inv_${ref}`)?.value
    const read = cookieId ? await getInvoiceStatus(cookieId).catch(() => null) : null
    if (read?.reference === ref) return toResultStatus(read, ref)
    const from = Math.max(Math.min(issuedAt, now) - DAY, now - MAX_SPAN)
    let invoiceId = (await getStatement(from, now)).find((item) => item.reference === ref)?.invoiceId
    if (!invoiceId) {
      // Statement lag, or older than its 31-day window: the webhook's order notes the invoice.
      const integrationId = parseIntegrationId(process.env.CRM_INTEGRATION_ID)
      const orders = integrationId === null ? [] : ourOrders(await lookupRemoteOrders(ref), integrationId, ref)
      invoiceId = orders[0]?.info?.order_text?.match(/mono invoice (\S+)/)?.[1]
      if (orders.length > 0 && !invoiceId) return 'paid' // note edited by hand; the webhook writes paid orders only
      if (!invoiceId) return now - issuedAt < RECENT_S ? 'pending' : 'notfound'
    }
    return toResultStatus(await getInvoiceStatus(invoiceId), ref)
  } catch {
    return 'pending' // temporarily unavailable: the page offers a refresh
  }
}

/** Buyer-facing status only — never creates or promises a CRM order (mono-callback does that). */
export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; t?: string | string[] }>
}) {
  const { ref = '', t } = await searchParams
  const token = typeof t === 'string' ? t : ''
  return <ResultView status={await resultStatus(ref, token)} reference={ref} token={token} />
}
