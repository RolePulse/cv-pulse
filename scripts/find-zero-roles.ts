import { parseCV } from '../src/lib/parser'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

async function main() {
  const dir = process.env.HOME + '/Downloads'
  const files = readdirSync(dir).filter(f => f.endsWith('.pdf')).sort()
  const zeroRoles: string[] = []

  for (const f of files) {
    try {
      const buf = readFileSync(join(dir, f))
      const r = await parseCV(buf)
      if (r.confidence >= 40 && r.structured.experience.length === 0) {
        zeroRoles.push(f)
      }
    } catch {}
  }
  console.log(`Zero-roles CVs (${zeroRoles.length}):`)
  zeroRoles.forEach(f => console.log(' -', f))
}
main()
