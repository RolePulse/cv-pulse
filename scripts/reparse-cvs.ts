// scripts/reparse-cvs.ts
// Re-parses all CVs from their raw_text using the current parser.
// Run after parser fixes to update cached structured_json in the DB.
// Usage: npx tsx scripts/reparse-cvs.ts

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load env from .env.local
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env: Record<string, string> = {}
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

import { parseText } from '../src/lib/parser'

async function main() {
  const { data: cvs, error } = await supabase
    .from('cvs')
    .select('id, raw_text')
    .not('raw_text', 'is', null)

  if (error || !cvs) { console.error('Fetch error:', error); process.exit(1) }
  console.log(`Re-parsing ${cvs.length} CVs...`)

  let updated = 0, failed = 0
  for (const cv of cvs) {
    try {
      const result = parseText(cv.raw_text!)
      const { error: upErr } = await supabase
        .from('cvs')
        .update({ structured_json: result.structured })
        .eq('id', cv.id)
      if (upErr) { console.error(`  FAIL ${cv.id}:`, upErr.message); failed++ }
      else { process.stdout.write('.'); updated++ }
    } catch (e: any) { console.error(`\n  ERR ${cv.id}:`, e.message); failed++ }
  }
  console.log(`\nDone: ${updated} updated, ${failed} failed`)
}

main()
