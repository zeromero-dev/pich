// Run: npm test. Pure asserts over CRM order serialization and classification; no network.
import assert from 'node:assert/strict'
import {
  buildOrderPayload,
  classifyExisting,
  orderHealth,
  reservationComplete,
  type CrmRemoteOrder,
  type Expected,
} from '@/lib/hugeprofit/order-rules'
import type { OrderContact } from '@/lib/mono/types'

type Line = NonNullable<CrmRemoteOrder['order_data']>[number]

// Shape verified on a live dev order 2026-11-18 (numbers, mid as string).
const ours: CrmRemoteOrder = {
  integration_id: 13585,
  order_id: '123456789012345',
  sales_id: null,
  price: 59.97,
  currency: 'UAH',
  info: { is_paid: true, order_text: 'mono invoice inv1' },
  order_data: [{ local_product_id: 9526188, quantity: 3, total: 59.97, is_reserved: true, mid: '51630' }],
}
const withLine = (patch: Partial<Line>): CrmRemoteOrder => ({ ...ours, order_data: [{ ...ours.order_data![0], ...patch }] })
const expected: Expected = {
  reference: '123456789012345',
  invoiceId: 'inv1',
  totalKop: 5997,
  lines: [{ productId: '9526188', qty: 3 }],
}

assert.equal(classifyExisting([], 13585, expected, '51630'), 'absent')
assert.equal(classifyExisting([{ ...ours, integration_id: 999 }], 13585, expected, '51630'), 'absent') // other integration ignored
assert.equal(classifyExisting([ours], 13585, expected, '51630'), 'recorded')
assert.equal(classifyExisting([ours, { ...ours, integration_id: 999 }], 13585, expected, '51630'), 'recorded')
assert.equal(classifyExisting([ours, ours], 13585, expected, '51630'), 'conflict')
assert.equal(classifyExisting([{ ...ours, price: 59.96 }], 13585, expected, '51630'), 'conflict')
// Final review fix: only exact order_id matches count, in case the CRM filter is ever loose or ignored.
assert.equal(classifyExisting([{ ...ours, order_id: '999' }], 13585, expected, '51630'), 'absent')
assert.equal(classifyExisting([ours, { ...ours, order_id: '999' }], 13585, expected, '51630'), 'recorded')
assert.equal(classifyExisting([{ ...ours, info: { is_paid: true, order_text: 'mono invoice other' } }], 13585, expected, '51630'), 'conflict')
assert.equal(classifyExisting([{ ...ours, info: { is_paid: false, order_text: 'mono invoice inv1' } }], 13585, expected, '51630'), 'conflict')
assert.equal(classifyExisting([{ ...ours, currency: 'USD' }], 13585, expected, '51630'), 'conflict')
assert.equal(classifyExisting([withLine({ quantity: 2 })], 13585, expected, '51630'), 'conflict')
assert.equal(classifyExisting([withLine({ is_reserved: false })], 13585, expected, '51630'), 'partial')
assert.equal(classifyExisting([withLine({ mid: '34998' })], 13585, expected, '51630'), 'partial')
assert.equal(classifyExisting([{ ...ours, order_data: [] }], 13585, expected, '51630'), 'partial') // dropped line
assert.equal(classifyExisting([{ ...withLine({ is_reserved: false }), sales_id: 77 }], 13585, expected, '51630'), 'recorded') // converted to sale
assert.equal(classifyExisting([{ ...ours, currency: 'грн' }], 13585, expected, '51630'), 'recorded')

assert.equal(reservationComplete([[9526188, 51630]], [{ productId: '9526188' }], '51630'), true)
assert.equal(reservationComplete([[9526188, '51630']], [{ productId: '9526188' }], '51630'), true)
assert.equal(reservationComplete([[9526188, 34998]], [{ productId: '9526188' }], '51630'), false)
assert.equal(reservationComplete([], [{ productId: '9526188' }], '51630'), false)
assert.equal(reservationComplete(undefined, [{ productId: '9526188' }], '51630'), false)

assert.deepEqual(orderHealth(ours, '51630'), [])
assert.deepEqual(orderHealth({ ...ours, price: 89.97 }, '51630'), ['сума замовлення не збігається із сумою рядків'])
assert.deepEqual(orderHealth(withLine({ total: '59,97 грн' }), '51630'), [])
assert.deepEqual(orderHealth(withLine({ total: 'n/a' }), '51630'), ['не вдається прочитати суми рядків'])
assert.deepEqual(orderHealth(withLine({ is_reserved: false }), '51630'), ['товар не зарезервовано'])
assert.deepEqual(orderHealth(withLine({ mid: '34998' }), '51630'), ['товар зарезервовано не на тому складі'])
assert.deepEqual(orderHealth({ ...withLine({ is_reserved: false }), sales_id: 77 }, '51630'), [])

const contact: OrderContact = {
  name: 'Тарас Шевченко',
  email: '',
  phone: '+380501234567',
  city: 'Вінниця',
  address: 'Відділення №1',
  delivery: 'branch',
}
const body = buildOrderPayload(
  '123456789012345',
  [{ productId: '9526188', sku: 'A', name: 'Робота', unitPriceKop: 1999, qty: 3 }],
  contact,
  { isPaid: true, paymentType: 'plata by mono', orderText: 'mono invoice inv1' },
)
const json = JSON.stringify(body)
assert.match(json, /"order_id":"123456789012345"/)
assert.match(json, /"order_name":"Замовлення з сайту #123456789012345"/)
assert.match(json, /"price":59\.97,/) // order total
assert.match(json, /"price":19\.99,/) // unit
assert.match(json, /"total":59\.97,/) // line
assert.match(json, /"local_product_id":9526188/)
assert.doesNotMatch(json, /"email"/) // blank email omitted
assert.match(json, /"delivery_operator":"nova_poshta"/)

import { ourOrders } from '@/lib/hugeprofit/order-rules'
assert.deepEqual(ourOrders([ours, { ...ours, integration_id: 999 }, { ...ours, order_id: '999' }], 13585, '123456789012345'), [ours])
