'use client'

import { useEffect } from 'react'
import { useLocale } from '@/components/providers'
import { PillButton } from '@/components/pill-button'

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const { t } = useLocale()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        {t.errorPage.title}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">
        {t.errorPage.body}
      </p>
      <PillButton onClick={() => retry()} className="mt-8">
        {t.errorPage.retry}
      </PillButton>
    </main>
  )
}
