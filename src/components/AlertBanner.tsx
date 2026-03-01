'use client'

type AlertType = 'success' | 'error' | 'warning' | 'info'

interface AlertBannerProps {
  type: AlertType
  message: string
  onDismiss?: () => void
}

const config: Record<AlertType, { border: string; bg: string; text: string; icon: string }> = {
  success: {
    border: 'border-l-[#16A34A]',
    bg: 'bg-green-50',
    text: 'text-green-800',
    icon: '✓',
  },
  error: {
    border: 'border-l-[#DC2626]',
    bg: 'bg-red-50',
    text: 'text-red-800',
    icon: '✕',
  },
  warning: {
    border: 'border-l-[#D97706]',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    icon: '⚠',
  },
  info: {
    border: 'border-l-[#2563EB]',
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    icon: 'ℹ',
  },
}

export default function AlertBanner({ type, message, onDismiss }: AlertBannerProps) {
  const { border, bg, text, icon } = config[type]

  return (
    <div
      className={[
        'w-full border-l-4 px-4 py-3 flex items-start gap-3',
        border,
        bg,
      ].join(' ')}
    >
      <span className={`text-sm font-semibold mt-px ${text}`}>{icon}</span>
      <p className={`text-sm flex-1 ${text}`}>{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`text-lg leading-none ${text} opacity-60 hover:opacity-100 transition-opacity cursor-pointer`}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  )
}
