const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const daily = require('../services/daily')
function fixture(overrides = {}) {
  const file = path.join(__dirname,'../pages/daily/daily.js'),localRequire = createRequire(file)
  const card = daily.dailyCard(),record = { ...card,mySubmitted:false,partnerSubmitted:false,revealed:false,myAnswer:'',partnerAnswer:'' }
  const storage = new Map(),toasts = [],tabs = []
  const service = { ...daily,get:async () => ({ ok:true,paired:true,partnerName:'宝宝',daily:record }),...overrides }
  let definition
  const wx = { getStorageSync:key => storage.get(key),setStorageSync:(key,value) => storage.set(key,value),removeStorageSync:key => storage.delete(key),showToast:value => toasts.push(value),switchTab:value => tabs.push(value) }
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{ Page:value => { definition = value },getApp:() => ({}),wx,console,require:name => name.endsWith('/services/daily') ? service : localRequire(name) })
  const page = { ...definition,data:structuredClone(definition.data),setData(patch) { Object.assign(this.data,patch) } }
  return { page,storage,toasts,tabs,record }
}
test('今天的盲盒刷新后保持打开，转为心愿只进入确认页', async () => {
  const f = fixture(); await f.page.load()
  assert.equal(f.page.data.opened,false)
  f.page.draw()
  await f.page.load()
  assert.equal(f.page.data.opened,true)
  f.page.makeWish()
  assert.equal(f.storage.get('puppy_direct_wish'),f.page.data.card.action.templateId)
  assert.ok(f.storage.get('puppy_direct_wish_note').includes(f.page.data.card.action.text))
  assert.equal(f.tabs[0].url,'/pages/menu/menu')
})
test('云端固定题目优先于本机轮换，旧草稿不塞进新题目的答案框',async () => {
  const card = { ...daily.legacyCard(),question:'旧版本固定的题目' }
  const record = { ...card,mySubmitted:false,partnerSubmitted:true,revealed:false,myAnswer:'',partnerAnswer:'' }
  const f = fixture({ get:async () => ({ ok:true,paired:true,daily:record }) })
  f.storage.set('puppy_daily_draft_' + card.day,'原题草稿')
  await f.page.load()
  assert.equal(f.page.data.card.question,'旧版本固定的题目')
  assert.equal(f.page.data.answer,'原题草稿')
  const other = fixture()
  other.storage.set('puppy_daily_draft_' + card.day,'旧题草稿')
  await other.page.load()
  if (other.page.data.card.questionId !== card.questionId) assert.equal(other.page.data.answer,'')
})
test('答案发送失败保留草稿和原状态，不自行揭晓或显示已封好', async () => {
  const f = fixture({ answer:async () => ({ ok:false,reason:'service_unavailable' }) }); await f.page.load()
  f.page.onAnswer({ detail:{ value:'今天遇见小狗就想起你' } })
  await f.page.submit()
  assert.equal(f.page.data.daily.mySubmitted,false)
  assert.equal(f.page.data.daily.revealed,false)
  assert.equal(f.storage.get(f.page.draftKey(f.page.data.card.day)),'今天遇见小狗就想起你')
  assert.equal(f.toasts.some(item => /封好/.test(item.title)),false)
})
test('退出演示页面后晚到的答案结果不会改变新页面或清掉未确认草稿', async () => {
  let finish
  const f = fixture({ answer:() => new Promise(resolve => { finish = resolve }) }); await f.page.load()
  f.page.onAnswer({ detail:{ value:'想你啦' } })
  const pending = f.page.submit(); f.page.onUnload()
  finish({ ok:true,daily:{ ...f.record,mySubmitted:true,myAnswer:'想你啦' } })
  await pending
  assert.equal(f.page.data.daily.mySubmitted,false)
  assert.equal(f.storage.get(f.page.draftKey(f.page.data.card.day)),'想你啦')
  assert.equal(f.toasts.length,0)
})
