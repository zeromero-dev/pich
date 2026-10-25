'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { LazyMotion, domMax } from 'motion/react'
import { dictionaries, type Dictionary, type Locale } from '@/lib/i18n'
import type { Product } from '@/lib/data'

/* -------------------------------------------------------------------------- */
/* Locale                                                                     */
/* -------------------------------------------------------------------------- */

type LocaleContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: Dictionary
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within Providers')
  return ctx
}

/* -------------------------------------------------------------------------- */
/* Cart                                                                       */
/* -------------------------------------------------------------------------- */

/** One line per work; `qty` is clamped to the snapshot's `available` (catalog.md rule 1). */
export type CartItem = {
  product: Product
  qty: number
}

type CartContextValue = {
  items: CartItem[]
  count: number
  subtotal: number
  isOpen: boolean
  bump: number // increments to trigger the badge pop
  open: () => void
  close: () => void
  add: (product: Product, qty?: number) => void
  setQty: (id: string, qty: number) => void
  remove: (id: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within Providers')
  return ctx
}

/* v3: snapshots gained `available`; v2 lines lack it and would clamp to NaN. */
const CART_KEY = 'plai-pich-cart-v3'
const LOCALE_KEY = 'plai-pich-locale'

function clampQty(qty: number, product: Product): number {
  return Math.max(1, Math.min(Math.floor(qty), product.available))
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('uk')
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- SSR renders defaults;
       persisted locale/cart are only readable from localStorage after mount. */
    try {
      const savedLocale = localStorage.getItem(LOCALE_KEY) as Locale | null
      if (savedLocale === 'uk' || savedLocale === 'en') setLocaleState(savedLocale)
      const savedCart = localStorage.getItem(CART_KEY)
      if (savedCart) setItems(JSON.parse(savedCart))
    } catch {
      /* ignore */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items))
    } catch {
      /* ignore */
    }
  }, [items])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    document.documentElement.lang = l
    try {
      localStorage.setItem(LOCALE_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const add = useCallback((product: Product, qty = 1) => {
    // Re-adding refreshes the snapshot and adds to the line, never past stock.
    setItems((prev) =>
      prev.some((i) => i.product.id === product.id)
        ? prev.map((i) =>
            i.product.id === product.id
              ? { product, qty: clampQty(i.qty + qty, product) }
              : i,
          )
        : [...prev, { product, qty: clampQty(qty, product) }],
    )
    setBump((b) => b + 1)
  }, [])

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => (i.product.id === id ? { ...i, qty: clampQty(qty, i.product) } : i)),
    )
  }, [])

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== id))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const localeValue = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: dictionaries[locale] }),
    [locale, setLocale],
  )

  const cartValue = useMemo<CartContextValue>(() => {
    const count = items.reduce((n, i) => n + i.qty, 0)
    const subtotal = items.reduce((n, i) => n + i.qty * i.product.price, 0)
    return {
      items,
      count,
      subtotal,
      isOpen,
      bump,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      add,
      setQty,
      remove,
      clear,
    }
  }, [items, isOpen, bump, add, setQty, remove, clear])

  return (
    <LocaleContext.Provider value={localeValue}>
      <CartContext.Provider value={cartValue}>
        {/* domMax, not domAnimation: the shop grid and the locale pill animate
            layout. `strict` throws on any `motion.` component left behind. */}
        <LazyMotion features={domMax} strict>
          {children}
        </LazyMotion>
      </CartContext.Provider>
    </LocaleContext.Provider>
  )
}
