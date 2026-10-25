import type { Metadata } from 'next'
import { dictionaries } from '@/lib/i18n'
import { CollaborationView } from '@/components/collaboration-view'

export const metadata: Metadata = {
  title: dictionaries.uk.collaboration.title,
  description: dictionaries.uk.collaboration.lead,
}

export default function CollaborationPage() {
  return <CollaborationView />
}
