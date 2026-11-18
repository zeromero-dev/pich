// Run: npm test. Pure asserts over the reconciliation report; no network.
import assert from 'node:assert/strict'
import type { CrmRemoteOrder } from '@/lib/hugeprofit/order-rules'
import { findingsFor, keyMatches, renderReport, reportWindow } from '@/lib/mono/report'

type Line = NonNullable<CrmRemoteOrder['order_data']>[number]

const now = new Date('2026-11-18T10:00:00Z')
assert.deepEqual(reportWindow(null, null, now), {
  fromUnix: Date.parse('2026-11-11T10:00:00Z') / 1000,
  toUnix: Date.parse('2026-11-18T10:00:00Z') / 1000,
})
assert.deepEqual(reportWindow('2026-11-01', '2026-11-10', now), {
  fromUnix: Date.parse('2026-11-01T00:00:00Z') / 1000,
  toUnix: Date.parse('2026-11-11T00:00:00Z') / 1000, // `to` is inclusive: through the end of that day
})
assert.equal(reportWindow('2026-11-10', '2026-11-01', now), null)
assert.equal(reportWindow('2026-01-01', '2026-03-01', now), null) // > 31 days (mono's statement limit)
assert.equal(reportWindow('yesterday', null, now), null)

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
const item = { invoiceId: 'inv1', status: 'success', amount: 5997, ccy: 980, reference: '123456789012345' }
const problems = (...args: Parameters<typeof findingsFor>) => findingsFor(...args).map((f) => f.problem)

assert.deepEqual(problems(item, [], null, '51630'), ['paid, no CRM order'])
assert.deepEqual(problems(item, [ours], null, '51630'), [])
assert.deepEqual(problems(item, [ours, ours], null, '51630'), ['several CRM orders'])
assert.deepEqual(problems(item, [{ ...ours, price: 89.97 }], null, '51630'), ['total differs', 'total differs from line sum'])
assert.deepEqual(problems(item, [withLine({ is_reserved: false })], null, '51630'), ['unreserved line'])
assert.deepEqual(problems(item, [withLine({ mid: '34998' })], null, '51630'), ['reserved in wrong warehouse'])
assert.deepEqual(problems(item, [ours], { status: 'reversed' }, '51630'), ['full reversal'])
assert.deepEqual(problems(item, [{ ...ours, sales_id: 77 }], { status: 'reversed' }, '51630'), ['full reversal (converted to sale)'])
assert.deepEqual(problems(item, [ours], { status: 'success', finalAmount: 1000 }, '51630'), ['partial refund'])
assert.deepEqual(problems({ ...item, cancelList: [{}] }, [ours], { status: 'success', cancelList: [{}] }, '51630'), ['pending cancellation'])
assert.deepEqual(problems({ ...item, status: 'reversed' }, [], { status: 'reversed' }, '51630'), []) // reversed and never fulfilled: nothing to do
const f = findingsFor(item, [], null, '51630')[0]
assert.deepEqual(f, { invoiceId: 'inv1', reference: '123456789012345', amountKop: 5997, problem: 'paid, no CRM order' })

const win = reportWindow(null, null, now)!
assert.match(renderReport(win, 3, []), /Перевірено: 3/)
assert.match(renderReport(win, 3, []), /Все гаразд\./)
assert.match(renderReport(win, 1, [f]), /paid, no CRM order — інвойс inv1, ref 123456789012345, ₴59,97/)

assert.equal(keyMatches('a', 'a'), true)
assert.equal(keyMatches('a', 'b'), false)
assert.equal(keyMatches('a', undefined), false)
assert.equal(keyMatches(null, 'a'), false)
assert.equal(keyMatches('', ''), false)
