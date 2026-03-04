'use client'

import { useRef, useState, KeyboardEvent, ClipboardEvent } from 'react'

interface SkillTagInputProps {
  value: string[]
  onChange: (skills: string[]) => void
  placeholder?: string
}

export default function SkillTagInput({
  value,
  onChange,
  placeholder = 'Type a skill and press Enter…',
}: SkillTagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addSkills = (raw: string) => {
    const incoming = raw
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!incoming.length) return
    // deduplicate against existing (case-insensitive)
    const existing = new Set(value.map((s) => s.toLowerCase()))
    const fresh = incoming.filter((s) => !existing.has(s.toLowerCase()))
    if (fresh.length) onChange([...value, ...fresh])
  }

  const removeSkill = (index: number) => {
    const next = value.filter((_, i) => i !== index)
    onChange(next)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const trimmed = inputValue.replace(/,$/, '').trim()
      if (trimmed) {
        addSkills(trimmed)
        setInputValue('')
      }
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      // Remove last chip on backspace when input is empty
      onChange(value.slice(0, -1))
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (text.includes(',') || text.includes('\n')) {
      e.preventDefault()
      addSkills(text)
      setInputValue('')
    }
    // single-word paste: let it land in the input naturally
  }

  const handleBlur = () => {
    const trimmed = inputValue.replace(/,$/, '').trim()
    if (trimmed) {
      addSkills(trimmed)
      setInputValue('')
    }
  }

  return (
    <div
      className="min-h-[48px] w-full flex flex-wrap gap-1.5 items-center rounded-[6px] border border-[#DDDDDD] bg-[#FAFAFA] px-2.5 py-2 cursor-text focus-within:border-[#FF6B00] focus-within:ring-2 focus-within:ring-[#FF6B00]/10 transition-all"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Chips */}
      {value.map((skill, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 bg-[#FFF0E6] text-[#FF6B00] text-[12px] font-medium px-2 py-0.5 rounded-full border border-[#FFD4B3] leading-tight"
        >
          {skill}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              removeSkill(i)
            }}
            className="ml-0.5 text-[#FF6B00]/60 hover:text-[#FF6B00] transition-colors leading-none"
            aria-label={`Remove ${skill}`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}

      {/* Text input */}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : 'Add another…'}
        className="flex-1 min-w-[120px] bg-transparent text-[13px] text-[#222222] placeholder:text-[#BBBBBB] outline-none border-none p-0"
      />
    </div>
  )
}
