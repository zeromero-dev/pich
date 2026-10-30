import { z } from 'zod'

/**
 * The one checkout contract, parsed by the form (field errors) and by
 * /api/checkout (authority). Issue messages are keys into `t.checkout`, so
 * this file stays locale-free.
 */

export type CheckoutErrorKey =
  | 'required'
  | 'invalidEmail'
  | 'invalidPhone'
  | 'invalidName'
  | 'pickCity'
  | 'pickBranch'
  | 'pickLocker'
  | 'pickStreet'
  | 'tooLong'

const err = (key: CheckoutErrorKey) => ({ error: key })

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Two or more words: Nova Poshta needs the recipient's first and last name.
const FULL_NAME = /^[\p{L}ʼ'’-]+(?:\s+[\p{L}ʼ'’-]+)+$/u

/** Accepts 0XX…, 380XX…, +38 (0XX) XXX-XX-XX; `null` if not a Ukrainian number. */
export function normalizeUaPhone(input: string): string | null {
  const digits = input.replace(/[\s()+-]/g, '')
  const match = /^(?:38)?0(\d{9})$/.exec(digits)
  return match ? `+380${match[1]}` : null
}

const required = (max: number) =>
  z
    .string(err('required'))
    .trim()
    .min(1, { ...err('required'), abort: true })
    .max(max, err('tooLong'))

export const contactSchema = z.object({
  name: required(100).regex(FULL_NAME, err('invalidName')),
  email: required(254).regex(EMAIL, err('invalidEmail')),
  phone: required(30)
    .refine((v) => normalizeUaPhone(v) !== null, err('invalidPhone'))
    .transform((v) => normalizeUaPhone(v)!),
})

const ref = (key: CheckoutErrorKey) => z.guid(err(key))

export const deliverySchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('pickup') }),
  z.object({
    method: z.literal('branch'),
    settlementRef: ref('pickCity'),
    warehouseRef: ref('pickBranch'),
  }),
  z.object({
    method: z.literal('locker'),
    settlementRef: ref('pickCity'),
    warehouseRef: ref('pickLocker'),
  }),
  z.object({
    method: z.literal('courier'),
    settlementRef: ref('pickCity'),
    settlementName: required(100),
    streetRef: ref('pickStreet'),
    streetName: required(100),
    house: required(20),
    flat: z.string().trim().max(20, err('tooLong')).optional(),
  }),
])

export const DELIVERY_METHODS = ['pickup', 'branch', 'locker', 'courier'] as const
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]

export const MAX_ITEMS = 20
export const MAX_QTY = 99

export const checkoutRequestSchema = z.object({
  items: z
    .array(
      z.object({
        workId: z.string().min(1),
        qty: z.int().min(1).max(MAX_QTY),
        // For comparison only — the server prices from fresh CRM data.
        price: z.number().finite(),
      }),
    )
    .min(1)
    .max(MAX_ITEMS)
    // Duplicate lines would split one work's qty past the stock check.
    .refine((items) => new Set(items.map((i) => i.workId)).size === items.length),
  contact: contactSchema,
  delivery: deliverySchema,
})

export type CheckoutRequest = z.input<typeof checkoutRequestSchema>
export type ParsedCheckout = z.output<typeof checkoutRequestSchema>
export type ParsedDelivery = z.output<typeof deliverySchema>

/** Form field ids, one per leaf the buyer can edit. */
export type FieldId = 'name' | 'email' | 'phone' | 'settlementRef' | 'warehouseRef' | 'streetRef' | 'house' | 'flat'

/** First issue per field — what the form shows under each input. */
export function fieldErrors(issues: z.core.$ZodIssue[]): Partial<Record<FieldId, CheckoutErrorKey>> {
  const out: Partial<Record<FieldId, CheckoutErrorKey>> = {}
  for (const issue of issues) {
    const field = issue.path.at(-1) as FieldId | undefined
    if (field && !(field in out)) out[field] = issue.message as CheckoutErrorKey
  }
  return out
}
