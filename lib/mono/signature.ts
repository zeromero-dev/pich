import { verify } from 'node:crypto'

/** mono's `X-Sign`: base64 ECDSA-SHA256 over the raw body, checked against the PEM from /api/merchant/pubkey. */
export function verifySignature(rawBody: Buffer, xSign: string, pem: string): boolean {
  try {
    return verify('sha256', rawBody, pem, Buffer.from(xSign, 'base64'))
  } catch {
    return false
  }
}
