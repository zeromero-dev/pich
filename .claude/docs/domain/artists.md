# Artists & Content

Who the artists are and what the center says about itself.

HugeProfit supplies artists with works through the catalog's brands. The Notion «Митці» database on the private «Сайт» page supplies display names, portraits, bios, links, and publication flags. It also supports artists without works.

## Model (from the code — `Artist` in `lib/data.ts`)

```
Artist {
  id          CRM brand id, or the Notion-derived slug for a Notion-only artist
  slug        the URL segment, equal to id: /artists/<CRM brand id>, or /artists/ar-7 (Notion «ID») for a row with no CRM brand
  name        Notion «Імʼя» when a profile exists, otherwise CRM brand name
  workCount   works currently in the shop
  cover       first image of one of their works (roster thumbnail fallback)
  portrait?   Notion «Фото»
  bio?        Notion «Біо»
}
```

Works without a brand appear in the shop without an artist page link.

## Business rules

1. **The roster merges CRM brands and Notion profiles.** `rosterOf()` in `lib/artists.ts` includes CRM brands with catalog works and published Notion-only profiles. It sorts by work count, then by name. A new CRM brand can appear before it has a Notion row.
2. **Notion profiles control publication.** A row with «Показати» unchecked keeps the artist off the roster, homepage, and sitemap. The artist page returns 404. The works stay in the shop with an unlinked name. Rows created by «Оновити сайт» start checked. Check the box when publishing a row added by hand.
3. **Names, photos, bios, and links come from Notion for matched artists.** The English site uses «Імʼя (EN)» and «Біо (EN)» when filled. The English name is also searchable. «Instagram» and «Сайт» accept HTTP(S) links. «Нотатки» is private. «На головній» picks up to 16 artists for the homepage, with the roster order as fallback.
4. **CRM sync runs on demand.** The Notion «Оновити сайт» link calls `/api/update-site`. `planSync()` in `lib/artist-roster.ts` adds missing CRM artists or fills «CRM ID» on a matching hand-added row. It matches by CRM ID first, then by normalized name for rows without an ID. The manager can keep editing the display name in Notion. Sync preserves existing rows and content. It reports possible duplicate names and requires the integration's Insert and Update content capabilities.
5. **Artist URLs use IDs.** A CRM artist uses `/artists/<CRM ID>`. A Notion-only artist uses the Notion «ID», for example `/artists/ar-7`. Renaming an artist preserves the URL. After sync fills a new CRM ID, the former Notion URL redirects to the CRM URL. The portrait, or a work image as fallback, is used for the share card. The bio supplies its description when available.

## Use cases

- Present the center (about page: mission, space, invitation to visit).
- **Browse all artists** (`/artists`) — roster grid with a portrait or a work thumbnail where available.
- **One artist** (`/artists/[slug]`) — bio if written, and all of their works.
- Products link to a published artist page when one exists.

## Known data problems (owners' to fix, not code)

- **«Юля Гушул» and «Юлія Гушул» are the same person** entered twice, so they are two artists with split work.
- Four names are entered surname-first («Зборовська Анна», «Короткевич Софія», «Малова Ольга», «Тітова Олександра») against firstname-first for the other 49.
- 22 works have no brand at all.

Normalising any of these in code would mean guessing at people's names — it belongs in the CRM.

## Open decisions

- Who gets a written bio and portrait, and who writes them?
- Sort the roster alphabetically instead of by work count once bios exist?
