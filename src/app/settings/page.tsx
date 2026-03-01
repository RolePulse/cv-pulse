// Auth gate: real auth wired in Epic 1. Redirect unauthenticated users to /upload.
'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Button from '@/components/Button'
import Modal from '@/components/Modal'

export default function SettingsPage() {
  const [showDeleteDataModal, setShowDeleteDataModal] = useState(false)
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)

  return (
    <div className="min-h-screen bg-[#FFF7F2]">
      <Header isSignedIn userInitial="J" />

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-[#222222] mb-8">Settings</h1>

        {/* Account */}
        <div
          className="bg-white rounded-[8px] border border-[#DDDDDD] p-6 mb-5"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="text-[15px] font-semibold text-[#222222] mb-4">Account</h2>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-[#FF6B00] flex items-center justify-center text-white font-semibold">
              J
            </div>
            <div>
              <p className="text-sm font-medium text-[#222222]">james@example.com</p>
              <p className="text-xs text-[#999999]">Signed in with Google</p>
            </div>
          </div>
          <div className="space-y-3 pt-4 border-t border-[#DDDDDD]">
            <div>
              <p className="text-sm font-medium text-[#222222] mb-0.5">Re-scores used</p>
              <p className="text-sm text-[#444444]">0 of 1 free · <span className="text-[#FF6B00]">Upgrade</span></p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#222222] mb-0.5">JD checks used</p>
              <p className="text-sm text-[#444444]">0 of 2 free · <span className="text-[#FF6B00]">Upgrade</span></p>
            </div>
          </div>
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
                Delete my CV data
              </Button>
              <p className="text-xs text-[#999999] mt-1">Removes your CV text and all scores. Your account remains.</p>
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
          This will permanently delete your uploaded CV text and all scores. Your account will remain active.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteDataModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm">
            Delete data
          </Button>
        </div>
        {/* Real delete logic wired in Epic 13 */}
      </Modal>

      {/* Delete account modal */}
      <Modal
        isOpen={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        title="Delete your account?"
      >
        <p className="text-sm text-[#444444] mb-5">
          This permanently deletes your account and all data. It cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteAccountModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm">
            Yes, delete everything
          </Button>
        </div>
        {/* Real delete logic wired in Epic 13 */}
      </Modal>
    </div>
  )
}
