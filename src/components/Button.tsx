import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  className?: string
  children: React.ReactNode
  href?: string
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#FF6B00] text-white hover:bg-[#E85F00] border border-transparent',
  secondary:
    'bg-white text-[#222222] hover:bg-[#F0F0F0] border border-[#DDDDDD]',
  ghost:
    'bg-transparent text-[#FF6B00] hover:bg-[#FFF7F2] border border-[#FF6B00]',
  danger:
    'bg-transparent text-[#DC2626] hover:bg-red-50 border border-[#DC2626]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3 text-base',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  className = '',
  children,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-[6px] font-medium transition-all duration-150 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Loading…</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
