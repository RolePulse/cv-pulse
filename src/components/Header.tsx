import Link from 'next/link'
import Button from './Button'
import UserNav from './UserNav'

interface HeaderProps {
  isSignedIn?: boolean
}

// Pulse waveform icon — matches RolePulse visual DNA
function PulseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 12h3l2-7 3 14 3-10 2 6 2-3h5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Header({ isSignedIn = false }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#DDDDDD]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-[6px] bg-[#FF6B00] flex items-center justify-center flex-shrink-0">
            <PulseIcon />
          </div>
          <span className="text-[#222222] font-semibold text-[15px] tracking-tight">
            CV Pulse
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {isSignedIn ? (
            <>
              <UserNav />
            </>
          ) : (
            <Button variant="secondary" size="sm">
              <Link href="/upload">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
