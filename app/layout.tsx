import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { BRAND, WEBSITE_URL } from '@/lib/site'
import { Providers } from '@/components/providers'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CartDrawer } from '@/components/cart-drawer'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(WEBSITE_URL),
  title: {
    default: 'Плай Піч — арт-центр',
    template: '%s — Плай Піч',
  },
  description:
    'Плай Піч — арт-центр і крамничка сучасного українського мистецтва. Купуйте роботи митців, відвідуйте події.',
  // No `images` here — app/opengraph-image.tsx supplies the branded card.
  openGraph: {
    siteName: BRAND.name,
    locale: 'uk_UA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  // Icons come from the app/ file convention (icon.svg, favicon.ico, apple-icon.png).
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="uk" className={`${inter.variable} bg-surface`}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <Providers>
          <Header />
          {/* Pins the footer to the viewport bottom on short pages (404, empty cart). */}
          <div className="flex flex-1 flex-col [&>main]:flex-1">{children}</div>
          <Footer />
          <CartDrawer />
        </Providers>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
