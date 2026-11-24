import { createHash } from 'node:crypto'
import type { LockedLine, MetaMatch, OrderContact } from '@/lib/mono/types'

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export function normalizeEmail(email: string): string | null {
  return email.trim().toLowerCase() || null
}

export function normalizePhone(phone: string): string | null {
  return phone.replace(/\D/g, '') || null
}

export function buildPurchaseEvent(input: {
  orderId: string
  lines: LockedLine[]
  totalKop: number
  contact: OrderContact
  meta: MetaMatch
  eventTime: number
  sourceUrl: string
}) {
  const { orderId, lines, totalKop, contact, meta } = input
  const email = normalizeEmail(contact.email)
  const phone = normalizePhone(contact.phone)
  return {
    event_name: 'Purchase',
    event_time: input.eventTime,
    event_id: orderId,
    action_source: 'website',
    event_source_url: input.sourceUrl,
    user_data: {
      ...(email && { em: [sha256(email)] }),
      ...(phone && { ph: [sha256(phone)] }),
      ...(meta.fbp && { fbp: meta.fbp }),
      ...(meta.fbc && { fbc: meta.fbc }),
      ...(meta.userAgent && { client_user_agent: meta.userAgent }),
      ...(meta.ip && { client_ip_address: meta.ip }),
    },
    custom_data: {
      value: totalKop / 100,
      currency: 'UAH',
      content_type: 'product',
      content_ids: lines.map((l) => l.productId),
      contents: lines.map((l) => ({ id: l.productId, quantity: l.qty, item_price: l.unitPriceKop / 100 })),
      num_items: lines.reduce((sum, l) => sum + l.qty, 0),
    },
  }
}
