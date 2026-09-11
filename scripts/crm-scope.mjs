// Reports what HUGEPROFIT_API_KEY can actually reach. Run it after re-scoping
// the token in the CRM's integration settings — code gates cannot narrow a
// token, only the CRM can. Reads only; writes nothing.
//
//   node scripts/crm-scope.mjs
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).split('#')[0].trim()]),
)

const token = env.HUGEPROFIT_API_KEY
if (!token) throw new Error('HUGEPROFIT_API_KEY missing from .env.local')

const configured = Number(env.CRM_WAREHOUSE_ID)
if (!Number.isInteger(configured) || configured <= 0) {
  throw new Error('CRM_WAREHOUSE_ID missing or invalid in .env.local')
}

async function crm(path) {
  const res = await fetch(`https://crm.h-profit.com/bapi/${path}`, {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
  })
  const text = await res.text()
  try {
    return { status: res.status, body: JSON.parse(text) }
  } catch {
    return { status: res.status, body: text.slice(0, 200) }
  }
}

const ref = await crm('reference_info?types=warehouses')
const warehouses = ref.body?.data?.warehouses ?? []
if (!warehouses.length) {
  console.log(`reference_info returned no warehouses (status ${ref.status}) — token may be scoped or invalid`)
}

console.log('products readable per warehouse:')
const reachable = []
for (const w of warehouses) {
  const { status, body } = await crm(`products?limit=500&warehouse_id=${w.id}`)
  const rows = Array.isArray(body?.data) ? body.data.length : `error (${status})`
  if (Array.isArray(body?.data) && body.data.length > 0) reachable.push(w)
  console.log(`  ${w.id}  ${String(rows).padStart(4)} rows  ${w.name}${w.id === configured ? '   <-- CRM_WAREHOUSE_ID' : ''}`)
}

const others = reachable.filter((w) => w.id !== configured)
console.log(
  others.length
    ? `\nVERDICT: this token also reads ${others.map((w) => `${w.id} (${w.name})`).join(', ')} beyond CRM_WAREHOUSE_ID=${configured}.\nScope it in the CRM integration settings if that should be impossible rather than merely unused.`
    : `\nVERDICT: this token reads only CRM_WAREHOUSE_ID=${configured}. The boundary is the CRM's, not just this code's.`,
)
