import type { Metadata } from 'next'
import { pageAlternates } from '@/lib/alternates'
import PricingContent from './content'

interface Props { params: { locale: string } }

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: 'Pricing — Public Data Maps',
    description: 'Simple, transparent pricing for individuals and teams. Start free, upgrade when you need more.',
    alternates: pageAlternates(params.locale, '/pricing'),
  }
}

export default function PricingPage() {
  return <PricingContent />
}
