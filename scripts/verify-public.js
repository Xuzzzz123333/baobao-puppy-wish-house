const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname,'..')
const blocked = file => /(^|\/)(project\.config\.json|project\.private\.config\.json|[^/]+\.private\.js|\.env(?:\..*)?)$/.test(file) && !file.endsWith('.example')
function scanText(file,content) {
  const findings = []
  for (const [kind,pattern] of [
    ['real WeChat AppID',/\bwx[0-9a-f]{16}\b/g],
    ['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
    ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]
  ]) for (const match of content.matchAll(pattern)) findings.push({ file,line:content.slice(0,match.index).split('\n').length,kind })
  for (const match of content.matchAll(/templateId\s*:\s*['"]([\w-]{20,})['"]/g)) {
    if (!/^(YOUR_|test_|template_|example)/i.test(match[1])) findings.push({ file,line:content.slice(0,match.index).split('\n').length,kind:'deployment template ID' })
  }
  return findings
}
function listFiles() {
  const result = spawnSync('git',['ls-files','-co','--exclude-standard','-z'],{ cwd:root,encoding:'utf8' })
  if (result.status === 0) return [...new Set(result.stdout.split('\0').filter(Boolean))]
  const files = []
  function walk(dir) {
    for (const item of fs.readdirSync(path.join(root,dir),{ withFileTypes:true })) {
      const file = path.posix.join(dir,item.name)
      if (item.isSymbolicLink() || ['.git','node_modules','miniprogram_npm','.tools','coverage','test-results'].includes(item.name)) continue
      if (item.isDirectory()) walk(file)
      else if (!blocked(file) && !file.endsWith('.log')) files.push(file)
    }
  }
  walk('')
  return files
}
if (require.main === module) {
  const files = listFiles(),findings = []
  for (const file of files) {
    if (blocked(file)) { findings.push({ file,kind:'local configuration tracked by Git' }); continue }
    if (!fs.existsSync(path.join(root,file)) || /\.(png|jpe?g|gif|webp|zip|pdf|ico)$/i.test(file)) continue
    findings.push(...scanText(file,fs.readFileSync(path.join(root,file),'utf8')))
  }
  // Report locations only: never echo a matched credential.
  for (const finding of findings) console.error(`${finding.file}:${finding.line || 1}: ${finding.kind}`)
  if (findings.length) process.exitCode = 1
  else console.log(`Public-source checks passed (${files.length} files). Pattern checks are not a full secret/security audit.`)
}
module.exports = { blocked,scanText }
