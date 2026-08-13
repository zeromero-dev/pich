'use client'

import { LogoMark } from '@/components/logo'

/**
 * Replaces the root layout when that layout itself throws, so globals.css and
 * next/font never load here — every style has to be inline, tokens included.
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="uk">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          textAlign: 'center',
          background: '#ffffff',
          color: '#111111',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <title>Щось пішло не так — Плай Піч</title>
        <LogoMark style={{ height: 64, width: 'auto', color: '#111111' }} />
        <h1
          style={{
            margin: '32px 0 0',
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Щось пішло не так
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 16, lineHeight: 1.6, color: '#555555' }}>
          Спробуйте оновити сторінку.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: 32,
            padding: '12px 24px',
            fontSize: 15,
            fontWeight: 500,
            fontFamily: 'inherit',
            color: '#ffffff',
            background: '#111111',
            border: 'none',
            borderRadius: 9999,
            cursor: 'pointer',
          }}
        >
          Спробувати ще раз
        </button>
      </body>
    </html>
  )
}
