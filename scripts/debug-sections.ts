import { detectSections, cleanText } from '../src/lib/parser'
import { readFileSync } from 'fs'
const pdfParse = require('../node_modules/pdf-parse/lib/pdf-parse.js')

async function main() {
  const name = process.argv[2]
  const buf = readFileSync(process.env.HOME + '/Downloads/' + name)
  const data = await pdfParse(buf)
  const rawText = cleanText(data.text)
  const sections = detectSections(rawText)
  
  console.log('SECTIONS FOUND:', Object.keys(sections))
  for (const [k, v] of Object.entries(sections)) {
    console.log(`\n--- ${k.toUpperCase()} (${v.length} chars) ---`)
    console.log(v.slice(0, 400))
  }
}
main()
