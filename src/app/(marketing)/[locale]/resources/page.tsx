import type { Metadata } from 'next'
import { pageAlternates } from '@/lib/alternates'
import ResourcesContent from './content'

interface Props { params: { locale: string } }

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: 'Resources — Public Data Maps',
    description: 'Video tutorials and guides to help you get the most out of Public Data Maps.',
    alternates: pageAlternates(params.locale, '/resources'),
  }
}

export default function ResourcesPage() {
  return <ResourcesContent />
}
