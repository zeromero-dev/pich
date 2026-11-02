# Artists & Content

Who the artists are and what the center says about itself.

**Split source of truth, changed 2026-08-12.** The *roster* is derived from the CRM — every brand that has a work in the shop is an artist. The *bios and portraits* remain content-as-code in this repo. Before this change `lib/data.ts` held three invented artists with invented biographies; they were removed, because publishing fictional people as exhibiting artists is a claim about real people's colleagues.

## Model (from the code — `Artist` in `lib/data.ts`)

```
Artist {
  id          CRM brand id
  slug        the URL segment, equal to id: /artists/<CRM brand id>, or /artists/ar-7 (Notion «ID») for a row with no CRM brand
  name        CRM brand.name
  workCount   works currently in the shop
  cover       first image of one of their works (roster thumbnail fallback)
  portrait?   repo content
  bio?        repo content
}
```

53 artists on the live catalog. 22 works have no brand and so belong to no artist — they appear in the shop but on no artist page.

## Business rules

1. **The roster is whatever the CRM says.** Adding an artist is adding a work with their brand; no code change. `artistsOf()` in `lib/hugeprofit/` builds it, ordered by work count.
2. **Bios live in Notion** (2026-10-30, branch `feat/notion-poc`). The «Митці» database (Імʼя, Імʼя (EN), CRM ID, ID, Фото, Біо, Біо (EN), Instagram, Сайт, Показати, На головній, Нотатки — the last private, never read by the site; «Імʼя (EN)» and «Біо (EN)» are shown in the EN locale — name on artist cards, artist page, work cards, product page and cart (`Product.artistEn`), and EN shop search matches it — falling back to the Ukrainian) is pre-filled with every CRM brand except DEV ones; `getArtistProfiles()` in `lib/artists.ts` reads it and `rosterOf()` / `withArtistNames()` layer it on. **Sync** (`app/api/update-site`, the «Оновити сайт» link, 2026-11-01; pure logic `planSync` in `lib/artist-roster.ts`): runs daily via Vercel Cron (`vercel.json`, 04:00 UTC, Bearer `CRON_SECRET`) and on demand from the link (`?key=SYNC_KEY`), against an uncached CRM read. For every CRM artist with works (`artistsOf(getCatalog())`) it finds the row by «CRM ID» (falling back to the slug of «Імʼя» for hand-added rows without one, which fills the id) and either adds a row (ticked «Показати») or fills a missing CRM ID. «Імʼя» is copied from the CRM once, at creation, and is the manager's after that (2026-11-01: one name column instead of a separate «Імʼя на сайті» override). So a CRM rename keeps the row, photo, bio and the site name; only the URL of an artist with works changes (it comes from the CRM name). It never deletes: a brand with no works keeps its row. Needs the integration's Update content capability. «Instagram» and «Сайт» (URL columns, http(s) only) show as links on the artist page, labelled «Instagram» and the site's host. «На головній» picks the homepage carousel (max 16); none ticked → the 16 with most works (`homepageArtists`).
3. **The name comes from Notion** (2026-11-01): «Імʼя», shown everywhere the artist's name appears — roster, artist page, product cards, product page, cart, search (`withArtistNames` in `lib/artists.ts`). The CRM name is used only for an artist with no row yet.
3b. **«Показати» must be ticked for an artist to show** (2026-11-01; renamed from a «Приховати» checkbox so managers aren't confused by a negative). Unticked or missing: off the roster, homepage and sitemap, `/artists/<slug>` is 404, and their works stay in the shop credited by name without a link (no «more by this artist» block). The sync link creates rows ticked; a row the manager adds by hand starts unticked (Notion's default), so she ticks it to publish.
3a. **Addresses and the join are IDs only** (2026-11-01). An artist is keyed by CRM brand id, or by the row's Notion «ID» (`AR-7` → `ar-7`) when it has no CRM ID; that key is both the URL and the Notion join. Names never shape URLs, so renames in the CRM or Notion can't break links. When the sync fills a CRM ID on a hand-added row (matched by `nameKey`: case, spacing, apostrophes and word order ignored; one row per CRM artist), `/artists/ar-7` 308-redirects to `/artists/<CRM ID>` (`movedArtist`). Pages carry the bio's first ~155 chars as meta description and the portrait (else a work) as OG image. Rows whose names share a `nameKey` (`duplicateNames`) are listed in the «Оновити сайт» report as a likely split artist — e.g. two CRM brands for one person, which only merging the brands in HUGEPROFIT fixes.
4. **Artists with no works still show** (2026-11-01, user's call): every «Митці» row with an Імʼя is an artist. `rosterOf()` in `lib/artists.ts` lists CRM artists first (most works first, CRM name wins), then Notion-only ones by name, with no work count and no «Роботи» heading. Deleting the Notion row removes a work-less artist; an artist with works stays regardless. Since «Митці» was pre-filled with every CRM brand, every brand with a row now has a page, whether or not it has works.

## Use cases

- Present the center (about page: mission, space, invitation to visit).
- **Browse all artists** (`/artists`) — roster grid, work counts, thumbnail from their own work.
- **One artist** (`/artists/[slug]`) — bio if written, and all of their works.
- Every product page links to its artist.

## Known data problems (owners' to fix, not code)

- **«Юля Гушул» and «Юлія Гушул» are the same person** entered twice, so they are two artists with split work.
- Four names are entered surname-first («Зборовська Анна», «Короткевич Софія», «Малова Ольга», «Тітова Олександра») against firstname-first for the other 49.
- 22 works have no brand at all.

Normalising any of these in code would mean guessing at people's names — it belongs in the CRM.

## Open decisions

- Who gets a written bio and portrait, and who writes them?
- Sort the roster alphabetically instead of by work count once bios exist?
