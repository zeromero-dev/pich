import { timingSafeEqual } from 'node:crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import { type SyncRow, planSync } from '@/lib/artist-roster'
import { notionRows, isDraft, toEvents } from '@/lib/events'
import { artistsOf, getCatalog } from '@/lib/hugeprofit'
import { CRM_TAG } from '@/lib/hugeprofit/client'
import { NOTION_ARTISTS, NOTION_EVENTS, NOTION_TAG, type NotionPage, queryNotionPages, saveNotionRow, text } from '@/lib/notion'

/* «Оновити сайт»: opened from the Notion page link (?key=SYNC_KEY) and daily by
   Vercel Cron (Bearer CRON_SECRET). Syncs CRM artists into «Митці» (add rows, fill
   CRM ID — never edits names, never deletes), expires the site's caches so edits
   show at once, and answers with what the manager should fix. Safe to run twice. */

export const maxDuration = 60

const COOLDOWN_MS = 60_000
const MAX_PHOTO_BYTES = 2 * 1024 * 1024
// ponytail: per-instance memory, so parallel serverless instances each get one call a minute; enough to stop hammering.
let lastRun = 0

function same(given: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const reply = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

/** Size of a Notion-uploaded photo, via a one-byte range request (Content-Range: bytes 0-0/<total>). */
async function photoBytes(page: NotionPage): Promise<number> {
  const url = page.properties['Фото']?.files?.[0]?.file?.url
  if (!url) return 0
  const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' }).catch(() => null)
  return Number(res?.headers.get('content-range')?.split('/')[1]) || 0
}

/** «Митці» rows → CRM sync, one row at a time; saveNotionRow waits out 429s. Returns the report line. */
async function syncArtists(pages: NotionPage[]): Promise<{ line: string; failed: boolean }> {
  const rows: SyncRow[] = pages.map((p) => ({
    pageId: p.id,
    name: text(p.properties['Імʼя']),
    crmId: text(p.properties['CRM ID']),
  }))
  const changes = planSync(artistsOf(await getCatalog(true)), rows)
  let done = 0
  for (const change of changes) {
    try {
      // react-doctor-disable-next-line async-await-in-loop
      await ('create' in change
        ? saveNotionRow({ dataSource: NOTION_ARTISTS }, change.create, 'Імʼя')
        : saveNotionRow({ pageId: change.pageId }, change.set, 'Імʼя'))
      done++
    } catch (error) {
      console.error('[update-site]', error)
      return { line: `Митці: оновлено ${done} з ${changes.length}, далі сталася помилка. Відкрийте посилання ще раз за хвилину.`, failed: true }
    }
  }
  const added = changes.filter((c) => 'create' in c).length
  return {
    line: changes.length ? `Митці: додано нових ${added}, оновлено ${changes.length - added}.` : 'Митці: нових у CRM немає.',
    failed: false,
  }
}

export async function GET(request: Request) {
  const allowed =
    same(new URL(request.url).searchParams.get('key'), process.env.SYNC_KEY) ||
    same(request.headers.get('authorization'), process.env.CRON_SECRET && `Bearer ${process.env.CRON_SECRET}`)
  if (!allowed) return reply('Доступ заборонено.', 403)

  const wait = lastRun + COOLDOWN_MS - Date.now()
  if (wait > 0) return reply(`Оновлення щойно було. Спробуйте за ${Math.ceil(wait / 1000)} с.`, 429)
  lastRun = Date.now()

  const [artistPages, eventPages] = await Promise.all([
    queryNotionPages(NOTION_ARTISTS, true),
    queryNotionPages(NOTION_EVENTS, true),
  ])
  if (!artistPages || !eventPages) return reply('Сайт не підключений до Notion (NOTION_TOKEN / NOTION_*_DATA_SOURCE).', 500)

  const sync = await syncArtists(artistPages)

  const problems: string[] = []
  const published = toEvents(notionRows(eventPages), problems).length
  const drafts = eventPages.filter(isDraft).length

  for (const page of artistPages) {
    const name = text(page.properties['Імʼя'])
    if (!name) {
      problems.push('У «Митцях» є рядок без Імʼя — його не видно на сайті.')
      continue
    }
    for (const column of ['Instagram', 'Сайт']) {
      const url = page.properties[column]?.url
      if (url && !/^https?:\/\//i.test(url)) problems.push(`Митець «${name}»: ${column} має починатися з https://`)
    }
  }

  const sizes = await Promise.all([...artistPages, ...eventPages].map(async (page) => ({ page, bytes: await photoBytes(page) })))
  for (const { page, bytes } of sizes) {
    if (bytes <= MAX_PHOTO_BYTES) continue
    const name = text(page.properties['Імʼя']) || text(page.properties['Назва'])
    problems.push(`Фото «${name}» важить ${(bytes / 1024 / 1024).toFixed(1)} МБ — стисніть до 2 МБ, інакше сторінка вантажиться повільно.`)
  }

  // Expire, don't just mark stale: the manager reloads right after and must see her edit.
  revalidateTag(NOTION_TAG, { expire: 0 })
  revalidateTag(CRM_TAG, { expire: 0 })
  revalidatePath('/', 'layout')

  const report = [
    'Сайт оновлено — зміни вже видно.',
    sync.line,
    `Події: на сайті ${published}, чернеток ${drafts}.`,
    problems.length ? `\nЩо варто виправити:\n${problems.map((p) => `• ${p}`).join('\n')}` : '\nПроблем не знайдено.',
    '\nВкладку можна закрити.',
  ]
  return reply(report.join('\n'), sync.failed ? 502 : 200)
}
