import type { Metadata } from 'next'
import { checkStatus, paymentsEnabled } from '@/lib/liqpay/client'
import { ResultView } from '@/components/checkout/result-view'

export const metadata: Metadata = {
  title: 'Оформлення',
  robots: { index: false },
}

export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ paymentId?: string }>
}) {
  const { paymentId } = await searchParams
  const id = paymentId && /^\d+$/.test(paymentId) ? Number(paymentId) : null
  const status = id && paymentsEnabled() ? await checkStatus(id) : 'unknown'
  return <ResultView status={status} />
}
