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

/**
 * One work per line, always qty 1 — availability is boolean (catalog.md rule 1)
 * and Ordering rejects anything else. `qty` stays on the shape because the
 * order payload sends it and it keeps totals honest if the rule ever relaxes.
 */
export type CartItem = {
  product: Product
  qty: 1
}

type CartContextValue = {
  items: CartItem[]
  count: number
  subtotal: number
  isOpen: boolean
  bump: number // increments to trigger the badge pop
  open: () => void
  close: () => void
  add: (product: Product) => void
  remove: (id: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within Providers')
  return ctx
}

/* v2: mock works (p1…p8) and multi-qty lines from v1 must not restore. */
const CART_KEY = 'plai-pich-cart-v2'
const LOCALE_KEY = 'plai-pich-locale'

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

  const add = useCallback((product: Product) => {
    // Re-adding refreshes the snapshot rather than incrementing — one per work.
    setItems((prev) => {
      const others = prev.filter((i) => i.product.id !== product.id)
      return prev.length === others.length
        ? [...prev, { product, qty: 1 }]
        : prev.map((i) => (i.product.id === product.id ? { product, qty: 1 } : i))
    })
    setBump((b) => b + 1)
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
      remove,
      clear,
    }
  }, [items, isOpen, bump, add, remove, clear])

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
