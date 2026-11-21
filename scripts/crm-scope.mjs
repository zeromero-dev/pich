// Reports what HUGEPROFIT_API_KEY can actually reach. Run it after re-scoping
// the token in the CRM's integration settings — code gates cannot narrow a
// token, only the CRM can. Reads only; writes nothing.
//
//   node scripts/crm-scope.mjs
import { readFileSync } from 'node:fs'

// Production can supply both variables in the process without changing .env.local.
const usesProcessEnv = process.env.HUGEPROFIT_API_KEY !== undefined || process.env.CRM_WAREHOUSE_ID !== undefined
const env = usesProcessEnv ? process.env : Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).split('#')[0].trim()]),
)

const token = env.HUGEPROFIT_API_KEY
if (!token) throw new Error('HUGEPROFIT_API_KEY is required')

const configured = Number(env.CRM_WAREHOUSE_ID)
if (!Number.isSafeInteger(configured) || configured <= 0) {
  throw new Error('CRM_WAREHOUSE_ID must be a positive integer')
}

async function crm(path) {
  const res = await fetch(`https://crm.h-profit.com/bapi/${path}`, {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  const body = res.ok ? await res.json().catch(() => null) : null
  return { status: res.status, body }
}

const ref = await crm('reference_info?types=warehouses')
const warehouses = new Map([[configured, 'configured warehouse']])
const listed = ref.body?.data?.warehouses
if (Array.isArray(listed) && listed.length > 0) {
  for (const warehouse of listed) {
    const id = Number(warehouse?.id)
    if (Number.isSafeInteger(id) && id > 0) warehouses.set(id, warehouse.name)
  }
} else {
  console.log(`reference_info returned no warehouses (status ${ref.status}) — token may be scoped or invalid`)
}

console.log('products readable per warehouse:')
const reachable = new Set()
for (const [id, name] of warehouses) {
  const { status, body } = await crm(`products?limit=500&warehouse_id=${id}`)
  const data = body?.success !== false && Array.isArray(body?.data) ? body.data : null
  if (data?.length > 0) reachable.add(id)
  console.log(`  ${id}  ${data ? data.length : `error (${status})`} rows  ${name}${id === configured ? '   <-- CRM_WAREHOUSE_ID' : ''}`)
}

if (!reachable.has(configured)) {
  console.error(`\nCould not verify product access in CRM_WAREHOUSE_ID=${configured}. Check the token, warehouse, and catalog.`)
  process.exitCode = 1
} else {
  console.log(`\nVerified product access in CRM_WAREHOUSE_ID=${configured}. Confirm the reservation warehouse in the CRM integration settings.`)
  reachable.delete(configured)
  if (reachable.size > 0) console.log(`Also read products in ${[...reachable].join(', ')}.`)
}
