import Link from 'next/link'

type Step = 'upload' | 'score' | 'export'

interface ProgressIndicatorProps {
  currentStep: Step
  cvId?: string
}

const steps: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'score', label: 'Score & Fix' },
  { key: 'export', label: 'Export' },
]

const stepOrder: Step[] = ['upload', 'score', 'export']

function getStepHref(key: Step, cvId?: string): string | null {
  if (key === 'upload') return '/upload'
  if (key === 'score') return cvId ? `/score?cvId=${cvId}` : null
  if (key === 'export') return cvId ? `/export?cv=${cvId}` : null
  return null
}

export default function ProgressIndicator({ currentStep, cvId }: ProgressIndicatorProps) {
  const currentIndex = stepOrder.indexOf(currentStep)

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const isDone = index < currentIndex
          const isCurrent = index === currentIndex
          const href = isDone ? getStepHref(step.key, cvId) : null

          const circleClasses = [
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
            isDone
              ? 'bg-[#FF6B00] text-white'
              : isCurrent
              ? 'bg-[#FF6B00] text-white ring-4 ring-[#FFF7F2] ring-offset-0'
              : 'bg-[#F0F0F0] text-[#999999]',
          ].join(' ')

          const labelClasses = [
            'text-xs font-medium hidden sm:block',
            isCurrent ? 'text-[#FF6B00]' : isDone ? 'text-[#222222]' : 'text-[#999999]',
          ].join(' ')

          const circleContent = isDone ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2.5 7L5.5 10L11.5 4"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            index + 1
          )

          const stepNode = (
            <div className="flex flex-col items-center gap-1">
              <div className={circleClasses}>{circleContent}</div>
              <span className={labelClasses}>{step.label}</span>
            </div>
          )

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle — clickable if done and href available */}
              {href ? (
                <Link
                  href={href}
                  className="flex flex-col items-center gap-1 group"
                  title={`Back to ${step.label}`}
                >
                  <div
                    className={[
                      circleClasses,
                      'group-hover:opacity-80 group-hover:scale-105',
                    ].join(' ')}
                  >
                    {circleContent}
                  </div>
                  <span className={[labelClasses, 'group-hover:underline'].join(' ')}>
                    {step.label}
                  </span>
                </Link>
              ) : (
                stepNode
              )}

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={[
                    'flex-1 h-[2px] mx-2 transition-all',
                    isDone ? 'bg-[#FF6B00]' : 'bg-[#DDDDDD]',
                  ].join(' ')}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
