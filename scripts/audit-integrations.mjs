import { readFile } from 'node:fs/promises'
import { auditIntegrations } from '../src/modules/integration-audit.ts'
const path=process.argv[2]
if(!path){console.error('Uso: npm run audit:integrations -- caminho-do-backup.json');process.exitCode=2}
else {
  const issues=await auditIntegrations(JSON.parse(await readFile(path,'utf8')))
  console.log(JSON.stringify({count:issues.length,issues},null,2))
  process.exitCode=issues.length?1:0
}
