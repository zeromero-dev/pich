'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { ArrowLeft, Check, Plus } from 'lucide-react'
import { spring } from '@/lib/motion'
import { formatPrice } from '@/lib/format'
import { useCart, useLocale } from '@/components/providers'
import { PillButton } from '@/components/pill-button'
import { ProductCard } from '@/components/product-card'
import { StaggerGroup, StaggerItem } from '@/components/reveal'
import { cn } from '@/lib/utils'
import { artists, productsByArtist, type Product } from '@/lib/data'

export function ProductDetail({ product }: { product: Product }) {
  const { t } = useLocale()
  const { add, open } = useCart()
  const [active, setActive] = useState(0)
  const [added, setAdded] = useState(false)

  // Name join to the artists content — fragile by design, see artists.md.
  const artistEntry = artists.find((a) => a.name === product.artist)
  const related = productsByArtist(product.artist)
    .filter((p) => p.id !== product.id)
    .slice(0, 4)

  const handleAdd = () => {
    add(product)
    open()
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 md:px-6 md:pt-10 md:pb-24">
      <Link
        href="/shop"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft
          className="size-4 transition-transform group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
        {t.shop.backToShop}
      </Link>

      <div className="mt-6 grid gap-8 md:grid-cols-2 md:gap-12">
        {/* Gallery */}
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-alt">
            <img
              src={product.images[active] || '/placeholder.svg'}
              alt={product.name}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-contain p-4"
            />
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-3">
              {product.images.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`${product.name} — ${i + 1}`}
                  aria-current={i === active}
                  className={cn(
                    'relative aspect-square w-20 overflow-hidden rounded-xl bg-surface-alt ring-2 transition-[--tw-ring-color]',
                    i === active ? 'ring-ink' : 'ring-transparent hover:ring-ink/20',
                  )}
                >
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-contain p-1.5"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="md:pt-2">
          {artistEntry ? (
            <Link
              href={`/artists#${artistEntry.slug}`}
              className="text-sm text-ink-soft transition-colors hover:text-ink"
            >
              {product.artist}
            </Link>
          ) : (
            <p className="text-sm text-ink-soft">{product.artist}</p>
          )}
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-ink text-balance md:text-4xl">
            {product.name}
          </h1>
          <p className="mt-4 text-xl font-semibold text-ink tabular-nums">
            {formatPrice(product.price)}
          </p>

          <div className="mt-6">
            <PillButton
              size="hero"
              disabled={!product.inStock}
              onClick={handleAdd}
              className="w-full sm:w-auto"
            >
              <motion.span
                key={added ? 'added' : 'add'}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.snap}
                className="inline-flex items-center gap-2"
              >
                {added ? (
                  <>
                    <Check className="size-4" aria-hidden="true" />
                    {t.cart.title}
                  </>
                ) : (
                  <>
                    <Plus className="size-4" aria-hidden="true" />
                    {t.shop.addToCart}
                  </>
                )}
              </motion.span>
            </PillButton>
          </div>

          <p className="mt-3 text-sm text-ink-soft">
            <span
              className={cn(
                'mr-1.5 inline-block h-2 w-2 rounded-full align-middle',
                product.inStock ? 'bg-success' : 'bg-ink-faint',
              )}
              aria-hidden="true"
            />
            {product.inStock ? t.shop.inStock : t.shop.soldOut}
          </p>

          <div className="mt-8 border-t border-hairline pt-6">
            <h2 className="text-sm font-semibold text-ink">{t.shop.description}</h2>
            <p className="mt-2 max-w-prose text-base leading-relaxed text-ink-soft text-pretty">
              {product.description}
            </p>
          </div>

          <div className="mt-6 border-t border-hairline pt-6">
            <h2 className="text-sm font-semibold text-ink">{t.shop.details}</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-faint">{t.shop.medium}</dt>
              <dd className="text-ink">{product.medium}</dd>
              <dt className="text-ink-faint">{t.shop.size}</dt>
              <dd className="text-ink tabular-nums">{product.size}</dd>
              <dt className="text-ink-faint">{t.shop.year}</dt>
              <dd className="text-ink tabular-nums">{product.year}</dd>
            </dl>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16 border-t border-hairline pt-10 md:mt-24">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink md:text-3xl">
            {t.shop.moreByArtist}
          </h2>
          <StaggerGroup className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {related.map((p) => (
              <StaggerItem key={p.id}>
                <ProductCard product={p} />
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>
      )}
    </main>
  )
}
