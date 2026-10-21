const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
if (args.length > 1 || (args.length && args[0] !== '--check')) throw new Error('Usage: node scripts/sync-interactions.js [--check]')
for (const [source,target,before,after] of [
  ['catalog.js','interaction-catalog.js'],['notices.js','notices.js'],['daily-content.js','daily-content.js'],
  ['domain.js','wish-domain.js',"require('./catalog')","require('./interaction-catalog')"],
  ['keepsakes.js','keepsakes.js',"require('./domain')","require('./wish-domain')"]
]) {
  let content = fs.readFileSync(path.join(root,'cloudfunctions/puppyWishes',source),'utf8')
  if (before) content = content.replace(before,after)
  const file = path.join(root,'data',target)
  if (args.length) {
    if (fs.readFileSync(file,'utf8') !== content) throw new Error('Out of sync: data/' + target + '. Run npm run sync.')
  } else fs.writeFileSync(file,content)
}
console.log(args.length ? 'Catalog and demo rules are in sync.' : 'Catalog and demo rules synchronized.')
