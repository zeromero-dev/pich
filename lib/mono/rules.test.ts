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
