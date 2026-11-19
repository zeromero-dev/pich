'use client'

import { useEffect, useRef } from 'react'
import { Check, CircleHelp, Clock, Search, X, type LucideIcon } from 'lucide-react'
import { m } from 'motion/react'
import { spring } from '@/lib/motion'
import { useCart, useLocale, type CartItem } from '@/components/providers'
import { PillLink } from '@/components/pill-button'
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

type Action = { href: string; label: string }

export function ResultView({ status, reference, token }: { status: ResultStatus; reference: string; token: string }) {
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

  const c = t.checkout
  const refresh: Action = {
    href: `/checkout/result?ref=${reference}${token ? `&t=${encodeURIComponent(token)}` : ''}`,
    label: c.resultRefresh,
  }
  const shop: Action = { href: '/shop', label: t.cart.continue }
  const cart: Action = { href: '/checkout', label: c.backToCart }

  const screens: Record<ResultStatus, { icon: LucideIcon; title: string; body: string; primary: Action; secondary?: Action }> = {
    paid: { icon: Check, title: c.resultSuccessTitle, body: c.resultSuccessBody, primary: shop },
    pending: { icon: Clock, title: c.resultPendingTitle, body: c.resultPendingBody, primary: refresh },
    notfound: { icon: Search, title: c.resultNotFoundTitle, body: c.resultNotFoundBody, primary: refresh, secondary: cart },
    failed: { icon: X, title: c.resultFailedTitle, body: c.resultFailedBody, primary: cart },
    expired: { icon: X, title: c.resultExpiredTitle, body: c.resultExpiredBody, primary: cart },
    reversed: { icon: X, title: c.resultReversedTitle, body: c.resultReversedBody, primary: shop },
    unknown: { icon: CircleHelp, title: c.resultUnknownTitle, body: c.resultUnknownBody, primary: shop },
  }
  const { icon: Icon, title, body, primary, secondary } = screens[status]

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
      <m.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={spring.snap}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-ink"
      >
        <Icon className="size-7 text-surface" aria-hidden="true" />
      </m.div>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">{body}</p>
      <PillLink href={primary.href} className="mt-8">
        {primary.label}
      </PillLink>
      {secondary && (
        <PillLink href={secondary.href} variant="ghost" className="mt-3">
          {secondary.label}
        </PillLink>
      )}
    </main>
  )
}
