// Run: npm test. Pure asserts over the encrypted checkout payload; no network.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { decryptPayload, encryptPayload, newReference, parseKeyring, resultToken, resultTokenIssuedAt, type Keyring } from '@/lib/mono/payload'
import type { CheckoutPayload } from '@/lib/mono/types'

const k1 = randomBytes(32)
const k0 = randomBytes(32)
const ring: Keyring = { active: 'k1', keys: { k1, k0 } }

assert.match(newReference(), /^[1-9]\d{14}$/)
assert.notEqual(newReference(), newReference())

const p: CheckoutPayload = {
  v: 1,
  reference: newReference(),
  lines: [
    { productId: '9526188', unitPriceKop: 1999, qty: 3 },
    { productId: '9054727', unitPriceKop: 130000, qty: 1 },
  ],
  totalKop: 5997 + 130000,
  contact: {
    name: 'Тарас Шевченко',
    email: '',
    phone: '+380501234567',
    city: 'Вінниця',
    address: 'Відділення №1: вул. Якова Шепеля, 1',
    delivery: 'branch',
  },
}

const env = encryptPayload(p, ring)
assert.deepEqual(decryptPayload(env, ring), p)
assert.equal(env.split('.').length, 4)
assert.ok(env.startsWith('k1.'))
assert.match(env, /^[A-Za-z0-9._-]+$/) // URL-safe as a query value
assert.notEqual(encryptPayload(p, ring), env) // fresh IV

// Tampering: flip one character of the ciphertext part.
const parts = env.split('.')
const c = parts[2]
parts[2] = (c[0] === 'A' ? 'B' : 'A') + c.slice(1)
assert.equal(decryptPayload(parts.join('.'), ring), null)

// Key id is authenticated: relabelling k1's ciphertext as k0 fails.
assert.equal(decryptPayload('k0' + env.slice(2), ring), null)

// Unknown key id.
assert.equal(decryptPayload(env, { active: 'k9', keys: { k9: randomBytes(32) } }), null)

// Rotation: minted under k0, read after k1 became active.
const old = encryptPayload(p, { active: 'k0', keys: { k0 } })
assert.deepEqual(decryptPayload(old, ring), p)

// Schema: totalKop must equal the line sum.
assert.equal(decryptPayload(encryptPayload({ ...p, totalKop: 1 }, ring), ring), null)

// Garbage.
assert.equal(decryptPayload('', ring), null)
assert.equal(decryptPayload('k1.a.b', ring), null)

assert.equal(parseKeyring('{"active":"k1","keys":{"k1":"c2hvcnQ="}}'), null) // 5-byte key
assert.equal(parseKeyring(undefined), null)
assert.equal(parseKeyring('not json'), null)
assert.equal(parseKeyring(JSON.stringify({ active: 'k2', keys: { k1: k1.toString('base64') } })), null) // active missing
const parsed = parseKeyring(JSON.stringify({ active: 'k1', keys: { k1: k1.toString('base64') } }))
assert.ok(parsed && parsed.keys.k1.equals(k1))

// Result-link token `keyId.issuedAt.mac`: lets /checkout/result look a payment up without the attempt cookie.
const REF = '123456789012345'
const AT = 1_763_500_000
const tok = resultToken(REF, ring, AT)
assert.equal(resultTokenIssuedAt(REF, tok, ring), AT)
assert.equal(resultTokenIssuedAt('123456789012346', tok, ring), null) // another reference
assert.equal(resultTokenIssuedAt(REF, tok.slice(0, -1) + (tok.endsWith('A') ? 'B' : 'A'), ring), null)
const [kid, iat, mac] = tok.split('.')
assert.equal(resultTokenIssuedAt(REF, `${kid}.${Number(iat) - 3600}.${mac}`, ring), null) // issue time is signed
assert.equal(resultTokenIssuedAt(REF, `${kid}.${mac}`, ring), null) // old two-part shape
assert.equal(resultTokenIssuedAt(REF, '', ring), null)
assert.equal(resultTokenIssuedAt(REF, null, ring), null)
assert.equal(resultTokenIssuedAt(REF, ['a', 'b'], ring), null) // repeated ?t= arrives as an array
assert.equal(resultTokenIssuedAt(REF, resultToken(REF, { active: 'k0', keys: { k0 } }, AT), ring), AT) // rotation
assert.equal(resultTokenIssuedAt(REF, tok, { active: 'k9', keys: { k9: randomBytes(32) } }), null) // unknown key

// Codex review: a shortened GCM tag must not authenticate.
{
  const [kid, iv, body, tag] = env.split('.')
  const short = Buffer.from(tag, 'base64url').subarray(0, 12).toString('base64url')
  assert.equal(decryptPayload([kid, iv, body, short].join('.'), ring), null)
}

// Meta match data round-trips, and a bad value drops to absent instead of losing the paid order.
{
  const meta = { fbp: 'fb.1.2.3', fbc: 'fb.1.2.abc', userAgent: 'UA/1', ip: '203.0.113.7' }
  assert.deepEqual(decryptPayload(encryptPayload({ ...p, meta }, ring), ring)?.meta, meta)
  const bad = decryptPayload(encryptPayload({ ...p, meta: { fbc: 'x'.repeat(600) } }, ring), ring)
  assert.ok(bad && bad.meta === undefined && bad.reference === p.reference)
}
