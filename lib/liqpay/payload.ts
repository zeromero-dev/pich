import 'server-only'
import type { CheckoutPayload } from './types'

export function encodePayload(payload: CheckoutPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function decodePayload(encoded: string): CheckoutPayload {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'))
}
