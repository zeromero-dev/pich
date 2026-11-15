export type ConsentChoice = 'granted' | 'denied'

export const CONSENT_KEY = 'plai-pich-consent-v1'
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

export function parseConsent(raw: string | null, now: number): ConsentChoice | null {
  if (!raw) return null
  try {
    const { choice, at } = JSON.parse(raw)
    if (choice !== 'granted' && choice !== 'denied') return null
    if (typeof at !== 'number' || now - at > CONSENT_MAX_AGE_MS) return null
    return choice
  } catch {
    return null
  }
}

export function serializeConsent(choice: ConsentChoice, now: number): string {
  return JSON.stringify({ choice, at: now })
}
