import type { Metadata } from 'next'
import { AboutView } from '@/components/about/about-view'

export const metadata: Metadata = {
  title: 'Про нас',
  description:
    'Плай Піч — арт-центр і крамничка сучасного українського мистецтва. Простір для виставок, майстер-класів і зустрічей.',
}

export default function AboutPage() {
  return <AboutView />
}
