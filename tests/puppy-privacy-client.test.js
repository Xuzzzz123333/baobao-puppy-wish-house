const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { createRequire } = require('node:module')
function fixture(hasContract = true) {
  const file = path.join(__dirname,'../pages/privacy/privacy.js'),localRequire = createRequire(file)
  const clipboard = [],toasts = [],tabs = [],contracts = []
  const wx = { setClipboardData:value => clipboard.push(value),showToast:value => toasts.push(value),switchTab:value => tabs.push(value),navigateBack:options => options.fail() }
  if (hasContract) wx.openPrivacyContract = value => contracts.push(value)
  let definition
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{ Page:value => { definition = value },getApp:() => ({ getHeaderTop:() => 66 }),require:name => name === '../../config/release' ? { privacyEmail:'maintainer@example.com',filingNumber:'' } : localRequire(name),wx,console })
  const page = { ...definition,data:structuredClone(definition.data),setData(patch) { Object.assign(this.data,patch) } }
  return { page,clipboard,toasts,tabs,contracts }
}
test('隐私页提供已配置的联系邮箱，缺少备案号时不生成假编号；直接打开也可返回小店',() => {
  const f = fixture(); f.page.onLoad(); f.page.copyEmail()
  assert.equal(f.clipboard[0].data,'maintainer@example.com')
  assert.equal(f.page.data.release.filingNumber,'')
  f.page.copyFilingQuery(); assert.equal(f.clipboard.length,1)
  f.page.goBack(); assert.equal(f.tabs[0].url,'/pages/index/index')
})
test('平台隐私指引使用微信原生入口；不支持或未配置时给出提示',() => {
  const f = fixture(); f.page.openOfficialPrivacy(); assert.equal(f.contracts.length,1)
  f.contracts[0].fail(); assert.equal(f.toasts.length,1)
  const older = fixture(false); older.page.openOfficialPrivacy(); assert.match(older.toasts[0].title,/更新微信/)
})
