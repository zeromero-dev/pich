'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Search, X } from 'lucide-react'
import { spring } from '@/lib/motion'
import { categories, products } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { ProductCard } from '@/components/product-card'
import { PillButton } from '@/components/pill-button'
import { cn } from '@/lib/utils'

export function ShopView() {
  const { t } = useLocale()
  const reduced = useReducedMotion()
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')

  // Debounce the search input ~150ms.
  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery), 150)
    return () => clearTimeout(id)
  }, [rawQuery])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      const matchesCategory = category === 'all' || p.category === category
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.artist.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [query, category])

  const hasFilters = query.trim() !== '' || category !== 'all'

  const clearFilters = () => {
    setRawQuery('')
    setQuery('')
    setCategory('all')
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-8 md:px-6 md:pt-14">
      <header className="mb-8">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink md:text-5xl">
          {t.shop.title}
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-ink-soft text-pretty">
          {t.shop.lead}
        </p>
      </header>

      {/* Toolbar */}
      <div className="mb-8 flex flex-col gap-4">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder={t.shop.searchPlaceholder}
            aria-label={t.shop.searchPlaceholder}
            className="h-11 w-full rounded-full border border-ink/15 bg-surface pr-4 pl-11 text-sm text-ink transition-[width,box-shadow] outline-none placeholder:text-ink-faint focus:border-ink focus-visible:outline-none"
          />
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ slug: 'all', label: t.shop.all }, ...categories].map((cat) => {
            const active = category === cat.slug
            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => setCategory(cat.slug)}
                aria-pressed={active}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-ink bg-ink text-surface'
                    : 'border-ink/15 text-ink-soft hover:border-ink/30 hover:text-ink',
                )}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <motion.div layout className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((product) => (
              <motion.div
                key={product.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                transition={spring.settle}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-surface-alt py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface">
            <X className="size-6 text-ink-faint" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="text-base font-medium text-ink">{t.shop.emptyTitle}</p>
          <p className="max-w-xs text-sm text-ink-soft">{t.shop.emptyBody}</p>
          {hasFilters && (
            <PillButton variant="secondary" size="sm" onClick={clearFilters} className="mt-2">
              {t.shop.clear}
            </PillButton>
          )}
        </div>
      )}
    </main>
  )
}
