const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname,'..')
const app = require('../app.json'),project = require('../project.config.json'),release = require('../config/release')
const subscription = require('../cloudfunctions/puppyWishes/subscription.config')
const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--target=trial'),'用法：node scripts/verify-release.js [--target=trial]')
const target = args.length ? 'trial' : 'formal'
assert.equal(subscription.miniprogramState,target,target === 'trial' ? '体验测试通知需跳转体验版' : '正式发布前通知需恢复 formal')
assert.ok(subscription.templateId && subscription.templateId.length >= 20,'缺少微信订阅模板')
assert.deepEqual(subscription.fields,{ name:'name1',title:'thing10',content:'thing2',time:'time3' })
assert.equal(project.setting.urlCheck,true,'发布版应开启 URL 校验')
assert.match(release.version,/^\d+\.\d+\.\d+$/)
assert.match(release.privacyEmail,/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
assert.equal(require('../sitemap.json').rules.some(rule => rule.action === 'disallow' && rule.page === '*'),true)
for (const name of ['puppyWishes','coupleAccount']) assert.equal(require('../cloudfunctions/' + name + '/package.json').dependencies['wx-server-sdk'],'4.0.2')
for (const name of ['puppyWishes','coupleAccount']) assert.ok(require('../cloudfunctions/' + name + '/config.json').permissions.openapi.includes('security.msgSecCheck'),'缺少文字检查权限：' + name)
const ignored = file => file.startsWith('.') || project.packOptions.ignore.some(rule => rule.type === 'file' ? file === rule.value : file === rule.value || file.startsWith(rule.value + '/'))
const seen = new Set()
// 从实际入口逐个解析本地 require，避免清理旧页面时误排除了仍使用的依赖。
function visit(relative) {
  const file = relative.replaceAll('\\','/')
  if (seen.has(file)) return
  assert.ok(!ignored(file),'活动依赖被排除打包：' + file)
  assert.ok(fs.existsSync(path.join(root,file)),'活动依赖不存在：' + file)
  seen.add(file)
  if (!file.endsWith('.js')) return
  const source = fs.readFileSync(path.join(root,file),'utf8')
  for (const match of source.matchAll(/require\(['"](\.[^'"]*)['"]\)/g)) {
    let next = path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]))
    if (!fs.existsSync(path.join(root,next)) && fs.existsSync(path.join(root,next + '.js'))) next += '.js'
    assert.ok(!next.startsWith('../'),'本地依赖越出项目：' + next)
    visit(next)
  }
}
visit('app.js')
for (const route of [...app.pages,'custom-tab-bar/index',...Object.values(app.usingComponents).map(value => value.replace(/^\//,''))]) for (const suffix of ['js','json','wxml','wxss']) visit(route + '.' + suffix)
console.log(JSON.stringify({ codeChecks:'pass',version:release.version,name:require('../config/shop').name,notificationTarget:subscription.miniprogramState,activeFilesChecked:seen.size,
  platformChecks:'待核对：名称可用性、实际服务类目、备案、平台隐私保护指引、审核与真实双人联调',filingNumberConfigured:Boolean(release.filingNumber) },null,2))
