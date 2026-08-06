'use client'

import Link from 'next/link'
import { Send } from 'lucide-react'
import { useLocale } from '@/components/providers'
import { Logo } from '@/components/logo'

/* lucide-react 1.x removed brand icons; this replicates the old Instagram glyph. */
function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

export function Footer() {
  const { t } = useLocale()
  const year = new Date().getFullYear()

  const nav = [
    { href: '/shop', label: t.nav.shop },
    { href: '/events', label: t.nav.events },
    { href: '/about', label: t.nav.about },
    { href: '/artists', label: t.nav.artists },
  ]

  const socials = [
    { href: 'https://instagram.com', label: 'Instagram', Icon: InstagramIcon },
    { href: 'https://t.me', label: 'Telegram', Icon: Send },
  ]

  return (
    <footer className="mt-24 bg-surface-alt">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft text-pretty">
              {t.footer.tagline}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">{t.footer.visit}</h3>
            <address className="mt-3 text-sm leading-relaxed text-ink-soft not-italic">
              вул. Мистецька, 12
              <br />
              Львів, Україна
              <br />
              hello@plaipich.art
            </address>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">{t.footer.hours}</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {t.footer.hoursValue}
            </p>
            <h3 className="mt-6 text-sm font-semibold text-ink">{t.footer.follow}</h3>
            <div className="mt-3 flex gap-2">
              {socials.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:bg-surface hover:text-ink"
                >
                  <Icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">{t.footer.nav}</h3>
            <ul className="mt-3 space-y-2">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-ink-soft transition-colors hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-hairline pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Плай Піч. {t.footer.rights}</p>
          <p>Made in Ukraine</p>
        </div>
      </div>
    </footer>
  )
}
