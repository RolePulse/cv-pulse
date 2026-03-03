'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function ResultsRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cvId = searchParams.get('cvId')

  useEffect(() => {
    if (cvId) router.replace('/score?cvId=' + cvId)
    else router.replace('/upload')
  }, [cvId, router])

  return (
    <main className="min-h-screen bg-[#FFF7F2] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
    </main>
  )
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FFF7F2] flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <ResultsRedirect />
    </Suspense>
  )
}
