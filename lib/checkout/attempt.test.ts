// Run: npm test. Pure asserts over the payment-attempt marker and result status; no network.
import assert from 'node:assert/strict'
import { cartClearDecision, cartFingerprint, migrateCart, toResultStatus } from '@/lib/checkout/attempt'

const R = '123456789012345'
assert.equal(toResultStatus({ status: 'success', amount: 5997, finalAmount: 5997, reference: R }, R), 'paid')
assert.equal(toResultStatus({ status: 'success', amount: 5997, reference: R }, R), 'paid')
assert.equal(toResultStatus({ status: 'success', amount: 5997, finalAmount: 1000, reference: R }, R), 'reversed')
assert.equal(toResultStatus({ status: 'processing', amount: 5997, reference: R }, R), 'pending')
assert.equal(toResultStatus({ status: 'created', amount: 5997, reference: R }, R), 'pending')
assert.equal(toResultStatus({ status: 'failure', amount: 5997, reference: R }, R), 'failed')
assert.equal(toResultStatus({ status: 'expired', amount: 5997, reference: R }, R), 'expired')
assert.equal(toResultStatus({ status: 'reversed', amount: 5997, reference: R }, R), 'reversed')
// Final review fix: an invoice that is not this attempt's is unknown, not "a few seconds" forever.
assert.equal(toResultStatus({ status: 'success', amount: 5997, reference: 'other' }, R), 'unknown')
assert.equal(toResultStatus(null, R), 'pending')

const fp = cartFingerprint([
  { productId: '2', qty: 1, unitPriceKop: 100 },
  { productId: '1', qty: 3, unitPriceKop: 1999 },
])
assert.equal(fp, '1:3:1999|2:1:100')
const attempt = { reference: R, fingerprint: fp }
assert.deepEqual(cartClearDecision('paid', R, attempt, fp), { clear: true, dropAttempt: true })
assert.deepEqual(cartClearDecision('paid', R, attempt, 'edited'), { clear: false, dropAttempt: true }) // edited after return / in another tab
assert.deepEqual(cartClearDecision('paid', R, null, fp), { clear: false, dropAttempt: false }) // old success revisited
assert.deepEqual(cartClearDecision('pending', R, attempt, fp), { clear: false, dropAttempt: false }) // processing keeps the marker
assert.deepEqual(cartClearDecision('failed', R, attempt, fp), { clear: false, dropAttempt: true })
assert.deepEqual(cartClearDecision('expired', R, attempt, fp), { clear: false, dropAttempt: true })
assert.deepEqual(cartClearDecision('paid', R, { reference: 'other', fingerprint: fp }, fp), { clear: false, dropAttempt: false })

const migrated = migrateCart([
  { product: { price: 19.99 }, qty: 1 },
  { product: { price: 10.005 }, qty: 1 },
  { product: { price: Number.NaN }, qty: 1 },
])
assert.equal(migrated.length, 1)
assert.equal(migrated[0].product.price, 19.99)

// Display price per unit in kopecks (moved out of the providers component file).
import { lineUnitKop } from '@/lib/checkout/attempt'
assert.equal(lineUnitKop({ price: 19.99 }), 1999)
assert.equal(lineUnitKop({ price: 10.005 }), 1001) // display fallback only; the server refuses it

assert.deepEqual(cartClearDecision('unknown', R, attempt, fp), { clear: false, dropAttempt: false })

assert.deepEqual(cartClearDecision('notfound', R, attempt, fp), { clear: false, dropAttempt: false })
