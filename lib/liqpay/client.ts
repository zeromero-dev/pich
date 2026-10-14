import 'server-only'
import { createHash } from 'node:crypto'
import type { LiqPayCallbackData, LiqPayStatus } from './types'

/**
 * Signature algorithm and endpoints per LiqPay's published PHP SDK, verified
 * against a sandbox account 2026-09-08: a real payment settled and its webhook
 * arrived. `amount` is in major units (₴), and LiqPay returns the buyer to
 * `result_url` with a GET.
 */
const CHECKOUT_URL = 'https://www.liqpay.ua/api/3/checkout'
const REQUEST_URL = 'https://www.liqpay.ua/api/request'

function publicKey(): string {
  const value = process.env.LIQPAY_PUBLIC_KEY
  if (!value) throw new Error('LIQPAY_PUBLIC_KEY is not set — add it to .env.local')
  return value
}

function privateKey(): string {
  const value = process.env.LIQPAY_PRIVATE_KEY
  if (!value) throw new Error('LIQPAY_PRIVATE_KEY is not set — add it to .env.local')
  return value
}

function isSandbox(): boolean {
  return process.env.LIQPAY_SANDBOX === '1'
}

/**
 * Payments are off until both keys exist. The credentials are the flag —
 * a separate toggle could disagree with them, and this one cannot.
 */
export function paymentsEnabled(): boolean {
  return Boolean(process.env.LIQPAY_PUBLIC_KEY && process.env.LIQPAY_PRIVATE_KEY)
}

export function sign(data: string): string {
  const key = privateKey()
  return createHash('sha1').update(key + data + key).digest('base64')
}

function encodeParams(params: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(params)).toString('base64')
}

export function buildCheckoutRequest(params: {
  orderId: number
  amount: number
  description: string
  resultUrl: string
  serverUrl: string
}): { data: string; signature: string; checkoutUrl: string } {
  const body: Record<string, unknown> = {
    public_key: publicKey(),
    version: 3,
    action: 'pay',
    amount: params.amount,
    currency: 'UAH',
    order_id: String(params.orderId),
    description: params.description,
    result_url: params.resultUrl,
    server_url: params.serverUrl,
  }
  if (isSandbox()) body.sandbox = 1

  const data = encodeParams(body)
  return { data, signature: sign(data), checkoutUrl: CHECKOUT_URL }
}

export function verifyCallback(data: string, signature: string): boolean {
  return sign(data) === signature
}

export function decodeCallback(data: string): LiqPayCallbackData {
  return JSON.parse(Buffer.from(data, 'base64').toString('utf-8'))
}

function toLiqPayStatus(status: string | undefined): LiqPayStatus {
  if (status === 'success' || status === 'sandbox') return status
  if (status === 'failure' || status === 'error') return 'failure'
  if (!status) return 'unknown'
  return 'pending'
}

/** Read-only status lookup — used for buyer-facing display only, never to create an order. */
export async function checkStatus(orderId: number): Promise<LiqPayStatus> {
  const body = {
    public_key: publicKey(),
    version: 3,
    action: 'status',
    order_id: String(orderId),
  }
  const data = encodeParams(body)
  const signature = sign(data)

  const res = await fetch(REQUEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data, signature }),
    cache: 'no-store',
  })
  if (!res.ok) return 'unknown'

  const json = (await res.json()) as { status?: string }
  return toLiqPayStatus(json.status)
}
