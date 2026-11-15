import 'server-only'

/** Fire-and-forget to the Conversions API; never throws, so the LiqPay webhook is unaffected. */
export async function sendPurchase(event: object, opts: { testEventCode?: string }): Promise<void> {
  const pixelId = process.env.META_PIXEL_ID
  const token = process.env.META_CAPI_TOKEN
  if (!pixelId || !token) return
  try {
    const res = await fetch(`https://graph.facebook.com/v27.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [event],
        access_token: token,
        ...(opts.testEventCode && { test_event_code: opts.testEventCode }),
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) console.error('[meta-capi] non-2xx', res.status, await res.text().catch(() => ''))
  } catch (error) {
    console.error('[meta-capi] send failed', error)
  }
}
