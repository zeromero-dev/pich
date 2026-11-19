import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { statusFromLookup, toResultStatus, type ResultStatus } from '@/lib/checkout/attempt'
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
const RECENT_S = 15 * 60 // mono's statement may lag a fresh payment; unverified how long
const MAX_SPAN = 31 * DAY // mono statement limit

/** Cookie first (this browser's invoice); else the signed link: our CRM order, then mono's statement. */
async function resultStatus(ref: string, token: unknown): Promise<ResultStatus> {
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
  const issuedAt = ring ? resultTokenIssuedAt(ref, token, ring) : null
  if (issuedAt === null || integrationId === null) return 'unknown'
  try {
    if (ourOrders(await lookupRemoteOrders(ref), integrationId, ref).length > 0) return 'paid'
    const now = Math.floor(Date.now() / 1000)
    const from = Math.max(Math.min(issuedAt, now) - DAY, now - MAX_SPAN)
    const paid = (await getStatement(from, now)).find((item) => item.reference === ref)
    return statusFromLookup(paid, now - issuedAt < RECENT_S)
  } catch {
    return 'pending'
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
