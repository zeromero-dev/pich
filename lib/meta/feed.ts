import type { Product } from '@/lib/data'

// Control characters are illegal in XML 1.0 even escaped.
const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

// Meta rejects items without description, image or price; sold works stay (it hides them from ads).
export const feedItemsOf = (products: Product[]) =>
  products.filter((p) => p.description?.trim() && p.images.length > 0 && p.price > 0)

export function buildFeed(products: Product[], origin: string): string {
  const items = feedItemsOf(products).map((p) =>
    [
      '<item>',
      `<g:id>${esc(p.id)}</g:id>`,
      `<g:title>${esc(p.name)}</g:title>`,
      `<g:description>${esc(p.description!.trim())}</g:description>`,
      `<g:availability>${p.inStock ? 'in stock' : 'out of stock'}</g:availability>`,
      '<g:condition>new</g:condition>',
      `<g:price>${p.price.toFixed(2)} UAH</g:price>`,
      `<g:link>${esc(`${origin}/shop/${p.slug}`)}</g:link>`,
      `<g:image_link>${esc(p.images[0])}</g:image_link>`,
      ...p.images.slice(1).map((u) => `<additional_image_link>${esc(u)}</additional_image_link>`),
      `<g:brand>${esc(p.artist ?? 'Plai Pich')}</g:brand>`,
      '</item>',
    ].join('\n'),
  )
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    '<title>Plai Pich</title>',
    `<link>${esc(origin)}</link>`,
    ...items,
    '</channel>',
    '</rss>',
  ].join('\n')
}
