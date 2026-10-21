const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const catalog = require('../data/interaction-catalog')
function makeMenu(account, create) {
  const file = path.join(__dirname,'../pages/menu/menu.js')
  const storage = new Map(), modals = [], toasts = [], tabData = { hidden:false }
  const service = { ...catalog,create,message:reason => reason }
  let definition
  const wx = { getStorageSync:key => storage.get(key),setStorageSync:(key,value) => storage.set(key,structuredClone(value)),
    removeStorageSync:key => storage.delete(key),showToast:data => toasts.push(data),showModal:data => modals.push(data),switchTab() {} }
  const localRequire = createRequire(file)
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{ getApp:() => ({ refreshAccount:async () => account }),require:name => name.endsWith('/services/wishes') ? service : localRequire(name),wx,Page:value => { definition = value },console })
  const page = { ...definition,data:structuredClone(definition.data),getTabBar:() => ({ setData:patch => Object.assign(tabData,patch) }),setData(patch) {
    for (const [key,value] of Object.entries(patch)) {
      const bits = key.split('.'); let target = this.data
      for (const bit of bits.slice(0,-1)) target = target[bit]
      target[bits[bits.length - 1]] = value
    }
  } }
  return { page,storage,modals,toasts,tabData }
}
const paired = { cloudReady:true,me:{ role:'chef' },partner:{ role:'diner' } }
test('心动盲盒转入心愿时保留具体行动内容，等待本人确认发送',() => {
  const f = makeMenu(paired,async () => { throw new Error('不能自动发送') })
  f.storage.set('puppy_direct_wish','hug'); f.storage.set('puppy_direct_wish_note','今日心动：抱抱充电\n请给我一个一分钟的拥抱。')
  f.page.onShow()
  assert.equal(f.page.data.selected.id,'hug')
  assert.match(f.page.data.note,/一分钟/)
  assert.equal(f.storage.has('puppy_direct_wish_note'),false)
})
test('失败保留草稿，成功确认后才显示送达，并沿用同一个重试标识', async () => {
  let ok = false
  const requests = []
  const fixture = makeMenu(paired,async input => { requests.push(input); return ok ? { ok:true } : { ok:false,reason:'service_unavailable' } })
  fixture.page.compose('hug')
  assert.equal(fixture.tabData.hidden,true)
  fixture.page.onNote({ detail:{ value:'今天想你啦' } })
  await fixture.page.sendWish()
  assert.equal(fixture.modals.length,0)
  assert.equal(fixture.storage.get('puppy_wish_draft').note,'今天想你啦')
  assert.ok(fixture.page.data.selected)
  assert.equal(fixture.page.data.submitting,false)
  assert.equal(fixture.tabData.hidden,true)
  ok = true
  await fixture.page.sendWish()
  assert.equal(requests[0].requestId,requests[1].requestId)
  assert.equal(fixture.storage.has('puppy_wish_draft'),false)
  assert.equal(fixture.page.data.selected,null)
  assert.equal(fixture.tabData.hidden,false)
  assert.equal(fixture.modals[0].title,'小狗把心愿送到信箱啦')
})
test('正在送信时再次点击不会发出第二个请求', async () => {
  let finish, calls = 0
  const fixture = makeMenu(paired,() => { calls += 1; return new Promise(resolve => { finish = resolve }) })
  fixture.page.compose('hug')
  const first = fixture.page.sendWish()
  fixture.page.closeSheet()
  assert.ok(fixture.page.data.selected)
  assert.equal(fixture.tabData.hidden,true)
  await new Promise(resolve => setImmediate(resolve))
  await fixture.page.sendWish()
  assert.equal(calls,1)
  assert.equal(fixture.modals.length,0)
  finish({ ok:true })
  await first
  assert.equal(fixture.modals.length,1)
})
test('尚未绑定时保留填写内容并引导邀请，不假装送达', async () => {
  let calls = 0
  const fixture = makeMenu({ ...paired,partner:null },async () => { calls += 1; return { ok:true } })
  fixture.page.compose('hug')
  await fixture.page.sendWish()
  assert.equal(calls,0)
  assert.ok(fixture.storage.has('puppy_wish_draft'))
  assert.equal(fixture.modals[0].title,'先把另一半请进小店')
})
test('弹窗关闭及页面切换恢复导航，回到草稿时再次收起导航', () => {
  const fixture = makeMenu(paired,async () => ({ ok:true }))
  fixture.page.compose('hug')
  fixture.page.onHide()
  assert.equal(fixture.tabData.hidden,false)
  fixture.page.onShow()
  assert.equal(fixture.tabData.hidden,true)
  fixture.page.closeSheet()
  assert.equal(fixture.tabData.hidden,false)
  assert.ok(fixture.storage.has('puppy_wish_draft'))
})
test('单账号演示可经过发送入口，明确提示纸条只在本机', async () => {
  let calls = 0
  const fixture = makeMenu({ ...paired,cloudReady:false,demo:true },async () => { calls += 1; return { ok:true,demo:true } })
  fixture.page.compose('hug')
  await fixture.page.sendWish()
  assert.equal(calls,1)
  assert.equal(fixture.modals[0].title,'演示纸条已存入本机信箱')
  assert.match(fixture.modals[0].content,/只保存在本机/)
  assert.equal(fixture.page.data.selected,null)
})
