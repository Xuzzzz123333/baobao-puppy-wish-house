const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname,'..')
const files = fs.readdirSync(path.join(root,'tests')).filter(file => file.endsWith('.test.js')).sort().map(file => 'tests/' + file)
const result = spawnSync(process.execPath,['--test',...process.argv.slice(2),...files],{ cwd:root,stdio:'inherit' })
if (result.error) throw result.error
process.exitCode = result.status === null ? 1 : result.status
