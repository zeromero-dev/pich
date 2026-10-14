'use client'

import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { motion } from 'motion/react'
import { spring } from '@/lib/motion'
import { useCart, useLocale } from '@/components/providers'
import { PillLink } from '@/components/pill-button'
import { LogoMark } from '@/components/logo'
import type { LiqPayStatus } from '@/lib/liqpay/types'

export function ResultView({ status }: { status: LiqPayStatus }) {
  const { t } = useLocale()
  const { clear } = useCart()
  const cleared = useRef(false)

  useEffect(() => {
    if ((status === 'success' || status === 'sandbox') && !cleared.current) {
      cleared.current = true
      clear()
    }
  }, [status, clear])

  const paid = status === 'success' || status === 'sandbox'
  const failed = status === 'failure'

  if (!paid && !failed) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          {t.checkout.resultPendingTitle}
        </h1>
        <p className="mt-3 text-base text-ink-soft">{t.checkout.resultPendingBody}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={spring.snap}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-ink"
      >
        {paid ? (
          <Check className="size-7 text-surface" aria-hidden="true" />
        ) : (
          <X className="size-7 text-surface" aria-hidden="true" />
        )}
      </motion.div>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-ink">
        {paid ? t.checkout.resultSuccessTitle : t.checkout.resultFailedTitle}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">
        {paid ? t.checkout.resultSuccessBody : t.checkout.resultFailedBody}
      </p>
      <PillLink href={paid ? '/shop' : '/checkout'} className="mt-8">
        {paid ? t.cart.continue : t.checkout.backToCart}
      </PillLink>
      {paid && <LogoMark className="mt-16 h-9 w-auto text-ink-faint" />}
    </main>
  )
}
