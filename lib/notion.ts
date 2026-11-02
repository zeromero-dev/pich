import 'server-only'

/* Data source ids (not database ids): database ••• → Manage data sources → Copy ID.
   A duplicated page gets new ids; the NOTION_TOKEN integration must be added to it. */
export const NOTION_EVENTS = process.env.NOTION_EVENTS_DATA_SOURCE
export const NOTION_ARTISTS = process.env.NOTION_ARTISTS_DATA_SOURCE

const REVALIDATE = 300
/** Cache tag on every Notion read; «Оновити сайт» expires it. */
export const NOTION_TAG = 'notion'

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Notion-Version': '2025-09-03',
  'Content-Type': 'application/json',
})

type Prop = {
  type: string
  title?: { plain_text: string }[]
  rich_text?: { plain_text: string }[]
  date?: { start: string; end: string | null } | null
  files?: { file?: { url: string; expiry_time?: string }; external?: { url: string } }[]
  checkbox?: boolean
  url?: string | null
  unique_id?: { prefix: string | null; number: number | null } | null
}
export type NotionRow = Record<string, Prop>

export type NotionPage = { id: string; properties: NotionRow }

/** All rows' properties, or null when the token or id is unset. Throws on a bad response — ISR keeps the last good page. */
export async function queryNotion(dataSource: string | undefined, fresh = false): Promise<NotionRow[] | null> {
  return (await queryNotionPages(dataSource, fresh))?.map((p) => p.properties) ?? null
}

/** Same, with page ids, for writers. */
export async function queryNotionPages(dataSource: string | undefined, fresh = false): Promise<NotionPage[] | null> {
  const token = process.env.NOTION_TOKEN
  if (!token || !dataSource) {
    console.warn('[notion] NOTION_TOKEN or a NOTION_*_DATA_SOURCE is not set — showing no Notion content')
    return null
  }
  const rows: NotionPage[] = []
  let cursor: string | undefined
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSource}/query`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      // Uncached in dev so a Notion edit shows on the next reload; `fresh` for writers that must not see stale rows.
      ...(fresh || process.env.NODE_ENV === 'development'
        ? { cache: 'no-store' as const }
        : { cache: 'force-cache' as const, next: { revalidate: REVALIDATE, tags: [NOTION_TAG] } }),
    })
    if (!res.ok) throw new Error(`[notion] ${dataSource} responded ${res.status}: ${await res.text()}`)
    const page = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null }
    rows.push(...page.results.map(({ id, properties }) => ({ id, properties })))
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined
  } while (cursor)
  return rows
}

export function text(prop: Prop | undefined): string {
  return (prop?.title ?? prop?.rich_text ?? []).map((t) => t.plain_text).join('').trim()
}

/** A Notion «ID» (auto-numbered, never reused) as a URL segment: "ar-7", or "12" without a prefix. */
export function uniqueId(prop: Prop | undefined): string {
  const id = prop?.unique_id
  if (!id?.number) return ''
  return id.prefix ? `${id.prefix.toLowerCase()}-${id.number}` : String(id.number)
}

export function firstFile(prop: Prop | undefined): string {
  const f = prop?.files?.[0]
  return f?.file?.url ?? f?.external?.url ?? ''
}

/** A row's «Фото» for the page. Notion-uploaded files are signed for ~1 h, so they go
    through /api/notion-file, which re-signs on each (CDN-cached) request. */
export function photoOf(page: NotionPage): string {
  const f = page.properties['Фото']?.files?.[0]
  if (f?.file) return `/api/notion-file/${page.id}`
  return f?.external?.url ?? ''
}

/** Creates a row (`dataSource`) or updates one (`pageId`): text and checkbox properties only.
    Needs the integration's "Insert content" and "Update content" capabilities. */
export async function saveNotionRow(
  target: { dataSource: string | undefined } | { pageId: string },
  props: Record<string, string | boolean>,
  titleProp: string,
) {
  const token = process.env.NOTION_TOKEN
  const dataSource = 'dataSource' in target ? target.dataSource : undefined
  if (!token || ('dataSource' in target && !dataSource)) throw new Error('[notion] NOTION_TOKEN or the data source id is not set')
  const content = (value: string) => [{ type: 'text', text: { content: value } }]
  const properties = Object.fromEntries(
    Object.entries(props).map(([k, v]) => [
      k,
      typeof v === 'boolean' ? { checkbox: v } : k === titleProp ? { title: content(v) } : { rich_text: content(v) },
    ]),
  )
  const [url, method, body] =
    'pageId' in target
      ? [`https://api.notion.com/v1/pages/${target.pageId}`, 'PATCH', { properties }]
      : ['https://api.notion.com/v1/pages', 'POST', { parent: { type: 'data_source_id', data_source_id: dataSource }, properties }]
  // A 429 means Notion did nothing, so retrying can't duplicate the row.
  for (let attempt = 1; ; attempt++) {
    // react-doctor-disable-next-line async-await-in-loop
    const res = await fetch(url, { method, headers: headers(token), body: JSON.stringify(body), cache: 'no-store' })
    if (res.ok) return
    if (res.status !== 429 || attempt === 3) {
      throw new Error(`[notion] ${method} row responded ${res.status}: ${await res.text()}`)
    }
    const waitS = Number(res.headers.get('retry-after')) || 1
    // react-doctor-disable-next-line async-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, waitS * 1000))
  }
}
