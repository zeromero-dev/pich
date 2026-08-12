# Artists & Content

Who the artists are and what the center says about itself.

**Split source of truth, changed 2026-08-12.** The *roster* is derived from the CRM — every brand that has a work in the shop is an artist. The *bios and portraits* remain content-as-code in this repo. Before this change `lib/data.ts` held three invented artists with invented biographies; they were removed, because publishing fictional people as exhibiting artists is a claim about real people's colleagues.

## Model (from the code — `Artist` in `lib/data.ts`)

```
Artist {
  id          CRM brand id
  slug        transliterated name — the URL and the join key for bios
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
2. **Bios are a code change.** `artistProfiles` in `lib/data.ts`, keyed by artist slug, layered on by `withProfiles()` in `lib/artists.ts`. It is empty today — an artist with no entry still gets a roster card and a page listing their works, just no prose.
3. **The join is by slug, not display name.** A CRM rename changes the slug, which orphans a bio *loudly* (its key stops matching, the page is still fine) rather than silently. This replaces the old exact-name join, which was the weakest joint in the domain.
4. An artist with zero works simply does not exist in the roster — there is nothing to derive them from.

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
