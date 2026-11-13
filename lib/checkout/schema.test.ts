// Run: npm test. A tracking cookie must never fail a checkout.
import assert from 'node:assert/strict'
import { checkoutRequestSchema } from '@/lib/checkout/schema'

const r = checkoutRequestSchema.safeParse({ meta: { fbp: 'fb.1.2.3', fbc: 'x'.repeat(600) } })
// Other fields are invalid here; only meta's treatment matters.
assert.ok(!r.success && !r.error.issues.some((i) => i.path[0] === 'meta'))
assert.deepEqual(
  checkoutRequestSchema.shape.meta.parse({ fbp: 'fb.1.2.3', fbc: 'x'.repeat(600) }),
  { fbp: 'fb.1.2.3', fbc: undefined },
)
