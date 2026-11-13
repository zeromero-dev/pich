// Run: npm test. Pure asserts over the Purchase event builder; no network.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { buildPurchaseEvent, normalizeEmail, normalizePhone, sha256 } from '@/lib/meta/capi'

assert.equal(normalizePhone('+380501234567'), '380501234567')
assert.equal(normalizeEmail('  A@B.UA '), 'a@b.ua')
assert.equal(normalizeEmail(''), null)
assert.equal(sha256('a@b.ua'), createHash('sha256').update('a@b.ua').digest('hex'))

type Ev = { user_data: Record<string, unknown>; custom_data: Record<string, unknown>; [k: string]: unknown }
const input = {
  orderId: 1731400000000,
  lines: [
    { productId: '11', price: 1200, qty: 1 },
    { productId: '22', price: 450, qty: 2 },
  ],
  contact: { name: 'A B', email: '', phone: '+380501234567', city: 'c', address: 'a' },
  meta: { fbp: 'fb.1.2.3', userAgent: 'UA/1' },
  eventTime: 1731400001,
  sourceUrl: 'https://x.test/checkout',
}
const ev = buildPurchaseEvent(input) as Ev
assert.equal(ev.event_name, 'Purchase')
assert.equal(ev.event_id, '1731400000000')
assert.equal(ev.action_source, 'website')
assert.equal(ev.custom_data.value, 2100)
assert.equal(ev.custom_data.currency, 'UAH')
assert.deepEqual(ev.custom_data.content_ids, ['11', '22'])
assert.equal(ev.user_data.em, undefined)
assert.deepEqual(ev.user_data.ph, [sha256('380501234567')])
assert.equal(ev.user_data.client_user_agent, 'UA/1')
assert.equal(ev.user_data.fbp, 'fb.1.2.3')
assert.equal(buildPurchaseEvent(input).event_id, ev.event_id)

const bare = buildPurchaseEvent({ ...input, meta: {} }) as Ev
assert.ok(!('fbp' in bare.user_data) && !('fbc' in bare.user_data))
console.log('capi tests passed')
