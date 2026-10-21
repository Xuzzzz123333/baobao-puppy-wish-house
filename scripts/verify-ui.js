const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { spawnSync } = require('node:child_process')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname,'..')
const config = JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'))
const routes = config.pages.concat('custom-tab-bar/index','components/demo-panel/index','components/inbox-banner/index','components/notification-settings/index')
const allowedTags = new Set(['view','text','button','input','textarea','image','scroll-view','block','demo-panel','inbox-banner','notification-settings','swiper','swiper-item'])
const wxmlFiles = [], wxssFiles = ['app.wxss']
const fakeApp = { getHeaderTop:() => 66,getSafeTop:() => 54,globalData:{ account:{ me:{} } } }
for (const route of routes) {
  for (const suffix of ['js','json','wxml','wxss']) assert.ok(fs.existsSync(path.join(root,route + '.' + suffix)),route + '.' + suffix)
  JSON.parse(fs.readFileSync(path.join(root,route + '.json'),'utf8'))
  let definition
  const jsPath = path.join(root,route + '.js')
  vm.runInNewContext(fs.readFileSync(jsPath,'utf8'),{ getApp:() => fakeApp,require:createRequire(jsPath),Page:value => { definition = value },Component:value => { definition = value.methods },wx:{},console,setTimeout,clearTimeout,setInterval,clearInterval })
  const template = fs.readFileSync(path.join(root,route + '.wxml'),'utf8')
  for (const match of template.matchAll(/\b(?:bind|catch)[\w:.-]+="([^"]+)"/g)) assert.equal(typeof definition[match[1]],'function',route + ': handler ' + match[1])
  for (const match of template.matchAll(/<\/?([a-z][a-z-]*)\b/g)) assert.ok(allowedTags.has(match[1]),route + ': unsupported tag ' + match[1])
  wxmlFiles.push(route + '.wxml'); wxssFiles.push(route + '.wxss')
}
const syntaxPaths = ['app.js','config/shop.js','services/wishes.js','services/tab-bar.js','services/home.js','services/demo.js','services/daily.js','services/inbox.js','data/wish-domain.js','data/keepsakes.js','data/interaction-catalog.js','data/notices.js','data/daily-content.js','cloudfunctions/puppyWishes/index.js','cloudfunctions/puppyWishes/domain.js','cloudfunctions/puppyWishes/home.js','cloudfunctions/puppyWishes/daily.js','cloudfunctions/puppyWishes/keepsakes.js','cloudfunctions/puppyWishes/catalog.js','cloudfunctions/puppyWishes/notices.js','cloudfunctions/puppyWishes/inbox.js','cloudfunctions/puppyWishes/subscription.js','cloudfunctions/puppyWishes/subscription.config.js','cloudfunctions/puppyWishes/daily-content.js'].concat(routes.map(route => route + '.js'))
syntaxPaths.push('config/release.js','services/account.js','cloudfunctions/coupleAccount/index.js')
for (const file of syntaxPaths) {
  const result = spawnSync(process.execPath,['--check',file],{ cwd:root,encoding:'utf8' })
  assert.equal(result.status,0,file + ': ' + result.stderr)
}
const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--native'),'Usage: node scripts/verify-ui.js [--native]')
let nativeCompiler = 'not run (use --native with WCC_EXEC_DIR)'
if (args.length) {
  const binaries = process.env.WCC_EXEC_DIR
  assert.ok(binaries,'Set WCC_EXEC_DIR to Developer Tools resources/app.asar.unpacked/node_modules/wcc-exec')
  const suffix = process.platform === 'win32' ? '.exe' : ''
  for (const [name,compilerArgs] of [['wcc',['-d',...wxmlFiles]],['wcsc',['-lc',...wxssFiles]]]) {
    const result = spawnSync(path.join(binaries,name + suffix),compilerArgs,{ cwd:root,encoding:'utf8',maxBuffer:16 * 1024 * 1024 })
    assert.equal(result.status,0,name + ': ' + (result.error || result.stderr) + '\n' + (result.stdout || '').slice(0,3500))
  }
  nativeCompiler = 'pass'
}
const projectFile = fs.existsSync(path.join(root,'project.config.json')) ? 'project.config.json' : 'project.config.example.json'
const project = JSON.parse(fs.readFileSync(path.join(root,projectFile),'utf8'))
const ignored = project.packOptions.ignore
function packedSize(dir) {
  let size = 0
  for (const file of fs.readdirSync(dir,{ withFileTypes:true })) {
    const full = path.join(dir,file.name), relative = path.relative(root,full).replaceAll('\\','/')
    if (file.name.startsWith('.') || relative.startsWith(project.cloudfunctionRoot) || relative === project.cloudfunctionRoot.replace(/\/$/,'')) continue
    if (ignored.some(rule => rule.type === 'file' ? rule.value === relative : (relative === rule.value || relative.startsWith(rule.value + '/')))) continue
    size += file.isDirectory() ? packedSize(full) : fs.statSync(full).size
  }
  return size
}
const bytes = packedSize(root)
assert.ok(bytes < 2 * 1024 * 1024,'main package estimate exceeds 2 MiB')
console.log(JSON.stringify({ pages:config.pages.length,templates:wxmlFiles.length,syntaxFiles:syntaxPaths.length,nativeCompiler,projectFile,estimatedPackageBytes:bytes },null,2))
