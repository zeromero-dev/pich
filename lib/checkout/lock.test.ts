// Run: npm test. Pure asserts over checkout line locking and the callback URL cap; no network.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { callbackUrl, lockLines, type FreshProduct } from '@/lib/checkout/lock'
import { encryptPayload } from '@/lib/mono/payload'

const p = (id: string, price: number, available = 5): FreshProduct => ({ id, inStock: available > 0, available, price, name: 'W' + id })
const fail = (r: ReturnType<typeof lockLines>) => (r.ok ? assert.fail('expected a failure') : r)

assert.deepEqual(lockLines([{ workId: '1', qty: 3, price: 19.99 }], [p('1', 19.99)]), {
  ok: true,
  lines: [{ productId: '1', unitPriceKop: 1999, qty: 3 }],
  totalKop: 5997,
})
assert.equal(fail(lockLines([{ workId: '1', qty: 1, price: 10 }], [null])).error, 'unavailable')
assert.equal(fail(lockLines([{ workId: '1', qty: 1, price: 10 }], [p('1', 10, 0)])).error, 'unavailable')
const short = fail(lockLines([{ workId: '1', qty: 6, price: 10 }], [p('1', 10, 5)]))
assert.ok(short.error === 'insufficient' && short.short[0].available === 5)
assert.equal(fail(lockLines([{ workId: '1', qty: 1, price: 10.005 }], [p('1', 10.005)])).error, 'invalid_price')
assert.equal(fail(lockLines([{ workId: '1', qty: 99, price: 20000 }], [p('1', 20000, 99)])).error, 'invalid_price') // total over cap
const rep = fail(lockLines([{ workId: '1', qty: 1, price: 19.99 }], [p('1', 20)]))
assert.ok(rep.error === 'repriced' && rep.repriced[0].was === 19.99 && rep.repriced[0].now === 20)
assert.equal(lockLines([{ workId: '1', qty: 1, price: 19.990000000000002 }], [p('1', 19.99)]).ok, true) // same kopecks
// unavailable wins over a repriced sibling, as today
assert.equal(fail(lockLines([{ workId: '1', qty: 1, price: 5 }, { workId: '2', qty: 1, price: 5 }], [p('1', 6), null])).error, 'unavailable')

const origin = 'https://www.pich.co.ua'
assert.equal(callbackUrl(origin, 'x'.repeat(100)), `${origin}/api/checkout/mono-callback?p=${'x'.repeat(100)}`)
assert.equal(callbackUrl(origin, 'x'.repeat(8000)), null)

// The largest valid order fits under the provisional cap.
const ring = { active: 'k1', keys: { k1: randomBytes(32) } }
const lines = Array.from({ length: 20 }, (_, i) => ({ productId: String(100000000 + i), unitPriceKop: 5000, qty: 99 }))
const worst = encryptPayload(
  {
    v: 1,
    reference: '999999999999999',
    lines,
    totalKop: 20 * 5000 * 99,
    contact: {
      name: 'Ж'.repeat(50) + ' ' + 'Щ'.repeat(50),
      email: 'a'.repeat(242) + '@example.com',
      phone: '+380501234567',
      city: 'Ї'.repeat(100),
      address: 'Курʼєр: ' + 'Є'.repeat(100) + ', ' + '1'.repeat(20) + ', кв. ' + '2'.repeat(20),
      delivery: 'courier',
    },
  },
  ring,
)
assert.notEqual(callbackUrl(origin, worst), null)
