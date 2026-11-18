'use client'

import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { m } from 'motion/react'
import { spring } from '@/lib/motion'
import { useCart, useLocale, type CartItem } from '@/components/providers'
import { PillLink } from '@/components/pill-button'
import { LogoMark } from '@/components/logo'
import {
  ATTEMPT_KEY,
  CART_KEY,
  cartClearDecision,
  cartFingerprint,
  lineUnitKop,
  type Attempt,
  type ResultStatus,
} from '@/lib/checkout/attempt'

/* Reads the saved cart itself: this effect runs before the cart provider has loaded it. */
function savedFingerprint(): string {
  const items = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as CartItem[]
  return cartFingerprint(items.map(({ product, qty }) => ({ productId: product.id, qty, unitPriceKop: lineUnitKop(product) })))
}

export function ResultView({ status, reference }: { status: ResultStatus; reference: string }) {
  const { t } = useLocale()
  const { clear } = useCart()
  const handled = useRef<ResultStatus | null>(null)

  useEffect(() => {
    // Per status: the refresh link soft-navigates, so pending → paid reuses this component.
    if (handled.current === status) return
    handled.current = status
    try {
      const attempt = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? 'null') as Attempt | null
      const decision = cartClearDecision(status, reference, attempt, savedFingerprint())
      if (decision.clear) clear()
      if (decision.dropAttempt) sessionStorage.removeItem(ATTEMPT_KEY)
    } catch {
      /* storage blocked: nothing to clear */
    }
  }, [status, reference, clear])

  const paid = status === 'paid'

  if (status === 'unknown') {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{t.checkout.resultUnknownTitle}</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">{t.checkout.resultUnknownBody}</p>
        <PillLink href="/shop" className="mt-8">
          {t.cart.continue}
        </PillLink>
      </main>
    )
  }

  if (status === 'pending') {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          {t.checkout.resultPendingTitle}
        </h1>
        <p className="mt-3 text-base text-ink-soft">{t.checkout.resultPendingBody}</p>
        <PillLink href={`/checkout/result?ref=${reference}`} className="mt-8">
          {t.checkout.resultRefresh}
        </PillLink>
      </main>
    )
  }

  const title = { paid: t.checkout.resultSuccessTitle, failed: t.checkout.resultFailedTitle, expired: t.checkout.resultExpiredTitle, reversed: t.checkout.resultReversedTitle }[status]
  const body = { paid: t.checkout.resultSuccessBody, failed: t.checkout.resultFailedBody, expired: t.checkout.resultExpiredBody, reversed: t.checkout.resultReversedBody }[status]

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
      <m.div
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
      </m.div>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">
        {body}
      </p>
      <PillLink href={paid ? '/shop' : '/checkout'} className="mt-8">
        {paid ? t.cart.continue : t.checkout.backToCart}
      </PillLink>
      {paid && <LogoMark className="mt-16 h-9 w-auto text-ink-faint" />}
    </main>
  )
}
