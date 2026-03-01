'use client'

// CV Pulse — Paywall Modal
// Epic 10 | Shown when a free user hits their usage limit.
// Stripe is NOT connected in v1 — upgrade CTA is scaffolded only.
// When Stripe is wired in Epic 16, this component requires no changes —
// just point the "Upgrade" button at the Stripe checkout URL.

import Modal from '@/components/Modal'
import Button from '@/components/Button'

interface PaywallModalProps {
  isOpen: boolean
  onClose: () => void
  action: 'rescore' | 'jd_check'
}

const COPY = {
  rescore: {
    title: 'Upgrade to re-score',
    limit: '1 free re-score',
    description:
      'You\'ve used your 1 free re-score. Upgrade to unlock unlimited re-scores so you can keep iterating until your CV is ready.',
    benefits: [
      'Unlimited re-scores — iterate until you pass',
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
      'Unlimited re-scores — iterate until you pass',
      'Priority support',
    ],
  },
}

export default function PaywallModal({ isOpen, onClose, action }: PaywallModalProps) {
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
            onClick={() => {
              // TODO Epic 16: window.location.href = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL
              alert('Stripe coming soon — thank you for your interest!')
            }}
          >
            Upgrade — $9/month
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="w-full justify-center text-[#666666]"
            onClick={onClose}
          >
            Maybe later
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
