'use client'

import Link from 'next/link'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocale } from '@/components/providers'
import { PillButton } from '@/components/pill-button'
import { clearQueue } from '@/lib/meta/pixel'
import { MetaPixel } from '@/components/meta-pixel'
import {
  CONSENT_KEY,
  parseConsent,
  serializeConsent,
  type ConsentChoice,
} from '@/lib/consent'

type ConsentContextValue = {
  choice: ConsentChoice | null
  /** True while consent is in effect, including while the bar is reopened. */
  granted: boolean
  ready: boolean
  enabled: boolean
  accept: () => void
  decline: () => void
  reopen: () => void
}

const ConsentContext = createContext<ConsentContextValue | null>(null)

export function useConsent() {
  const ctx = useContext(ConsentContext)
  if (!ctx) throw new Error('useConsent must be used within ConsentProvider')
  return ctx
}

// The pixel sets these on the registrable domain; expire both scopes.
function expireMetaCookies() {
  const host = window.location.hostname
  const domains = ['']
  if (/[a-z]/i.test(host) && host.includes('.')) domains.push(`; domain=.${host.split('.').slice(-(host.endsWith('.co.ua') ? 3 : 2)).join('.')}`)
  for (const name of ['_fbp', '_fbc'])
    for (const d of domains) document.cookie = `${name}=; path=/; max-age=0${d}`
}

export function ConsentProvider({
  pixelId,
  children,
}: {
  pixelId: string | null
  children: ReactNode
}) {
  const [choice, setChoice] = useState<ConsentChoice | null>(null)
  const [ready, setReady] = useState(false)
  // Once granted in this page load the pixel is running; only a reload unloads it.
  const pixelRan = useRef(false)
  // Stays true after reopen() so MetaPixel never unmounts (no second init or PageView).
  const [pixelOn, setPixelOn] = useState(false)
  const granted = choice === 'granted' || (choice === null && pixelOn)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- storage is only readable after mount. */
    try {
      const saved = parseConsent(localStorage.getItem(CONSENT_KEY), Date.now())
      if (saved) setChoice(saved)
      if (saved === 'granted') setPixelOn(true)
    } catch {
      /* ignore */
    }
    setReady(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const decide = useCallback((next: ConsentChoice) => {
    try {
      localStorage.setItem(CONSENT_KEY, serializeConsent(next, Date.now()))
    } catch {
      /* ignore: the choice then lasts for this tab only */
    }
    if (next === 'denied' && pixelRan.current) {
      expireMetaCookies()
      window.location.reload()
      return
    }
    if (next === 'granted') {
      // Events from before the first consent must never reach Meta.
      if (!pixelRan.current) clearQueue()
      pixelRan.current = true
      setPixelOn(true)
    }
    setChoice(next)
  }, [])

  const accept = useCallback(() => decide('granted'), [decide])
  const decline = useCallback(() => decide('denied'), [decide])
  const reopen = useCallback(() => {
    if (choice === 'granted') pixelRan.current = true
    setChoice(null)
  }, [choice])

  const value = useMemo<ConsentContextValue>(
    () => ({ choice, granted, ready, enabled: !!pixelId, accept, decline, reopen }),
    [choice, granted, ready, pixelId, accept, decline, reopen],
  )

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {pixelId && pixelOn && <MetaPixel pixelId={pixelId} />}
      {ready && choice === null && pixelId && <ConsentBar />}
    </ConsentContext.Provider>
  )
}

// z-[55]: above the sticky header (50), below the cart drawer (60).
function ConsentBar() {
  const { t } = useLocale()
  const { accept, decline } = useConsent()
  return (
    <div
      role="region"
      aria-label={t.consent.label}
      className="fixed inset-x-0 bottom-0 z-[55] border-t border-hairline bg-surface"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6">
        <p className="text-sm leading-relaxed text-ink-soft text-pretty">
          {t.consent.text}{' '}
          <Link href="/privacy" className="text-ink underline underline-offset-2">
            {t.consent.more}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <PillButton variant="secondary" size="sm" className="flex-1 md:flex-none" onClick={decline}>
            {t.consent.decline}
          </PillButton>
          <PillButton size="sm" className="flex-1 md:flex-none" onClick={accept}>
            {t.consent.accept}
          </PillButton>
        </div>
      </div>
    </div>
  )
}
