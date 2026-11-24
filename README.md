# Plai Pich

Next.js storefront and arts centre website for [pich.co.ua](https://www.pich.co.ua). HugeProfit supplies the catalog, stock, and orders. Notion supplies events and artist profiles. Checkout uses plata by mono. The site uses Inter, loaded with `next/font`.

## Work locally

Copy `.env.example` to `.env.local` and fill in the development values. Use warehouse `51630` and a Mono test token for payment work.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Run `npm test` and `npm run lint` to verify changes. See [CLAUDE.md](CLAUDE.md) for the full build and configuration commands.

## Store operations

- [Domain docs](.claude/docs/domain/README.md) cover catalog, cart, checkout, events, and artists.
- [Mono production cutover](.claude/docs/plans/2026-11-18-plata-by-mono-cutover.md) covers the Vercel Production variables, live payment and refund verification, and rollback.
- The private Notion «Сайт» page holds the publishing instructions and payment reconciliation procedure for the shop team.
