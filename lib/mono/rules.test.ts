// Run: npm test. Pure asserts over mono payment rules; no network.
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { isAllowedPageUrl, resolvePaymentMode } from '@/lib/mono/rules'
import { verifySignature } from '@/lib/mono/signature'

/* Payment mode: exactly two allowed combinations, every identity positively matched. */
const base = { liveMerchantId: 'live_1', testMerchantId: 'test_4U18rFLZus' }
assert.equal(resolvePaymentMode({ ...base, vercelEnv: 'production', merchantId: 'live_1', warehouseId: '34998' }), 'live')
assert.equal(resolvePaymentMode({ ...base, vercelEnv: 'preview', merchantId: 'test_4U18rFLZus', warehouseId: '51630' }), 'test')
assert.equal(resolvePaymentMode({ ...base, vercelEnv: undefined, merchantId: 'test_4U18rFLZus', warehouseId: '51630' }), 'test')
// test token on production
assert.equal(resolvePaymentMode({ ...base, vercelEnv: 'production', merchantId: 'test_4U18rFLZus', warehouseId: '34998' }), null)
// production with the dev warehouse
assert.equal(resolvePaymentMode({ ...base, vercelEnv: 'production', merchantId: 'live_1', warehouseId: '51630' }), null)
// live id in preview, and locally
assert.equal(resolvePaymentMode({ ...base, vercelEnv: 'preview', merchantId: 'live_1', warehouseId: '51630' }), null)
assert.equal(resolvePaymentMode({ ...base, vercelEnv: undefined, merchantId: 'live_1', warehouseId: '34998' }), null)
// preview/local with the real warehouse
assert.equal(resolvePaymentMode({ ...base, vercelEnv: 'preview', merchantId: 'test_4U18rFLZus', warehouseId: '34998' }), null)
assert.equal(resolvePaymentMode({ ...base, vercelEnv: undefined, merchantId: 'test_4U18rFLZus', warehouseId: '34998' }), null)
// unknown merchant id; failed details read
assert.equal(resolvePaymentMode({ ...base, vercelEnv: undefined, merchantId: 'test_other', warehouseId: '51630' }), null)
assert.equal(resolvePaymentMode({ ...base, vercelEnv: undefined, merchantId: null, warehouseId: '51630' }), null)
// unset env never matches
assert.equal(resolvePaymentMode({ vercelEnv: undefined, merchantId: 'test_4U18rFLZus', warehouseId: '51630' }), null)
assert.equal(resolvePaymentMode({ testMerchantId: '', vercelEnv: undefined, merchantId: '', warehouseId: '51630' }), null)

assert.equal(isAllowedPageUrl('https://pay.monobank.ua/abc'), true)
assert.equal(isAllowedPageUrl('https://pay.mbnk.biz/abc'), true)
assert.equal(isAllowedPageUrl('http://pay.monobank.ua/abc'), false)
assert.equal(isAllowedPageUrl('https://pay.monobank.ua.evil.com/x'), false)
assert.equal(isAllowedPageUrl('not a url'), false)
assert.equal(isAllowedPageUrl(42), false)

/* Signature: ECDSA-SHA256 over the raw body, base64 signature, PEM key (as mono serves it). */
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const body = Buffer.from('{"invoiceId":"inv1","status":"success","amount":5997,"ccy":980}')
const sigB64 = sign('sha256', body, privateKey).toString('base64')
assert.equal(verifySignature(body, sigB64, pem), true)
assert.equal(verifySignature(Buffer.concat([body, Buffer.from(' ')]), sigB64, pem), false)
assert.equal(verifySignature(body, 'not-base64!!', pem), false)
assert.equal(verifySignature(body, sigB64, 'not a pem'), false)

/* Webhook screening and decisions (Task 6). */
import { adverseEvidence, checkSignedEvent, screenRequest } from '@/lib/mono/rules'
import type { CheckoutPayload, InvoiceStatus } from '@/lib/mono/types'

assert.equal(screenRequest('100', 'sig'), 'ok')
assert.equal(screenRequest(null, 'sig'), 'ok') // chunked: the body length is checked after reading
assert.equal(screenRequest('20000', 'sig'), 'too_large')
assert.equal(screenRequest(null, null), 'unsigned')
assert.equal(screenRequest('100', ''), 'unsigned')

const R = '123456789012345'
const payload: CheckoutPayload = {
  v: 1,
  reference: R,
  lines: [{ productId: '9526188', unitPriceKop: 1999, qty: 3 }],
  totalKop: 5997,
  contact: { name: 'А Б', email: '', phone: '+380501234567', city: 'В', address: 'Г', delivery: 'pickup' },
}
const signed: InvoiceStatus = {
  invoiceId: 'inv1',
  status: 'success',
  amount: 5997,
  ccy: 980,
  reference: R,
  finalAmount: 5997,
  modifiedDate: '2026-11-18T17:11:30Z',
}
assert.equal(checkSignedEvent(signed, payload), 'ok')
assert.equal(checkSignedEvent({ ...signed, finalAmount: undefined }, payload), 'ok') // missing finalAmount allowed
assert.equal(checkSignedEvent({ ...signed, status: 'processing' }, payload), 'not success')
assert.equal(checkSignedEvent({ ...signed, reference: 'x' }, payload), 'reference mismatch')
assert.equal(checkSignedEvent({ ...signed, ccy: 840 }, payload), 'currency')
assert.equal(checkSignedEvent({ ...signed, amount: 5996, finalAmount: 5996 }, payload), 'amount mismatch')
assert.equal(checkSignedEvent({ ...signed, finalAmount: 3000 }, payload), 'finalAmount differs')
assert.equal(checkSignedEvent({ ...signed, cancelList: [{}] }, payload), 'cancelList present')
assert.equal(checkSignedEvent({ ...signed, invoiceId: '' }, payload), 'missing invoiceId')

assert.equal(adverseEvidence(signed, signed), 'ok')
assert.equal(adverseEvidence({ ...signed, status: 'processing', modifiedDate: undefined }, signed), 'ok') // lagging read
assert.equal(adverseEvidence({ ...signed, status: 'created', modifiedDate: '2026-11-18T17:00:00Z' }, signed), 'ok')
assert.notEqual(adverseEvidence({ ...signed, status: 'reversed', modifiedDate: undefined }, signed), 'ok') // undated reversal
assert.notEqual(adverseEvidence({ ...signed, status: 'failure' }, signed), 'ok')
assert.notEqual(adverseEvidence({ ...signed, finalAmount: 3000 }, signed), 'ok') // equal-timestamp partial refund
assert.notEqual(adverseEvidence({ ...signed, cancelList: [{ status: 'failure' }] }, signed), 'ok') // failed cancellation
assert.notEqual(adverseEvidence({ ...signed, invoiceId: 'other' }, signed), 'ok')
assert.notEqual(adverseEvidence({ ...signed, amount: 1 }, signed), 'ok')
assert.notEqual(adverseEvidence({ ...signed, reference: 'other' }, signed), 'ok')
// A lagging `processing` read carries finalAmount 0 (seen in the 2026-11-18 probe) — not a refund.
assert.equal(adverseEvidence({ ...signed, status: 'processing', finalAmount: 0 }, signed), 'ok')

/* Final review fix: CRM_INTEGRATION_ID must fail closed. */
import { parseIntegrationId } from '@/lib/mono/rules'
assert.equal(parseIntegrationId('13585'), 13585)
assert.equal(parseIntegrationId(undefined), null)
assert.equal(parseIntegrationId(''), null)
assert.equal(parseIntegrationId('abc'), null)
assert.equal(parseIntegrationId('0'), null)
assert.equal(parseIntegrationId('12.5'), null)
