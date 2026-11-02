import 'server-only'

import type { Artist, Product } from '@/lib/data'
import { type Profile, mergeRoster } from '@/lib/artist-roster'
import { artistsOf } from '@/lib/hugeprofit'
import { NOTION_ARTISTS, photoOf, queryNotionPages, text, uniqueId } from '@/lib/notion'

export { homepageArtists, movedArtist, withArtistNames } from '@/lib/artist-roster'

/** Only web links: the columns are typed by hand and land in an href. */
const webLink = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url) ? url : '')

/** Rows of the Notion «Митці» database, keyed by their URL slug (CRM ID, else Notion «ID»). */
export async function getArtistProfiles(): Promise<Record<string, Profile>> {
  const pages = (await queryNotionPages(NOTION_ARTISTS)) ?? []
  const profiles: Record<string, Profile> = {}
  for (const page of pages) {
    const row = page.properties
    const name = text(row['Імʼя'])
    if (!name) continue
    const notionId = uniqueId(row['ID'])
    const slug = text(row['CRM ID']) || notionId
    if (!slug) continue
    const portrait = photoOf(page)
    const bio = text(row['Біо'])
    const bioEn = text(row['Біо (EN)'])
    const nameEn = text(row['Імʼя (EN)'])
    const instagram = webLink(row['Instagram']?.url)
    const website = webLink(row['Сайт']?.url)
    profiles[slug] = {
      name,
      ...(nameEn ? { nameEn } : {}),
      slug,
      notionId,
      hidden: row['Показати']?.checkbox !== true,
      featured: row['На головній']?.checkbox === true,
      ...(instagram ? { instagram } : {}),
      ...(website ? { website } : {}),
      ...(portrait ? { portrait } : {}),
      ...(bio ? { bio } : {}),
      ...(bioEn ? { bioEn } : {}),
    }
  }
  return profiles
}

export function rosterOf(products: Product[], profiles: Record<string, Profile>): Artist[] {
  return mergeRoster(artistsOf(products), profiles)
}
