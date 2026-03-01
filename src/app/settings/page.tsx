// CV Pulse — Settings Page
// Epic 13 | Account info (read-only), delete CV data, delete account
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import AlertBanner from '@/components/AlertBanner'
import { createClient } from '@/lib/supabase/client'
import type { PaidStatus } from '@/types/database'

const PAID_STATUS_LABELS: Record<PaidStatus, string> = {
  free: 'Free',
  rolepulse_paid: 'RolePulse Member',
  paid_stripe: 'Pro',
}

export function getPaidStatusLabel(status: PaidStatus): string {
  return PAID_STATUS_LABELS[status] ?? 'Free'
}

export default function SettingsPage() {
  const router = useRouter()
  const [showDeleteDataModal, setShowDeleteDataModal] = useState(false)
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)
  const [deletingCv, setDeletingCv] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Account info state
  const [email, setEmail] = useState<string | null>(null)
  const [memberSince, setMemberSince] = useState<string | null>(null)
  const [paidStatus, setPaidStatus] = useState<PaidStatus>('free')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAccountInfo() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/upload')
        return
      }

      setEmail(user.email ?? null)

      // Fetch users table for created_at
      const { data: dbUser } = await supabase
        .from('users')
        .select('created_at')
        .eq('id', user.id)
        .single()

      if (dbUser?.created_at) {
        setMemberSince(new Date(dbUser.created_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }))
      }

      // Fetch usage for paid_status
      const { data: usage } = await supabase
        .from('usage')
        .select('paid_status')
        .eq('user_id', user.id)
        .single()

      if (usage?.paid_status) {
        setPaidStatus(usage.paid_status as PaidStatus)
      }

      setLoading(false)
    }

    loadAccountInfo()
  }, [router])

  async function handleDeleteCv() {
    setDeletingCv(true)
    setError(null)

    try {
      const res = await fetch('/api/user/delete-cv', { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to delete CV data. Please try again.')
        setShowDeleteDataModal(false)
        setDeletingCv(false)
        return
      }

      router.push('/upload?deleted=cv')
    } catch {
      setError('Network error — check your connection and try again.')
      setShowDeleteDataModal(false)
      setDeletingCv(false)
    }
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true)
    setError(null)

    try {
      const res = await fetch('/api/user/delete-account', { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to delete account. Please try again.')
        setShowDeleteAccountModal(false)
        setDeletingAccount(false)
        return
      }

      // Sign out on client side after server deletion succeeds
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/')
    } catch {
      setError('Network error — check your connection and try again.')
      setShowDeleteAccountModal(false)
      setDeletingAccount(false)
    }
  }

  const userInitial = email ? email[0].toUpperCase() : '?'

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn userInitial={userInitial} />

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-[#222222] mb-8">Settings</h1>

        {/* Error banner */}
        {error && (
          <div className="mb-6">
            <AlertBanner type="error" message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* Account info */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-5"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[15px] font-semibold text-[#222222] mb-4">Account</h2>
          {loading ? (
            <p className="text-sm text-[#999999]">Loading…</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-[#FF6B00] flex items-center justify-center text-white font-semibold">
                  {userInitial}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#222222]">{email}</p>
                  <p className="text-xs text-[#999999]">Signed in with Google</p>
                </div>
              </div>
              <div className="space-y-3 pt-4 border-t border-[#DDDDDD]">
                <div>
                  <p className="text-sm font-medium text-[#222222] mb-0.5">Member since</p>
                  <p className="text-sm text-[#444444]">{memberSince ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#222222] mb-0.5">Plan</p>
                  <p className="text-sm text-[#444444]">{getPaidStatusLabel(paidStatus)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Data & privacy */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[15px] font-semibold text-[#222222] mb-1">Data & privacy</h2>
          <p className="text-xs text-[#999999] mb-5">
            We store your CV text and scores. We never store your original PDF.
          </p>
          <div className="space-y-3">
            <div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteDataModal(true)}
              >
                Delete my CV and scores
              </Button>
              <p className="text-xs text-[#999999] mt-1">Removes your CV text, all scores, and JD checks. Your account remains.</p>
            </div>
            <div className="pt-3 border-t border-[#DDDDDD]">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteAccountModal(true)}
              >
                Delete my account
              </Button>
              <p className="text-xs text-[#999999] mt-1">Permanently deletes your account and all associated data. This cannot be undone.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Delete CV data modal */}
      <Modal
        isOpen={showDeleteDataModal}
        onClose={() => setShowDeleteDataModal(false)}
        title="Delete CV data?"
      >
        <p className="text-sm text-[#444444] mb-5">
          This will permanently delete your current CV, all scores, and JD checks. Your account stays open. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteDataModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={deletingCv} onClick={handleDeleteCv}>
            Delete CV data
          </Button>
        </div>
      </Modal>

      {/* Delete account modal */}
      <Modal
        isOpen={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        title="Delete your account?"
      >
        <p className="text-sm text-[#444444] mb-5">
          This will permanently delete your account and all associated data including CVs, scores, and settings. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteAccountModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={deletingAccount} onClick={handleDeleteAccount}>
            Delete account
          </Button>
        </div>
      </Modal>

      {/* Footer */}
      <footer className="border-t border-[#DDDDDD] py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-center gap-2 text-sm text-[#999999]">
          <span>&copy; 2026 CV Pulse</span>
          <span>&middot;</span>
          <Link href="/terms" className="hover:text-[#222222] transition-colors">Terms</Link>
          <span>&middot;</span>
          <Link href="/privacy" className="hover:text-[#222222] transition-colors">Privacy</Link>
        </div>
      </footer>
    </div>
  )
}
