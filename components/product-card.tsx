'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { spring } from '@/lib/motion'
import { formatPrice } from '@/lib/format'
import { useLocale } from '@/components/providers'
import type { Product } from '@/lib/data'

export function ProductCard({ product }: { product: Product }) {
  const { t } = useLocale()
  const reduced = useReducedMotion()

  return (
    <motion.article
      whileHover={reduced ? undefined : { y: -4 }}
      transition={spring.settle}
      className="group relative"
    >
      <Link href={`/shop/${product.slug}`} className="block">
        <motion.div
          whileHover={reduced ? undefined : { boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
          transition={spring.settle}
          className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-alt"
        >
          <motion.div
            className="absolute inset-0"
            whileHover={reduced ? undefined : { scale: 1.03 }}
            transition={spring.settle}
          >
            <Image
              src={product.images[0] || '/placeholder.svg'}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-contain p-3"
            />
          </motion.div>
          {!product.inStock && (
            <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-surface">
              {t.shop.soldOut}
            </span>
          )}
        </motion.div>
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
    </motion.article>
  )
}
