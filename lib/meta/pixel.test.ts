import assert from 'node:assert/strict'
import { clearQueue, flushQueue, track } from './pixel'

;(globalThis as { window?: unknown }).window = {}
track('ViewContent', { a: 1 })
track('AddToCart', { b: 2 })
for (let i = 0; i < 50; i++) track('AddToCart', { i })

const sent: string[] = []
flushQueue((e) => sent.push(e))
assert.equal(sent.length, 20)
assert.deepEqual(sent.slice(0, 2), ['ViewContent', 'AddToCart'])
flushQueue((e) => sent.push(e))
assert.equal(sent.length, 20)
track('ViewContent', {})
clearQueue()
flushQueue((e) => sent.push(e))
assert.equal(sent.length, 20)
console.log('pixel queue: all checks passed')
