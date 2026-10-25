import type { Metadata } from 'next'
import { infoPages } from '@/lib/info-pages'
import { InfoPageView } from '@/components/info-page'

const page = infoPages.returns

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  ...(page.placeholder ? { robots: { index: false } } : {}),
}

export default function ReturnsPage() {
  return <InfoPageView page={page} />
}
