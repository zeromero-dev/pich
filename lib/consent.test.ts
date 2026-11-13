// Run: npm test. Plain asserts over the pure consent-storage logic.
import assert from 'node:assert/strict'
import { CONSENT_MAX_AGE_MS, parseConsent, serializeConsent } from '@/lib/consent'

const t = 1_700_000_000_000
assert.equal(parseConsent(serializeConsent('granted', t), t), 'granted')
assert.equal(parseConsent(serializeConsent('denied', t), t), 'denied')
for (const raw of [null, 'garbage', '{"choice":"maybe","at":1}', '{"choice":"granted"}']) {
  assert.equal(parseConsent(raw, t), null)
}
assert.equal(parseConsent(serializeConsent('granted', 0), CONSENT_MAX_AGE_MS), 'granted')
assert.equal(parseConsent(serializeConsent('granted', 0), CONSENT_MAX_AGE_MS + 1), null)
