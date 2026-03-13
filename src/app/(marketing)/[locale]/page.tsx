import type { Metadata } from 'next'
import { pageAlternates } from '@/lib/alternates'
import HomeContent from './content'

interface Props { params: { locale: string } }

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: 'Public Data Maps — Explore French Company Data on a Map',
    description:
      'Draw an area on the map and instantly find every registered company inside it. Powered by the official INSEE SIRENE dataset.',
    alternates: pageAlternates(params.locale, '/'),
  }
}

export default function HomePage() {
  return <HomeContent />
}
