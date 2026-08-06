'use client'

import { useLocale } from '@/components/providers'
import { PillLink } from '@/components/pill-button'

export default function NotFound() {
  const { t } = useLocale()

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center md:px-6">
      <p className="text-sm font-medium text-ink-faint tabular-nums">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-ink">
        {t.notFound.title}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">
        {t.notFound.body}
      </p>
      <PillLink href="/" className="mt-8">
        {t.notFound.home}
      </PillLink>
    </main>
  )
}
