// Run: npm test. Pure asserts over the kopeck money rules; no network.
import assert from 'node:assert/strict'
import { MAX_TOTAL_KOP, fromKop, parseCrmLineTotal, toKop, totalKop } from '@/lib/mono/money'
import { formatKop, formatPrice } from '@/lib/format'

assert.equal(toKop(19.99), 1999)
assert.equal(toKop(1300.0), 130000)
assert.equal(toKop(Number('19.9900')), 1999)
assert.equal(toKop(10.005), null) // sub-kopeck
assert.equal(toKop(10.000000001), null)
assert.equal(toKop(0), null)
assert.equal(toKop(-5), null)
assert.equal(toKop(NaN), null)
assert.equal(toKop(Infinity), null)
assert.equal(toKop('19.99'), null)
assert.equal(toKop(1_000_000.01), null) // above MAX_TOTAL_KOP

assert.equal(totalKop([{ unitPriceKop: 1999, qty: 3 }]), 5997)
assert.equal(totalKop([{ unitPriceKop: toKop(0.1)!, qty: 1 }, { unitPriceKop: toKop(0.2)!, qty: 1 }]), 30)
assert.equal(totalKop([]), null)
assert.equal(totalKop([{ unitPriceKop: 1.5, qty: 1 }]), null)
assert.equal(totalKop([{ unitPriceKop: 1999, qty: 0 }]), null)
assert.equal(totalKop([{ unitPriceKop: MAX_TOTAL_KOP, qty: 2 }]), null) // line over cap
assert.equal(totalKop([{ unitPriceKop: Number.MAX_SAFE_INTEGER, qty: 2 }]), null) // line overflow

assert.equal(JSON.stringify(fromKop(5997)), '59.97')
assert.equal(JSON.stringify(fromKop(MAX_TOTAL_KOP)), '1000000')
assert.equal(JSON.stringify(fromKop(MAX_TOTAL_KOP - 1)), '999999.99')
assert.equal(JSON.stringify(fromKop(1)), '0.01')

assert.equal(parseCrmLineTotal(1300), 130000)
assert.equal(parseCrmLineTotal('500,32 грн'), 50032)
assert.equal(parseCrmLineTotal('1 300,00 грн'), 130000)
assert.equal(parseCrmLineTotal('1 300,5 грн'), 130050)
assert.equal(parseCrmLineTotal('500 грн'), 50000)
assert.equal(parseCrmLineTotal('500.32 грн'), null)
assert.equal(parseCrmLineTotal(undefined), null)
assert.equal(parseCrmLineTotal(10.005), null)

assert.equal(formatKop(120000), '₴1 200')
assert.equal(formatKop(5997), '₴59,97')
assert.equal(formatKop(5), '₴0,05')
assert.equal(formatPrice(19.99), '₴19,99')
assert.equal(formatPrice(1200), '₴1 200')
