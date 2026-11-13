// Run: npm test. Plain asserts over the pure catalog-feed logic.
import assert from 'node:assert/strict'
import type { Product } from '@/lib/data'
import { buildFeed, feedItemsOf } from '@/lib/meta/feed'

const product = (p: Partial<Product> = {}): Product => ({
  id: '9527902', slug: '9527902', name: 'Чашка', artist: null, artistId: null, artistSlug: null,
  price: 1200, categories: [], available: 1, inStock: true, isLast: true,
  images: ['https://crm.h-profit.com/a.jpg'], description: 'Опис', size: null, sku: null, ...p,
})

for (const description of [null, '', '  \n ']) assert.deepEqual(feedItemsOf([product({ description })]), [])
assert.deepEqual(feedItemsOf([product({ images: [] })]), [])
assert.deepEqual(feedItemsOf([product({ price: 0 })]), [])
assert.equal(feedItemsOf([product({ inStock: false, available: 0 })]).length, 1)

const xml = buildFeed([product({
  name: 'Чашка «A & B» <1>',
  description: 'Рядок 1\nРядок 2 & "лапки"',
  images: ['https://crm.h-profit.com/a.jpg', 'https://crm.h-profit.com/b.jpg'],
})], 'https://www.pich.co.ua')
assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>'))
for (const s of [
  'xmlns:g="http://base.google.com/ns/1.0"',
  '<g:id>9527902</g:id>',
  '<g:title>Чашка «A &amp; B» &lt;1&gt;</g:title>',
  '&amp; &quot;лапки&quot;',
  '<g:price>1200.00 UAH</g:price>',
  '<g:availability>in stock</g:availability>',
  '<g:condition>new</g:condition>',
  '<g:link>https://www.pich.co.ua/shop/9527902</g:link>',
  '<g:image_link>https://crm.h-profit.com/a.jpg</g:image_link>',
  '<additional_image_link>https://crm.h-profit.com/b.jpg</additional_image_link>',
  '<g:brand>Plai Pich</g:brand>',
]) assert.ok(xml.includes(s), s)
assert.ok(!xml.includes('net_price'))
assert.ok(xml.split('\n').every((l) => l.length < 5_000_000))

const sold = buildFeed([product({ inStock: false, artist: 'Михайло Діденко' })], 'https://x.ua')
assert.ok(sold.includes('<g:availability>out of stock</g:availability>'))
assert.ok(sold.includes('<g:brand>Михайло Діденко</g:brand>'))
