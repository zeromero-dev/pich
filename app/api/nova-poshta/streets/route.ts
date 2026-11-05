import { searchStreets } from '@/lib/nova-poshta'
import { badLookup, isRef, lookupResponse, queryParam } from '@/lib/nova-poshta/http'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const settlement = params.get('settlement')
  const q = queryParam(params)
  if (!isRef(settlement) || q === null || q.length < 2) return badLookup()
  return lookupResponse(() => searchStreets(settlement, q))
}
