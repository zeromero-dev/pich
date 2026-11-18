import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { toResultStatus, type ResultStatus } from '@/lib/checkout/attempt'
import { getInvoiceStatus } from '@/lib/mono/client'
import { ResultView } from '@/components/checkout/result-view'

export const metadata: Metadata = {
  title: 'Оформлення',
  robots: { index: false },
}

/** Buyer-facing status only — never creates or promises a CRM order (mono-callback does that). */
export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const { ref = '' } = await searchParams
  let status: ResultStatus = 'pending'
  if (/^\d{15}$/.test(ref)) {
    const invoiceId = (await cookies()).get(`mono_inv_${ref}`)?.value
    if (invoiceId) {
      try {
        status = toResultStatus(await getInvoiceStatus(invoiceId), ref)
      } catch {
        /* temporarily unavailable: stays pending, the page offers a refresh */
      }
    }
  }
  return <ResultView status={status} reference={ref} />
}
