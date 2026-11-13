import { getCatalog } from '@/lib/hugeprofit'
import { buildFeed } from '@/lib/meta/feed'
import { WEBSITE_URL } from '@/lib/site'

export async function GET() {
  return new Response(buildFeed(await getCatalog(), WEBSITE_URL), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
