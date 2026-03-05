import { readFileSync } from 'fs'
import pdfParse from 'pdf-parse'

async function main() {
  const files = ['demo-classic', 'demo-modern', 'long-classic', 'long-modern']

  for (const name of files) {
    const buf = readFileSync(`/tmp/cv-${name}.pdf`)
    const r = await pdfParse(buf)
    const pages = r.numpages
    const lines = r.text.split('\n').map((l: string) => l.trim()).filter(Boolean)

    console.log(`\n── ${name} (${pages} page${pages > 1 ? 's' : ''}, ${r.text.length} chars) ──`)
    console.log(`  Lines: ${lines.length}`)
    // Print first 30 lines
    lines.slice(0, 30).forEach((l: string, i: number) => console.log(`  ${String(i+1).padStart(2)}: ${l}`))
    if (lines.length > 30) console.log(`  ... (${lines.length - 30} more lines)`)
  }
}

main().catch(console.error)
