import type { Metadata } from 'next'
import { checkStatus } from '@/lib/liqpay/client'
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
  const status = id ? await checkStatus(id) : 'unknown'
  return <ResultView status={status} />
}
