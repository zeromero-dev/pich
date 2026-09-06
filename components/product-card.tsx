'use client'

import Link from 'next/link'
import { m, useReducedMotion } from 'motion/react'
import { spring } from '@/lib/motion'
import { formatPrice } from '@/lib/format'
import { useLocale } from '@/components/providers'
import type { Product } from '@/lib/data'

export function ProductCard({ product }: { product: Product }) {
  const { t } = useLocale()
  const reduced = useReducedMotion()

  return (
    <m.article
      whileHover={reduced ? undefined : { y: -4 }}
      transition={spring.settle}
      className="group relative"
    >
      <Link href={`/shop/${product.slug}`} className="block">
        <m.div
          whileHover={reduced ? undefined : { boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
          transition={spring.settle}
          className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-alt"
        >
          <m.div
            className="absolute inset-0"
            whileHover={reduced ? undefined : { scale: 1.03 }}
            transition={spring.settle}
          >
            <img
              src={product.images[0] || '/placeholder.svg'}
              alt={product.name}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain p-3"
            />
          </m.div>
          {!product.inStock ? (
            <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-surface">
              {t.shop.soldOut}
            </span>
          ) : (
            product.isLast && (
              <span className="absolute left-3 top-3 rounded-full bg-surface/85 px-2.5 py-1 text-[11px] font-medium text-ink backdrop-blur-sm">
                {t.shop.lastOne}
              </span>
            )
          )}
        </m.div>
        <div className="mt-3">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-ink text-pretty">
            {product.name}
          </h3>
          <p className="mt-0.5 text-sm text-ink-soft">{product.artist}</p>
          <p className="mt-1 text-sm font-semibold text-ink tabular-nums">
            {formatPrice(product.price)}
          </p>
        </div>
      </Link>
    </m.article>
  )
}
