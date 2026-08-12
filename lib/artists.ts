import { artistProfiles, type Artist } from '@/lib/data'

/**
 * Layers repo-authored bio/portrait onto a CRM-derived artist. The join is by
 * slug rather than display name — a rename in the CRM changes the slug, which
 * is loud (a 404) rather than silent (an orphaned bio).
 */
export function withProfiles(artist: Artist): Artist {
  const profile = artistProfiles[artist.slug]
  return profile ? { ...artist, ...profile } : artist
}
