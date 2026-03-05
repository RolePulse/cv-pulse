import { parseCV } from '../src/lib/parser.js'
import { parseText } from '../src/lib/parser.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HOME = process.env.HOME
const DOWNLOADS = path.join(HOME, 'Downloads')

const targets = [
  'Camilletti_Anthony_Resume.pdf',
  'DeepakBajaj_ResumePUXDv_v4.pdf',
  'ALEX KLOTZ - RESUME 2K25.pdf',
  'Anthony Iglesias 2025 Resume.pdf',
  'Bayo Kasali Resume.pdf',
  'James Lyon - CV (Q2 2024) (1).pdf',
  'Resume_Jane.pdf',
  'Sophia Milanov - Resume.pdf',
  'Manjeera_Vutukuri_Resume.pdf',
  'Quinlan Noble CV.pdf',
  'Resume_Ting_20Boon_20Choon_6Nov2024.pdf',
]

for (const f of targets) {
  const p = path.join(DOWNLOADS, f)
  if (!fs.existsSync(p)) { console.log('MISSING:', f); continue }
  const buf = fs.readFileSync(p)
  const r = await parseCV(buf)
  const raw = r.rawText ?? ''
  const lines = raw.split('\n')
  console.log('\n' + '═'.repeat(70))
  console.log('FILE:', f)
  console.log('conf:', r.confidence, '| roles:', r.structured?.experience?.length ?? 0, '| skills:', r.structured?.skills?.length ?? 0)
  console.log('failReason:', r.failReason ?? 'none')
  console.log('RAW TEXT (first 35 lines):')
  lines.slice(0, 35).forEach((l, i) => console.log(String(i).padStart(3) + ' |' + l))
}
