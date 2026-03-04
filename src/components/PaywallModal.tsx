'use client'

// CV Pulse — Paywall Modal
// Upgrade CTA links to /upgrade (which reads NEXT_PUBLIC_STRIPE_CHECKOUT_URL).
// When Stripe is ready: set NEXT_PUBLIC_STRIPE_CHECKOUT_URL in Vercel env vars — no changes needed here.

import { useRouter } from 'next/navigation'
import Modal from '@/components/Modal'
import Button from '@/components/Button'

interface PaywallModalProps {
  isOpen: boolean
  onClose: () => void
  action: 'jd_check' | 'second_upload'
  closeLabel?: string
}

const COPY = {
  second_upload: {
    title: 'Upgrade to score more CVs',
    limit: '1 free CV',
    description:
      'You\'ve fully scored your first CV. Upgrade to upload and score additional CVs — useful if you\'re applying with multiple versions or targeting different roles.',
    benefits: [
      'Score multiple CV versions',
      'Unlimited re-scores on every CV',
      'Unlimited JD checks — tailor your CV to every role',
      'Priority support',
    ],
  },
  jd_check: {
    title: 'Upgrade for more JD checks',
    limit: '2 free JD checks',
    description:
      'You\'ve used your 2 free JD checks. Upgrade to run unlimited JD match checks across as many roles as you apply to.',
    benefits: [
      'Unlimited JD checks — tailor your CV to every role',
      'Unlimited re-scores on every CV',
      'Score multiple CV versions',
      'Priority support',
    ],
  },
}

export default function PaywallModal({ isOpen, onClose, action, closeLabel = 'Maybe later' }: PaywallModalProps) {
  const router = useRouter()
  const copy = COPY[action]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={copy.title}>
      <div className="space-y-4">
        {/* Message */}
        <p className="text-sm text-[#444444] leading-relaxed">
          {copy.description}
        </p>

        {/* Benefits list */}
        <ul className="space-y-2">
          {copy.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-sm text-[#333333]">
              <span className="text-[#FF6B00] mt-0.5 flex-shrink-0 font-bold">✓</span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        {/* Price note */}
        <div className="bg-[#FFF7F2] rounded-[6px] border border-[#FFD9C2] px-4 py-3">
          <p className="text-sm font-semibold text-[#222222]">$9 / month</p>
          <p className="text-xs text-[#666666] mt-0.5">Cancel anytime. No commitment.</p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-2 pt-1">
          {/* Upgrade — scaffolded. Wire Stripe checkout URL here in Epic 16. */}
          <Button
            variant="primary"
            size="md"
            className="w-full justify-center"
            onClick={() => { onClose(); router.push('/upgrade') }}
          >
            Upgrade — $9/month →
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="w-full justify-center text-[#666666]"
            onClick={onClose}
          >
            {closeLabel}
          </Button>
        </div>

        {/* RolePulse note */}
        <p className="text-xs text-[#999999] text-center pt-1">
          RolePulse paid subscribers get unlimited access automatically.{' '}
          <a
            href="https://rolepulse.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FF6B00] hover:underline"
          >
            Learn more
          </a>
        </p>
      </div>
    </Modal>
  )
}
