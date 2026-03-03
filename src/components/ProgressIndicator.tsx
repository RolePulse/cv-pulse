type Step = 'upload' | 'score' | 'export'

interface ProgressIndicatorProps {
  currentStep: Step
}

const steps: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'score', label: 'Score & Fix' },
  { key: 'export', label: 'Export' },
]

const stepOrder: Step[] = ['upload', 'score', 'export']

export default function ProgressIndicator({ currentStep }: ProgressIndicatorProps) {
  const currentIndex = stepOrder.indexOf(currentStep)

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const isDone = index < currentIndex
          const isCurrent = index === currentIndex
          const isFuture = index > currentIndex

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={[
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                    isDone
                      ? 'bg-[#FF6B00] text-white'
                      : isCurrent
                      ? 'bg-[#FF6B00] text-white ring-4 ring-[#FFF7F2] ring-offset-0'
                      : 'bg-[#F0F0F0] text-[#999999]',
                  ].join(' ')}
                >
                  {isDone ? (
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
                  )}
                </div>
                <span
                  className={[
                    'text-xs font-medium hidden sm:block',
                    isCurrent ? 'text-[#FF6B00]' : isDone ? 'text-[#222222]' : 'text-[#999999]',
                  ].join(' ')}
                >
                  {step.label}
                </span>
              </div>

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
