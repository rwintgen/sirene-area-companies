/**
 * Server-side Stripe client singleton.
 * Imported only from API routes — never from client components.
 */
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[stripe] STRIPE_SECRET_KEY not set — payment features will be disabled.')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
})

/** Maps plan IDs used in the app to their Stripe price IDs per billing interval. */
export const PRICE_IDS: Record<string, Record<string, string | undefined>> = {
  individual: {
    monthly: process.env.STRIPE_PRICE_INDIVIDUAL_MONTHLY,
    yearly: process.env.STRIPE_PRICE_INDIVIDUAL_YEARLY,
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
  },
}

/** Reverse-maps a Stripe price ID back to a UserTier value. */
export function tierFromPriceId(priceId: string): 'individual' | 'enterprise' | null {
  for (const [tier, map] of Object.entries(PRICE_IDS)) {
    if (Object.values(map).includes(priceId)) return tier as 'individual' | 'enterprise'
  }
  return null
}
