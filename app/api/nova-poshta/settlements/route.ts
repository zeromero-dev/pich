import { searchSettlements } from '@/lib/nova-poshta'
import { badLookup, lookupResponse, queryParam } from '@/lib/nova-poshta/http'

export async function GET(request: Request) {
  const q = queryParam(new URL(request.url).searchParams)
  if (q === null || q.length < 2) return badLookup()
  return lookupResponse(() => searchSettlements(q))
}
