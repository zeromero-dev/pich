'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Menu, ShoppingBag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { spring } from '@/lib/motion'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { useCart, useLocale } from '@/components/providers'
import { Logo } from '@/components/logo'
import type { Locale } from '@/lib/i18n'

function LocaleSwitch() {
  const { locale, setLocale } = useLocale()
  const options: { value: Locale; label: string }[] = [
    { value: 'uk', label: 'УКР' },
    { value: 'en', label: 'EN' },
  ]
  return (
    <div
      role="group"
      aria-label="Мова / Language"
      className="relative inline-flex items-center rounded-full border border-ink/15 p-0.5"
    >
      {options.map((opt) => {
        const active = locale === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLocale(opt.value)}
            aria-pressed={active}
            className={cn(
              'relative z-10 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              active ? 'text-surface' : 'text-ink-soft hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId="locale-pill"
                transition={spring.settle}
                className="absolute inset-0 -z-10 rounded-full bg-ink"
              />
            )}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function CartButton() {
  const { count, open, bump } = useCart()
  const { t } = useLocale()
  const reduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={open}
      whileTap={{ scale: 0.97 }}
      transition={spring.snap}
      aria-label={`${t.nav.cart}${count ? `, ${count}` : ''}`}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-alt"
    >
      <ShoppingBag className="size-5" strokeWidth={1.75} aria-hidden="true" />
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            key={bump}
            initial={reduced ? false : { scale: 0.6 }}
            animate={reduced ? {} : { scale: [1, 1.3, 1] }}
            transition={spring.snap}
            className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-surface tabular-nums"
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export function Header() {
  const { t } = useLocale()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const menuRef = useFocusTrap<HTMLDivElement>(menuOpen, () => setMenuOpen(false))

  const nav = [
    { href: '/shop', label: t.nav.shop },
    { href: '/events', label: t.nav.events },
    { href: '/about', label: t.nav.about },
    { href: '/artists', label: t.nav.artists },
  ]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  return (
    <>
    <header
      className={cn(
        'sticky top-0 z-50 bg-surface/80 backdrop-blur-md transition-[border-color,box-shadow] duration-300',
        scrolled ? 'border-b border-hairline' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Головна навігація">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                  active ? 'text-ink' : 'text-ink-soft hover:text-ink hover:bg-surface-alt',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <LocaleSwitch />
          </div>
          <CartButton />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t.nav.menu}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-alt md:hidden"
          >
            <Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>

    {/* Outside <header>: its backdrop-filter would become the containing block
        for this fixed overlay, shrinking inset-0 to the 64px header bar. */}
    <AnimatePresence>
        {menuOpen && (
          <motion.div
            ref={menuRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={t.nav.menu}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col bg-surface md:hidden"
          >
            <div className="flex h-16 items-center justify-between px-4">
              <div onClick={() => setMenuOpen(false)}>
                <Logo />
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t.nav.close}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-alt"
              >
                <X className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <motion.nav
              className="flex flex-1 flex-col gap-2 px-6 pt-6"
              aria-label="Мобільна навігація"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}
            >
              {nav.map((item) => (
                <motion.div
                  key={item.href}
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    visible: { opacity: 1, y: 0, transition: spring.settle },
                  }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="block py-2 text-3xl font-semibold tracking-[-0.02em] text-ink"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
            </motion.nav>
            <div className="flex items-center justify-between border-t border-hairline px-6 py-5">
              <LocaleSwitch />
            </div>
          </motion.div>
        )}
    </AnimatePresence>
    </>
  )
}
