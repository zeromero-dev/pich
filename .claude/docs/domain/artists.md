# Artists & Content

Who the artists are and what the center says about itself. Source of truth: **this repo** — content-as-code, edited via commits. Decided 2026-08-06: no CMS, no CRM involvement for artist/about content.

## Model (from the code — `Artist` in `lib/data.ts`)

```
Artist {
  id, slug
  name        display name — also the join key to Catalog (see rule 2)
  portrait?   optional; absence renders a monochrome initials placeholder
  bio         single-language (Ukrainian), same policy as catalog content
}
```

## Business rules

1. **Editing artist/about content is a code change.** This is deliberate — artist rosters at the center change rarely, and it keeps the no-database constraint intact. If the owners ever need self-service editing, that's a new architectural decision, not a patch.
2. **The Catalog↔Artist link is an exact string match** on the display name (`work.artist === artist.name`, `productsByArtist()` in `lib/data.ts`). This is the weakest joint in the domain: a typo or a rename on either side silently orphans works — no error, they just stop appearing under the artist. After CRM wiring the catalog side of the name comes from the CRM (`brand.name`, assumed — [catalog.md](catalog.md)), so the repo's artist names must mirror CRM brand names exactly.
3. An artist with zero matched works is valid (their "selected works" section simply doesn't render) — new artists may exhibit before anything is for sale.

## Use cases

- Present the center (about page: mission, space, invitation to visit).
- Present each artist: portrait, bio, up to 3 selected works linking into the shop.

## Open decisions

- Make the Catalog↔Artist join robust once live CRM data exists — e.g. match on a CRM brand `id` stored on the Artist instead of the name string. Revisit during `lib/hugeprofit/` wiring.
- Per-artist pages (`/artists/[slug]`)? Slugs exist in the model but only the list page is built. Add when an artist has enough content to warrant it.
