import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { checkoutPayloadSchema, type CheckoutPayload } from '@/lib/mono/types'

/**
 * The order rides in our own webhook URL, which lands in request logs — so it
 * is encrypted (AES-256-GCM), not just signed. Envelope: `keyId.iv.ciphertext.tag`,
 * base64url parts, key id authenticated as AAD so old keys keep decrypting after rotation.
 */

export type Keyring = { active: string; keys: Record<string, Buffer> }

const KEY_ID = /^[a-z0-9]{1,8}$/

export function parseKeyring(json: string | undefined): Keyring | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as { active?: unknown; keys?: Record<string, unknown> }
    if (typeof raw.active !== 'string' || !raw.keys || typeof raw.keys !== 'object') return null
    const keys: Record<string, Buffer> = {}
    for (const [id, value] of Object.entries(raw.keys)) {
      if (!KEY_ID.test(id) || typeof value !== 'string') return null
      const key = Buffer.from(value, 'base64')
      if (key.length !== 32) return null
      keys[id] = key
    }
    return keys[raw.active] ? { active: raw.active, keys } : null
  } catch {
    return null
  }
}

export function encryptPayload(payload: CheckoutPayload, ring: Keyring): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ring.keys[ring.active], iv)
  cipher.setAAD(Buffer.from(ring.active))
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return [ring.active, iv, body, cipher.getAuthTag()]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.')
}

/** `null` means unknown key, tampered, truncated or not a valid payload — never proceed. */
export function decryptPayload(envelope: string, ring: Keyring): CheckoutPayload | null {
  const [keyId, iv, body, tag, ...rest] = envelope.split('.')
  const key = keyId ? ring.keys[keyId] : undefined
  if (!key || !iv || !body || !tag || rest.length > 0) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), { authTagLength: 16 })
    decipher.setAAD(Buffer.from(keyId))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    const json = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
    const parsed = checkoutPayloadSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** 15 digits, first non-zero: mono `reference` and HugeProfit `order_id`. randomInt ranges must stay < 2^48. */
export function newReference(): string {
  const block = () => String(randomInt(0, 10_000_000)).padStart(7, '0')
  return `${randomInt(1, 10)}${block()}${block()}`
}

/* Result-link token `keyId.issuedAt.mac`: only links our checkout issued make /checkout/result call the CRM
   and mono; the signed issue time bounds that lookup. HKDF subkey: the AES key is never an HMAC key itself. */
function resultMac(reference: string, issuedAt: string, key: Buffer): string {
  const subkey = Buffer.from(hkdfSync('sha256', key, '', 'result-link', 32))
  return createHmac('sha256', subkey).update(`${reference}.${issuedAt}`).digest().subarray(0, 16).toString('base64url')
}

export function resultToken(reference: string, ring: Keyring, issuedAt: number): string {
  return `${ring.active}.${issuedAt}.${resultMac(reference, String(issuedAt), ring.keys[ring.active])}`
}

/** Unix seconds the link was issued, or `null` for anything we didn't sign (a repeated ?t= arrives as an array). */
export function resultTokenIssuedAt(reference: string, token: unknown, ring: Keyring): number | null {
  if (typeof token !== 'string') return null
  const [keyId, issuedAt, mac, ...rest] = token.split('.')
  if (!keyId || !issuedAt || !mac || rest.length > 0 || !/^\d{1,12}$/.test(issuedAt) || !Object.hasOwn(ring.keys, keyId)) return null
  const given = Buffer.from(mac)
  const expected = Buffer.from(resultMac(reference, issuedAt, ring.keys[keyId]))
  return given.length === expected.length && timingSafeEqual(given, expected) ? Number(issuedAt) : null
}
