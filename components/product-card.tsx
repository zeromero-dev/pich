'use client'

import { useState } from 'react'
import Link from 'next/link'
import { m, useReducedMotion } from 'motion/react'
import { Check, Plus } from 'lucide-react'
import { spring } from '@/lib/motion'
import { formatPrice } from '@/lib/format'
import { useCart, useLocale } from '@/components/providers'
import type { Product } from '@/lib/data'

/* Touch devices have no hover: there the button is an always-visible round "+".
   `pointer-fine:` turns it into the full-width bar revealed on hover/focus. */
function AddToCart({ product }: { product: Product }) {
  const { t } = useLocale()
  const { add, items } = useCart()
  const [added, setAdded] = useState(false)
  const inCart = items.find((i) => i.product.id === product.id)?.qty ?? 0
  const full = inCart >= product.available

  const handleAdd = () => {
    add(product, 1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  const done = added || full
  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={full}
      aria-label={`${full ? t.shop.inCart : t.shop.addToCart}: ${product.name}`}
      className="absolute right-2 bottom-2 z-10 inline-flex size-10 items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-surface shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition-[opacity,background-color] hover:bg-[#2a2a2a] disabled:cursor-default pointer-fine:inset-x-3 pointer-fine:bottom-3 pointer-fine:h-11 pointer-fine:w-auto pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
    >
      {done ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Plus className="size-4" aria-hidden="true" />
      )}
      <span className="hidden pointer-fine:inline">
        {full ? t.shop.inCart : t.shop.addToCart}
      </span>
    </button>
  )
}

export function ProductCard({ product }: { product: Product }) {
  const { t } = useLocale()
  const reduced = useReducedMotion()
  const href = `/shop/${product.slug}`

  return (
    <m.article
      whileHover={reduced ? undefined : { y: -4 }}
      transition={spring.settle}
      className="group relative"
    >
      <m.div
        whileHover={reduced ? undefined : { boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
        transition={spring.settle}
        className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-alt"
      >
        {/* Duplicate of the title link for pointer users; hidden from AT and Tab. */}
        <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
          <m.div
            className="absolute inset-0"
            whileHover={reduced ? undefined : { scale: 1.03 }}
            transition={spring.settle}
          >
            <img
              src={product.images[0] || '/placeholder.svg'}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain p-3"
            />
          </m.div>
        </Link>
        {product.inStock ? (
          <AddToCart product={product} />
        ) : (
          <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-surface">
            {t.shop.soldOut}
          </span>
        )}
      </m.div>
      <Link href={href} className="mt-3 block">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-ink text-pretty">
          {product.name}
        </h3>
        <p className="mt-0.5 text-sm text-ink-soft">{product.artist}</p>
        <p className="mt-1 text-sm font-semibold text-ink tabular-nums">
          {formatPrice(product.price)}
        </p>
      </Link>
    </m.article>
  )
}
