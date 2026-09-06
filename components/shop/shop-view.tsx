'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { Search, X } from 'lucide-react'
import { spring } from '@/lib/motion'
import type { CategoryFilter, Product } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { ProductCard } from '@/components/product-card'
import { PillButton } from '@/components/pill-button'
import { cn } from '@/lib/utils'

export type SortKey = 'default' | 'priceAsc' | 'priceDesc'

const SORT_KEYS: SortKey[] = ['default', 'priceAsc', 'priceDesc']

/**
 * Works rendered before "показати ще". Images come straight from the CRM at
 * full size (~133 KB each), so this caps what a scroll can pull: the whole
 * 252-work grid is ~33 MB. Keep it a multiple of 4 — the widest grid.
 */
const PAGE_SIZE = 24

export function ShopView({
  products,
  categories,
}: {
  products: Product[]
  categories: CategoryFilter[]
}) {
  const { t } = useLocale()
  const reduced = useReducedMotion()
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('default')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)

  // Debounce the search input ~150ms.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(rawQuery)
      setVisible(PAGE_SIZE)
    }, 150)
    return () => clearTimeout(id)
  }, [rawQuery])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = products.filter((p) => {
      // Match anywhere in the category chain, so a parent finds its children.
      const matchesCategory =
        category === 'all' || p.categories.some((c) => c.slug === category)
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.artist?.toLowerCase().includes(q) ?? false) ||
        p.categories.some((c) => c.label.toLowerCase().includes(q))
      const matchesStock = !availableOnly || p.inStock
      return matchesCategory && matchesQuery && matchesStock
    })

    if (sort === 'default') return matches
    const direction = sort === 'priceAsc' ? 1 : -1
    // Sold works stay last whatever the sort — they aren't offers.
    return [...matches].sort(
      (a, b) =>
        Number(b.inStock) - Number(a.inStock) || (a.price - b.price) * direction,
    )
  }, [products, query, category, sort, availableOnly])

  const hasFilters =
    query.trim() !== '' || category !== 'all' || availableOnly || sort !== 'default'

  const shown = filtered.slice(0, visible)

  const clearFilters = () => {
    setRawQuery('')
    setQuery('')
    setCategory('all')
    setSort('default')
    setAvailableOnly(false)
    setVisible(PAGE_SIZE)
  }

  /** Every filter change restarts paging — otherwise a narrow result set inherits a deep page. */
  const resetPaging = () => setVisible(PAGE_SIZE)

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
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

          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor="shop-sort" className="sr-only">
              {t.shop.sortLabel}
            </label>
            <select
              id="shop-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey)
                resetPaging()
              }}
              className="h-11 rounded-full border border-ink/15 bg-surface px-4 text-sm text-ink outline-none focus:border-ink"
            >
              {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t.shop.sort[key]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setAvailableOnly((v) => !v)
                resetPaging()
              }}
              aria-pressed={availableOnly}
              className={cn(
                'h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                availableOnly
                  ? 'border-ink bg-ink text-surface'
                  : 'border-ink/15 text-ink-soft hover:border-ink/30 hover:text-ink',
              )}
            >
              {t.shop.availableOnly}
            </button>
          </div>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ slug: 'all', label: t.shop.all, count: products.length }, ...categories].map(
            (cat) => {
              const active = category === cat.slug
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => {
                    setCategory(cat.slug)
                    resetPaging()
                  }}
                  aria-pressed={active}
                  className={cn(
                    'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-ink bg-ink text-surface'
                      : 'border-ink/15 text-ink-soft hover:border-ink/30 hover:text-ink',
                  )}
                >
                  {cat.label}
                  <span
                    className={cn(
                      'ml-1.5 tabular-nums',
                      active ? 'text-surface/60' : 'text-ink-faint',
                    )}
                  >
                    {cat.count}
                  </span>
                </button>
              )
            },
          )}
        </div>
      </div>

      {/* Grid. Its AnimatePresence stays mounted through the empty state so the
          last cards can play their exit instead of vanishing with the grid. */}
      {filtered.length > 0 && (
        <p className="mb-4 text-sm text-ink-faint tabular-nums" aria-live="polite">
          {t.shop.resultCount(filtered.length)}
        </p>
      )}
      <m.div
        layout
        className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4"
      >
        <AnimatePresence mode="popLayout">
          {shown.map((product) => (
            <m.div
              key={product.id}
              layout={!reduced}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={spring.settle}
            >
              <ProductCard product={product} />
            </m.div>
          ))}
        </AnimatePresence>
      </m.div>

      {filtered.length > shown.length && (
        <div className="mt-12 flex justify-center">
          <PillButton
            variant="secondary"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
          >
            {t.shop.showMore}
          </PillButton>
        </div>
      )}

      {filtered.length === 0 && (
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
