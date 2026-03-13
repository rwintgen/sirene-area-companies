import type { Metadata } from 'next'
import { pageAlternates } from '@/lib/alternates'
import UseCasesContent from './content'

interface Props { params: { locale: string } }

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: 'Use Cases — Public Data Maps',
    description: 'See how companies use Public Data Maps for route planning, prospecting, real estate analysis, and market research.',
    alternates: pageAlternates(params.locale, '/use-cases'),
  }
}

export default function UseCasesPage() {
  return <UseCasesContent />
}
