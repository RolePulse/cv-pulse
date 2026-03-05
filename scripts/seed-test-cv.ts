import { createClient } from '@supabase/supabase-js'
import { parseCV } from '../src/lib/parser'
import { scoreCV } from '../src/lib/scorer'
import type { TargetRole } from '../src/lib/roleDetect'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)![1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)![1].trim()
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const USER_ID = 'a567d2f0-387f-418c-9e85-6ea02a8d5a75'
const PDF_PATH = process.argv[2] || '/Users/jamesfowles/Downloads/Anthony Branch AE Resume 2025 (2).pdf'
const TARGET_ROLE = (process.argv[3] || 'AE') as TargetRole

async function run() {
  console.log('Parsing:', PDF_PATH)
  const pdfBuffer = fs.readFileSync(PDF_PATH)
  const parsed = await parseCV(pdfBuffer)
  
  console.log('Parse confidence:', parsed.confidence)
  if (parsed.failReason) console.log('Fail reason:', parsed.failReason)
  
  // Clean up existing CVs
  const { data: existingCvs } = await admin.from('cvs').select('id').eq('user_id', USER_ID)
  if (existingCvs?.length) {
    const ids = existingCvs.map(c => c.id)
    await admin.from('scores').delete().in('cv_id', ids)
    await admin.from('jd_checks').delete().in('cv_id', ids)
    await admin.from('share_links').delete().in('cv_id', ids)
    await admin.from('cvs').delete().in('id', ids)
  }
  
  // Insert CV
  const { data: cv, error: cvErr } = await admin.from('cvs').insert({
    user_id: USER_ID,
    target_role: TARGET_ROLE,
    raw_text: parsed.rawText,
    structured_json: parsed.structured,
    parse_confidence: parsed.confidence,
    parse_fail_reason: parsed.failReason ?? null,
  }).select().single()
  
  if (cvErr) { console.error('CV insert error:', cvErr.message); process.exit(1) }
  console.log('✅ CV inserted:', cv.id)
  
  // Score it
  const result = scoreCV(parsed.structured, parsed.rawText, TARGET_ROLE)
  console.log('Score:', result.overallScore, '| Pass:', result.passFail)
  
  const buckets = {
    proof_of_impact: result.buckets.proofOfImpact.score,
    ats_keywords: result.buckets.atsKeywords.score,
    formatting: result.buckets.formatting.score,
    clarity: result.buckets.clarity.score,
  }
  console.log('Buckets:', JSON.stringify(buckets))
  
  // Insert score
  const { data: score, error: scoreErr } = await admin.from('scores').insert({
    cv_id: cv.id,
    overall_score: result.overallScore,
    pass_fail: result.passFail,
    bucket_scores_json: buckets,
    penalties_json: result.criticalConcerns.map(r => ({ code: 'critical', reason: r })),
    checklist_json: result.checklist,
  }).select().single()
  
  if (scoreErr) { console.error('Score insert error:', scoreErr.message); process.exit(1) }
  console.log('✅ Score inserted:', score.id)
  
  // Reset usage counter
  await admin.from('usage').update({ free_rescores_used: 1 }).eq('user_id', USER_ID)
  
  console.log('\nTest URLs:')
  console.log('Results: http://localhost:3000/results/' + cv.id)
  console.log('Editor:  http://localhost:3000/editor/' + cv.id)
  console.log('Export:  http://localhost:3000/export/' + cv.id)
  console.log('')
  console.log('CV_ID=' + cv.id)
}

run().catch(e => { console.error(e.message); process.exit(1) })
