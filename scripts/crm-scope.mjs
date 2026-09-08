// Reports what HUGEPROFIT_API_KEY can actually reach. Run it after re-scoping
// the token in the CRM's integration settings — code gates cannot narrow a
// token, only the CRM can. Reads only; writes nothing.
//
//   node scripts/crm-scope.mjs
import { readFileSync } from 'node:fs'

const REAL_SHOP = 34998

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).split('#')[0].trim()]),
)

const token = env.HUGEPROFIT_API_KEY
if (!token) throw new Error('HUGEPROFIT_API_KEY missing from .env.local')

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

console.log('warehouses this token can enumerate:')
for (const w of warehouses) console.log(`  ${w.id}  ${w.name}${w.id === REAL_SHOP ? '   <-- REAL SHOP' : ''}`)

console.log('\nproducts readable per warehouse:')
let realShopReadable = false
for (const w of warehouses) {
  const { status, body } = await crm(`products?limit=500&warehouse_id=${w.id}`)
  const rows = Array.isArray(body?.data) ? body.data.length : `error (${status})`
  if (w.id === REAL_SHOP && Array.isArray(body?.data) && body.data.length > 0) realShopReadable = true
  console.log(`  ${w.id}  ${String(rows).padStart(4)} rows  ${w.name}`)
}

const orders = await crm('remote_orders')
const orderCount = Array.isArray(orders.body?.response) ? orders.body.response.length : `error (${orders.status})`
console.log(`\nremote_orders visible: ${orderCount}`)

console.log(
  realShopReadable
    ? `\nVERDICT: this token reaches the REAL SHOP (${REAL_SHOP}). Scope it to the dev warehouse in the\nCRM integration settings ("select the appropriate warehouses to which the API will have access")\nif you want that to be impossible rather than merely guarded in code.`
    : `\nVERDICT: this token cannot read the real shop (${REAL_SHOP}). The boundary is real, not just code.`,
)
