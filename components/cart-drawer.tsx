'use client'

import { useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { ShoppingBag, X } from 'lucide-react'
import { spring } from '@/lib/motion'
import { formatPrice } from '@/lib/format'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { useCart, useLocale } from '@/components/providers'
import { PillButton, PillLink } from '@/components/pill-button'

/* Mirrors Tailwind's max-sm breakpoint — the drawer is a bottom sheet below it. */
function useIsBottomSheet() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(max-width: 639px)')
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia('(max-width: 639px)').matches,
    () => false,
  )
}

export function CartDrawer() {
  const { items, subtotal, isOpen, close, remove } = useCart()
  const { t } = useLocale()
  const reduced = useReducedMotion()
  const bottomSheet = useIsBottomSheet()
  const trapRef = useFocusTrap<HTMLElement>(isOpen, close)
  const offscreen = bottomSheet ? { y: '100%' } : { x: '100%' }
  const onscreen = bottomSheet ? { y: 0 } : { x: 0 }

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t.cart.title}>
          {/* Decorative backdrop — keyboard users close with Esc (focus trap) or the button. */}
          <m.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="absolute inset-0 bg-ink/25"
          />
          <m.aside
            ref={trapRef}
            tabIndex={-1}
            initial={reduced ? { opacity: 0 } : offscreen}
            animate={reduced ? { opacity: 1 } : onscreen}
            exit={reduced ? { opacity: 0 } : offscreen}
            transition={reduced ? { duration: 0.2 } : spring.settle}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col rounded-l-3xl bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-sm:inset-x-0 max-sm:top-auto max-sm:h-[85vh] max-sm:w-full max-sm:max-w-none max-sm:rounded-l-none max-sm:rounded-t-3xl"
          >
            <div className="flex items-center justify-between px-6 py-5">
              <h2 className="text-lg font-semibold text-ink">{t.cart.title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label={t.nav.close}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-alt"
              >
                <X className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt">
                  <ShoppingBag className="size-6 text-ink-faint" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <p className="text-base font-medium text-ink">{t.cart.empty}</p>
                <p className="max-w-xs text-sm text-ink-soft">{t.cart.emptyBody}</p>
                <PillButton variant="secondary" onClick={close} className="mt-2">
                  {t.cart.continue}
                </PillButton>
              </div>
            ) : (
              <>
                <ul className="flex-1 divide-y divide-hairline overflow-y-auto px-6">
                  {items.map(({ product }) => (
                    <li key={product.id} className="flex gap-4 py-4">
                      <Link
                        href={`/shop/${product.slug}`}
                        onClick={close}
                        className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-alt"
                      >
                        <img
                          src={product.images[0] || '/placeholder.svg'}
                          alt={product.name}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-contain p-1"
                        />
                      </Link>
                      <div className="flex flex-1 flex-col">
                        <div className="flex justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-ink">{product.name}</p>
                            <p className="text-xs text-ink-soft">{product.artist}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(product.id)}
                            className="text-xs text-ink-faint transition-colors hover:text-ink"
                          >
                            {t.cart.remove}
                          </button>
                        </div>
                        {/* No qty stepper — one of each work per order, and
                            Ordering rejects qty > 1 anyway (catalog.md rule 1). */}
                        <div className="mt-auto flex items-center justify-end">
                          <span className="text-sm font-semibold text-ink tabular-nums">
                            {formatPrice(product.price)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-hairline px-6 py-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-soft">{t.cart.subtotal}</span>
                    <span className="text-xl font-semibold text-ink tabular-nums">
                      {formatPrice(subtotal)}
                    </span>
                  </div>
                  <PillLink href="/checkout" onClick={close} className="mt-4 w-full">
                    {t.cart.checkout}
                  </PillLink>
                </div>
              </>
            )}
          </m.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
