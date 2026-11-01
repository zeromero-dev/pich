import type { Artist, Product } from '@/lib/data'
import { slugBase } from '@/lib/slug'

/* Pure roster logic — no fetching, no server-only — so lib/artist-roster.test.ts can run it. */

/** One «Митці» row as the site uses it. */
export type Profile = {
  name: string
  /** URL segment and join key: the CRM brand id, else the row's Notion «ID» ("ar-7"). */
  slug: string
  /** The row's Notion «ID», kept so an old /artists/ar-7 link can redirect once a CRM ID is filled. */
  notionId: string
  hidden: boolean
  featured: boolean
  instagram?: string
  website?: string
  portrait?: string
  bio?: string
}

/** CRM artists, then Notion-only ones; most works first, then by name. Name: Notion «Імʼя», else CRM brand (no row yet); an unticked «Показати» drops the artist. */
export function mergeRoster(fromCrm: Artist[], profiles: Record<string, Profile>): Artist[] {
  const known = new Set(fromCrm.map((a) => a.id))
  const notionOnly: Artist[] = Object.values(profiles)
    .filter((p) => !known.has(p.slug))
    .map((p) => ({ id: p.slug, slug: p.slug, name: p.name, workCount: 0, cover: null }))
  return [...fromCrm, ...notionOnly]
    .filter((a) => !profiles[a.id]?.hidden)
    .map((a) => {
      const p = profiles[a.id]
      if (!p) return a
      return {
        ...a,
        name: p.name,
        ...(p.portrait ? { portrait: p.portrait } : {}),
        ...(p.bio ? { bio: p.bio } : {}),
        ...(p.instagram ? { instagram: p.instagram } : {}),
        ...(p.website ? { website: p.website } : {}),
      }
    })
    .sort((a, b) => b.workCount - a.workCount || a.name.localeCompare(b.name, 'uk'))
}

/** Where an outdated /artists/<notionId> address now lives, once the row got a CRM ID. */
export function movedArtist(slug: string, profiles: Record<string, Profile>): string | undefined {
  const p = Object.values(profiles).find((p) => p.notionId === slug)
  return p && p.slug !== slug ? p.slug : undefined
}

/** Works carry the artist's name too (cards, cart, search, product page) — keep it the same as on the artist page.
    A hidden artist's works stay on sale, credited without a link to the (404) artist page. */
export function withArtistNames(products: Product[], profiles: Record<string, Profile>): Product[] {
  return products.map((p) => {
    const profile = p.artistId ? profiles[p.artistId] : undefined
    if (!profile) return p
    return { ...p, artist: profile.name, ...(profile.hidden ? { artistSlug: null } : {}) }
  })
}

/** «На головній» picks the homepage artists; with none ticked, the roster's top ones. */
export function homepageArtists(roster: Artist[], profiles: Record<string, Profile>, max = 16): Artist[] {
  const picked = roster.filter((a) => profiles[a.id]?.featured)
  return (picked.length ? picked : roster).slice(0, max)
}

export type SyncRow = { pageId: string; name: string; crmId: string }
export type SyncChange =
  | { create: { 'Імʼя': string; 'CRM ID': string; 'Показати': true } }
  | { pageId: string; set: { 'CRM ID': string } }

/** What the CRM → «Митці» sync must write: a row for each CRM artist without one, and a missing CRM ID.
    A hand-added row (no CRM ID yet) is claimed by the CRM artist with the same name, spelled loosely.
    «Імʼя» is copied once at creation and is the manager's after that. */
export function planSync(artists: Artist[], rows: SyncRow[]): SyncChange[] {
  const byId = new Map(rows.filter((r) => r.crmId).map((r) => [r.crmId, r]))
  const byName = new Map(rows.filter((r) => !r.crmId && r.name).map((r) => [slugBase(r.name), r]))
  const changes: SyncChange[] = []
  for (const artist of artists) {
    const row = byId.get(artist.id) ?? byName.get(slugBase(artist.name))
    if (!row) changes.push({ create: { 'Імʼя': artist.name, 'CRM ID': artist.id, 'Показати': true } })
    else if (row.crmId !== artist.id) changes.push({ pageId: row.pageId, set: { 'CRM ID': artist.id } })
  }
  return changes
}
