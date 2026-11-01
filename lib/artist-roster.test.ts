// Run: npm test. Plain asserts over the pure roster/sync logic; exits non-zero on the first failure.
import assert from 'node:assert/strict'
import type { Artist, Product } from '@/lib/data'
import { type Profile, homepageArtists, mergeRoster, movedArtist, planSync, withArtistNames } from '@/lib/artist-roster'

// CRM artists' id and slug are both the brand id.
const crmArtist = (id: string, name: string, workCount = 1): Artist => ({ id, slug: id, name, workCount, cover: null })
const profile = (p: Partial<Profile> & { name: string; slug: string }): Profile => ({ notionId: '', hidden: false, featured: false, ...p })
const byId = (...ps: Profile[]) => Object.fromEntries(ps.map((p) => [p.slug, p]))

// mergeRoster: Notion name wins, unticked «Показати» hides, Notion-only rows join with no works under their Notion ID.
const roster = mergeRoster(
  [crmArtist('1', 'Зборовська Анна', 3), crmArtist('2', 'Hidden', 5), crmArtist('3', 'Без рядка', 1)],
  byId(
    profile({ slug: '1', notionId: 'ar-1', name: 'Анна Зборовська', bio: 'Біо', instagram: 'https://instagram.com/anna', website: 'https://anna.ua' }),
    profile({ slug: '2', notionId: 'ar-2', name: 'Hidden', hidden: true }),
    profile({ slug: 'ar-9', notionId: 'ar-9', name: 'Лише в Notion' }),
  ),
)
assert.deepEqual(roster.map((a) => [a.slug, a.name, a.workCount]), [['1', 'Анна Зборовська', 3], ['3', 'Без рядка', 1], ['ar-9', 'Лише в Notion', 0]])
assert.equal(roster[0].instagram, 'https://instagram.com/anna')
assert.equal(roster[0].website, 'https://anna.ua')

// movedArtist: a Notion-ID address redirects once the row has a CRM ID; current addresses don't.
const moved = byId(profile({ slug: '56150', notionId: 'ar-7', name: 'A' }), profile({ slug: 'ar-8', notionId: 'ar-8', name: 'B' }))
assert.equal(movedArtist('ar-7', moved), '56150')
assert.equal(movedArtist('ar-8', moved), undefined)
assert.equal(movedArtist('56150', moved), undefined)

// withArtistNames: renamed by Notion; a hidden artist keeps the credit but loses the link.
const work = (artistId: string) => ({ artistId, artistSlug: artistId, artist: 'CRM name' }) as Product
const [renamed, hidden, untouched] = withArtistNames(
  [work('1'), work('2'), work('7')],
  byId(profile({ slug: '1', name: 'Анна Зборовська' }), profile({ slug: '2', name: 'Hidden', hidden: true })),
)
assert.equal(renamed.artist, 'Анна Зборовська')
assert.equal(renamed.artistSlug, '1')
assert.equal(hidden.artistSlug, null)
assert.equal(hidden.artist, 'Hidden')
assert.equal(untouched.artist, 'CRM name')

// homepageArtists: ticked «На головній» only; none ticked → the roster's top.
const three = [crmArtist('1', 'A'), crmArtist('2', 'B'), crmArtist('3', 'C')]
assert.deepEqual(homepageArtists(three, byId(profile({ slug: '3', name: 'C', featured: true }))).map((a) => a.id), ['3'])
assert.deepEqual(homepageArtists(three, {}, 2).map((a) => a.id), ['1', '2'])

// planSync: by CRM ID → nothing, even if the name differs (the name is the manager's);
// a hand-added row is claimed by name (loose spelling) → fill CRM ID; unknown → create ticked.
const changes = planSync(
  [crmArtist('10', 'DEV'), crmArtist('11', 'New Name'), crmArtist('12', 'Анна Зборовська'), crmArtist('13', 'Fresh')],
  [
    { pageId: 'p10', name: '[ТЕСТ] DEV', crmId: '10' },
    { pageId: 'p11', name: 'Old Name', crmId: '11' },
    { pageId: 'p12', name: 'анна  зборовська', crmId: '' },
  ],
)
assert.deepEqual(changes, [
  { pageId: 'p12', set: { 'CRM ID': '12' } },
  { create: { 'Імʼя': 'Fresh', 'CRM ID': '13', 'Показати': true } },
])

console.log('artist-roster: all checks passed')
