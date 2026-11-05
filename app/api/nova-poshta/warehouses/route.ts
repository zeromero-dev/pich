import { listWarehouses } from '@/lib/nova-poshta'
import { badLookup, isRef, lookupResponse, queryParam } from '@/lib/nova-poshta/http'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const settlement = params.get('settlement')
  const kind = params.get('kind')
  const q = queryParam(params)
  if (!isRef(settlement) || (kind !== 'branch' && kind !== 'locker') || q === null) return badLookup()
  return lookupResponse(() => listWarehouses(settlement, kind, q))
}
