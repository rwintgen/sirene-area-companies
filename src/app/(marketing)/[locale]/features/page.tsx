import type { Metadata } from 'next'
import { pageAlternates } from '@/lib/alternates'
import FeaturesContent from './content'

interface Props { params: { locale: string } }

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: 'Features — Public Data Maps',
    description: 'Spatial search, AI overviews, advanced filters, exports, and more — everything you need to explore French company data.',
    alternates: pageAlternates(params.locale, '/features'),
  }
}

export default function FeaturesPage() {
  return <FeaturesContent />
}
