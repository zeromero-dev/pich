// Run: npm test. Pure asserts over the reconciliation report; no network.
import assert from 'node:assert/strict'
import type { CrmRemoteOrder } from '@/lib/hugeprofit/order-rules'
import { actionFor, findingsFor, keyMatches, renderReport, reportContinuation, parseReportContinuation, reportStatementId, reportWindow } from '@/lib/mono/report'

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
const item = { invoiceId: 'inv1', status: 'success', amount: 5997, ccy: 980, reference: '123456789012345', destination: 'Замовлення Plai Pich #123456789012345' }
const problems = (
  statement: Parameters<typeof findingsFor>[0], orders: CrmRemoteOrder[], current: Partial<NonNullable<Parameters<typeof findingsFor>[2]>> | null, warehouseId: string,
) => findingsFor(statement, orders, current && { ...item, ...current }, warehouseId).map((f) => f.problem)

assert.deepEqual(problems(item, [], null, '51630'), ['оплачено, але замовлення в CRM немає'])
assert.deepEqual(problems({ ...item, status: 'processing' }, [], item, '51630'), ['оплачено, але замовлення в CRM немає'])
assert.deepEqual(problems(item, [], { status: 'processing' }, '51630'), ['не вдалося перевірити — відкрийте звірку ще раз пізніше'])
assert.deepEqual(problems({ ...item, cancelList: [{}] }, [], { cancelList: [] }, '51630'), ['не вдалося перевірити — відкрийте звірку ще раз пізніше'])
assert.deepEqual(problems(item, [], { ...item, invoiceId: 'another' }, '51630'), ['не вдалося перевірити — відкрийте звірку ще раз пізніше'])
assert.deepEqual(problems({ ...item, destination: 'Оплата за посиланням' }, [], item, '51630'), ['оплата не з сайту (без номера замовлення)'])
assert.deepEqual(problems({ ...item, destination: undefined }, [], item, '51630'), ['не підтверджено, що оплата з сайту'])
assert.deepEqual(problems(item, [ours], null, '51630'), [])
assert.deepEqual(problems(item, [ours, ours], null, '51630'), ['кілька замовлень у CRM на одну оплату'])
assert.deepEqual(problems(item, [{ ...ours, price: 89.97 }], null, '51630'), ['сума в CRM не збігається з оплатою', 'сума замовлення не збігається із сумою рядків'])
assert.deepEqual(problems(item, [withLine({ is_reserved: false })], null, '51630'), ['товар не зарезервовано'])
assert.deepEqual(problems(item, [withLine({ mid: '34998' })], null, '51630'), ['товар зарезервовано не на тому складі'])
assert.deepEqual(problems(item, [ours], { status: 'reversed' }, '51630'), ['кошти повернуто повністю'])
assert.deepEqual(problems(item, [{ ...ours, sales_id: 77 }], { status: 'reversed' }, '51630'), ['кошти повернуто повністю (замовлення вже переведено в продаж)'])
assert.deepEqual(problems(item, [ours], { ...item, finalAmount: 1000 }, '51630'), ['сума в CRM не збігається з оплатою', 'кошти повернуто частково'])
assert.deepEqual(problems(item, [withLine({ is_reserved: false })], { ...item, status: 'reversed' }, '51630'), ['кошти повернуто повністю'])
assert.deepEqual(problems(item, [{ ...ours, info: { is_paid: true, order_text: 'mono invoice other' } }], { status: 'reversed' }, '51630'), ['замовлення в CRM не позначене як оплата цього інвойсу'])
assert.deepEqual(problems(item, [{ ...ours, sales_id: 77, info: { is_paid: true, order_text: 'mono invoice other' } }], { status: 'reversed' }, '51630'), ['замовлення в CRM не позначене як оплата цього інвойсу'])
assert.deepEqual(problems(item, [ours], { ...item, finalAmount: 1000, cancelList: [{ status: 'processing' }] }, '51630'), ['повернення коштів в обробці'])
assert.deepEqual(problems(item, [{ ...ours, sales_id: 77 }], { finalAmount: 1000 }, '51630'), ['кошти повернуто частково (замовлення вже переведено в продаж)'])
assert.deepEqual(problems(item, [], { cancelList: [{ status: 'success', amount: 4997 }] }, '51630'), ['не вдалося перевірити — відкрийте звірку ще раз пізніше'])
assert.deepEqual(problems({ ...item, cancelList: [{}] }, [ours], { status: 'success', cancelList: [{}] }, '51630'), ['повернення коштів в обробці'])
assert.deepEqual(problems({ ...item, status: 'reversed' }, [], { status: 'reversed' }, '51630'), []) // reversed and never fulfilled: nothing to do
const f = findingsFor(item, [], null, '51630')[0]
assert.deepEqual(f, { invoiceId: 'inv1', reference: '123456789012345', amountKop: 5997, problem: 'оплачено, але замовлення в CRM немає' })

const win = reportWindow(null, null, now)!
assert.match(renderReport(win, 3, []), /Перевірено: 3/)
assert.match(renderReport(win, 3, []), /Все гаразд\./)
assert.match(renderReport(win, 1, [f]), /оплачено, але замовлення в CRM немає — інвойс mono inv1, замовлення №123456789012345, ₴59,97/)

assert.equal(keyMatches('a', 'a'), true)
assert.equal(keyMatches('a', 'b'), false)
assert.equal(keyMatches('a', undefined), false)
assert.equal(keyMatches(null, 'a'), false)
assert.equal(keyMatches('', ''), false)

// Final review fix: payments the owners take outside the site (no 15-digit site reference) are never "refund this".
assert.deepEqual(problems({ ...item, reference: undefined }, [], null, '51630'), ['оплата не з сайту (без номера замовлення)'])
assert.deepEqual(problems({ ...item, reference: 'HP-2041' }, [], null, '51630'), ['оплата не з сайту (без номера замовлення)'])

// A non-site payment's reference isn't our order number: don't label it as one.
const outside = findingsFor({ ...item, invoiceId: 'inv2', reference: '176348500000000', destination: 'Посилання', amount: 100 }, [], null, '51630')[0]
assert.match(renderReport(win, 1, [outside]), /оплата не з сайту \(без номера замовлення\) — інвойс mono inv2, ₴1$/m)

// Every finding tells the operator what to do.
for (const problem of [
  'оплачено, але замовлення в CRM немає',
  'оплата не з сайту (без номера замовлення)',
  'не підтверджено, що оплата з сайту',
  'кілька замовлень у CRM на одну оплату',
  'сума в CRM не збігається з оплатою',
  'сума замовлення не збігається із сумою рядків',
  'не вдається прочитати суми рядків',
  'товар не зарезервовано',
  'товар зарезервовано не на тому складі',
  'кошти повернуто повністю',
  'кошти повернуто повністю (замовлення вже переведено в продаж)',
  'кошти повернуто частково',
  'кошти повернуто частково (замовлення вже переведено в продаж)',
  'повернення коштів в обробці',
  'повернення коштів в обробці (замовлення вже переведено в продаж)',
  'не вдалося перевірити — відкрийте звірку ще раз пізніше',
]) {
  assert.ok(actionFor(problem).length > 20, `no action for: ${problem}`)
}
assert.match(renderReport(win, 1, [f]), /\n {3}Що робити: Поверніть кошти/)

// Review fix: after a partial refund the operator removes lines — don't then ask for the original total back.
assert.ok(!problems(item, [{ ...ours, price: 10 }], { status: 'success', finalAmount: 1000 }, '51630').includes('сума в CRM не збігається з оплатою'))
// Review fix: a manually created order must not be refunded too; one-off actions say "once".
assert.match(actionFor('оплачено, але замовлення в CRM немає'), /кошти НЕ повертайте/)
assert.match(actionFor('кошти повернуто повністю (замовлення вже переведено в продаж)'), /один раз/)
assert.match(actionFor('кошти повернуто частково'), /лише нові зміни/)
assert.match(actionFor('не вдається прочитати суми рядків'), /розробник/)
assert.match(actionFor('повернення коштів в обробці'), /кабінеті mono/)

// Review fix: no order, but a refund already started — don't ask for a second refund.
assert.deepEqual(problems(item, [], { status: 'success', cancelList: [{}] }, '51630'), ['повернення коштів в обробці'])

// Codex review: a failed refund is not "in progress" — without an order, the buyer still needs refunding.
assert.deepEqual(problems(item, [], { status: 'success', cancelList: [{ status: 'failure' }] }, '51630'), ['оплачено, але замовлення в CRM немає'])
assert.deepEqual(problems(item, [ours], { status: 'success', cancelList: [{ status: 'failure' }] }, '51630'), [])
// Codex review: the report checks what the webhook checks — paid flag, currency, this invoice in the note.
const MISMATCH = 'замовлення в CRM не позначене як оплата цього інвойсу'
assert.deepEqual(problems(item, [{ ...ours, info: { is_paid: false, order_text: 'mono invoice inv1' } }], null, '51630'), [MISMATCH])
assert.deepEqual(problems(item, [{ ...ours, currency: 'USD' }], null, '51630'), [MISMATCH])
assert.deepEqual(problems(item, [{ ...ours, info: { is_paid: true, order_text: 'mono invoice other' } }], null, '51630'), [MISMATCH])
assert.ok(actionFor(MISMATCH).length > 20)
// Codex review: an impossible date is rejected, not rolled into the next month.
assert.equal(reportWindow('2026-02-30', null, now), null)
// Codex review r2: a completed partial refund without an order still leaves money to refund — not "in progress".
assert.deepEqual(problems(item, [], { status: 'success', finalAmount: 1000, cancelList: [{ status: 'success' }] }, '51630'), ['оплачено, але замовлення в CRM немає'])
// Codex review r3: after a partial refund the line shows what is still held, not the original charge.
assert.equal(findingsFor(item, [], { ...item, finalAmount: 1000, cancelList: [{ status: 'success' }] }, '51630')[0].amountKop, 1000)
const partial = findingsFor(item, [ours], { ...item, finalAmount: 1000 }, '51630')
assert.match(renderReport(win, 1, partial), /повернуто ₴49,97, залишок ₴10/)
assert.notDeepEqual(partial, findingsFor(item, [ours], { ...item, finalAmount: 2000 }, '51630'))
assert.deepEqual(problems(item, [{ ...withLine({ total: 10 }), price: 10 }], { ...item, finalAmount: 1000 }, '51630'), ['кошти повернуто частково'])
const statementId = reportStatementId(['inv1.with_opaque_id', 'inv2'])
assert.notEqual(statementId, reportStatementId(['inv0', 'inv1.with_opaque_id', 'inv2']))
const continuation = reportContinuation(win, statementId, 'inv1.with_opaque_id')
assert.deepEqual(parseReportContinuation(continuation, new Date(now.getTime() + 60_000)), { window: win, statementId, after: 'inv1.with_opaque_id' })
assert.equal(parseReportContinuation(reportContinuation(win, statementId, ''), now)?.after, '')
assert.equal(parseReportContinuation('0.999999999999.inv1', now), null)
assert.equal(parseReportContinuation('invalid', now), null)
const incomplete = renderReport(win, 1, [], { remaining: 2, continuation })
assert.match(incomplete, /Залишилось перевірити: 2/)
assert.match(incomplete, /&resume=/)
assert.doesNotMatch(incomplete, /Все гаразд/)
assert.match(renderReport(win, 1, [], undefined, true), /У цій частині звірки все гаразд/)
// Review: a sold order may lose its payment marks in HugeProfit (unverified) — don't flag it daily.
assert.deepEqual(problems(item, [{ ...ours, sales_id: 77, info: { is_paid: false, order_text: '' } }], null, '51630'), [])
