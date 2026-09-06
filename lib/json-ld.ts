/**
 * JSON for an inline <script>. JSON.stringify leaves `<` alone, so a
 * `</script>` inside CRM or calendar text would end the tag early (XSS).
 * Escaping `<`, `>`, `&` and the two Unicode line separators keeps the
 * payload valid JSON and inert HTML.
 */
const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => ESCAPES[c])
}
