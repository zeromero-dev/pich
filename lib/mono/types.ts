import { z } from 'zod'
import { DELIVERY_METHODS } from '@/lib/checkout/schema'
import { totalKop } from '@/lib/mono/money'

export const orderContactSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string(),
  address: z.string(),
  delivery: z.enum(DELIVERY_METHODS),
})
export type OrderContact = z.infer<typeof orderContactSchema>

const lockedLineSchema = z.object({
  productId: z.string().regex(/^\d+$/),
  unitPriceKop: z.int().positive(),
  qty: z.int().min(1).max(99),
})
export type LockedLine = z.infer<typeof lockedLineSchema>

/** What travels encrypted in the webhook URL (lib/mono/payload.ts). Validated again after decryption. */
export const checkoutPayloadSchema = z
  .object({
    v: z.literal(1),
    reference: z.string().regex(/^\d{15}$/),
    lines: z.array(lockedLineSchema).min(1).max(20),
    totalKop: z.int().positive(),
    contact: orderContactSchema,
  })
  .refine((p) => p.totalKop === totalKop(p.lines))
export type CheckoutPayload = z.infer<typeof checkoutPayloadSchema>

/** Webhook body and `invoice/status` response share this shape. */
export const invoiceStatusSchema = z.looseObject({
  invoiceId: z.string(),
  status: z.string(),
  amount: z.number(),
  ccy: z.number(),
  finalAmount: z.number().optional(),
  reference: z.string().optional(),
  modifiedDate: z.string().optional(),
  cancelList: z.array(z.unknown()).optional(),
})
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>
