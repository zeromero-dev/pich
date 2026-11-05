import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { CheckoutPayload } from './types'

function key(): string {
  const value = process.env.LIQPAY_PRIVATE_KEY
  if (!value) throw new Error('LIQPAY_PRIVATE_KEY is not set — add it to .env.local')
  return value
}

function tag(body: string): string {
  return createHmac('sha256', key()).update(body).digest('base64url')
}

/**
 * `<body>.<tag>`, carried in the payment's `info`. It alone decides what a paid
 * order contains, so it stays tamper-evident even though LiqPay signs `info` too —
 * a paid order may hold only what our server put in it.
 */
export function encodePayload(payload: CheckoutPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${tag(body)}`
}

/** `null` means forged, truncated or malformed — the caller must not proceed. */
export function decodePayload(encoded: string): CheckoutPayload | null {
  const [body, mac] = encoded.split('.')
  if (!body || !mac) return null

  const expected = Buffer.from(tag(body))
  const got = Buffer.from(mac)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'))
  } catch {
    return null
  }
}
