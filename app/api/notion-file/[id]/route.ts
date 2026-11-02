import { NOTION_ARTISTS, NOTION_EVENTS, firstFile, type NotionRow } from '@/lib/notion'

/* Notion signs uploaded-file URLs for ~1 h, so pages link here instead and we
   redirect to a freshly signed URL. Only the «Фото» of rows in our two databases. */

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = process.env.NOTION_TOKEN
  if (!token || !UUID.test(id)) return new Response(null, { status: 404 })

  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2025-09-03' },
    cache: 'no-store',
  })
  if (!res.ok) return new Response(null, { status: 404 })
  const page = (await res.json()) as { parent?: { data_source_id?: string }; properties: NotionRow }
  const source = page.parent?.data_source_id
  if (!source || (source !== NOTION_EVENTS && source !== NOTION_ARTISTS)) return new Response(null, { status: 404 })

  const url = firstFile(page.properties['Фото'])
  if (!url) return new Response(null, { status: 404 })
  // Cache the redirect until 5 min before the signature runs out.
  const expiry = Date.parse(page.properties['Фото']?.files?.[0]?.file?.expiry_time ?? '')
  const seconds = Number.isNaN(expiry) ? 600 : Math.max(0, Math.floor((expiry - Date.now()) / 1000) - 300)
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': `public, max-age=${seconds}, s-maxage=${seconds}` },
  })
}
