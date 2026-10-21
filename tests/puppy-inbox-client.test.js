const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { appendNotice,inboxView } = require('../data/notices')
function fixture() {
  const file = path.join(__dirname,'../services/inbox.js'),localRequire = createRequire(file),module = { exports:{} },calls = [],storage = new Map(),navigations = []
  let provider = async () => ({ ok:true,session:'one',items:[],unreadCount:0,revision:0 }),demoEnabled = false
  const app = { globalData:{ account:{ me:{ role:'chef' },partner:{ role:'diner' },pairedAt:100 } },async refreshAccount() { return this.globalData.account } }
  const demo = { enabled:() => demoEnabled,account:() => ({ me:{ role:'diner' },demoSession:'demo-session' }),key:base => demoEnabled ? 'demo_' + base : base,
    inbox:action => ({ ok:true,demo:true,session:'demo',items:[],unreadCount:0,action }) }
  const cloud = { async callFunction(name,data) { calls.push(data); return { result:await provider(data) } } }
  const wx = { setStorageSync:(key,value) => storage.set(key,value),switchTab:value => navigations.push(value),navigateTo:value => navigations.push(value) }
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{ module,exports:module.exports,require:name => name === './cloud' ? cloud : (name === './demo' ? demo : localRequire(name)),wx,getApp:() => app,console })
  return { service:module.exports,calls,app,storage,navigations,setProvider:value => { provider = value },setDemo:value => { demoEnabled = value } }
}
const notice = { id:'wish:1:0',kind:'wish',title:'宝宝送来一个新心愿',targetId:'wish1',summary:'抱抱',readAt:0,createdAt:100 }
test('进入页面获取提醒不自动已读，点通知准确跳到对应纸条',async () => {
  const f = fixture(),updates = []
  f.setProvider(async () => ({ ok:true,session:'one',items:[notice],unreadCount:1,revision:1 }))
  const unsubscribe = f.service.subscribe(value => updates.push(value))
  await f.service.refresh()
  assert.equal(updates.at(-1).unreadCount,1)
  assert.equal(f.calls.some(item => item.action === 'inboxRead'),false)
  f.service.open(notice)
  assert.equal(f.storage.get('puppy_open_wish'),'wish1')
  assert.equal(f.navigations.at(-1).url,'/pages/matches/matches')
  unsubscribe()
})
test('迟到的刷新结果不会把已经读过的通知重新标为未读',async () => {
  const f = fixture()
  f.setProvider(async () => ({ ok:true,session:'one',items:[notice],unreadCount:1,revision:1 }))
  await f.service.refresh()
  let finish
  f.setProvider(data => data.action === 'inboxRead' ? Promise.resolve({ ok:true,session:'one',items:[{ ...notice,readAt:200 }],unreadCount:0,revision:2 }) : new Promise(resolve => { finish = resolve }))
  const pending = f.service.refresh(true)
  await new Promise(resolve => setImmediate(resolve))
  await f.service.markRead([notice.id])
  finish({ ok:true,session:'one',items:[notice],unreadCount:1,revision:1 }); await pending
  assert.equal(f.service.snapshot().unreadCount,0)
})
test('打开旧版本纸条只标记该版本已看到的动态，新回信继续保留未读',async () => {
  const f = fixture(),later = { ...notice,id:'wish:1:2',createdAt:200 }
  f.setProvider(async data => data.action === 'inboxRead' ? { ok:true,session:'one',items:[{ ...notice,readAt:300 },later],unreadCount:1,revision:3 } : { ok:true,session:'one',items:[notice,later],unreadCount:2,revision:2 })
  await f.service.readWish('wish1',100)
  const read = f.calls.find(item => item.action === 'inboxRead')
  assert.deepEqual(Array.from(read.ids),[notice.id])
  assert.equal(f.service.snapshot().unreadCount,1)
})
test('切换关系后丢弃旧通知结果；本机演示不会调用正式云函数或申请微信订阅',async () => {
  const f = fixture(); let finish
  f.setProvider(() => new Promise(resolve => { finish = resolve }))
  const pending = f.service.refresh(true); await new Promise(resolve => setImmediate(resolve))
  f.app.globalData.account.pairedAt = 200
  finish({ ok:true,session:'old',items:[notice],unreadCount:1 }); await pending
  assert.equal(f.service.snapshot().unreadCount,0)
  f.setDemo(true); const before = f.calls.length
  assert.equal((await f.service.refresh(true)).demo,true)
  assert.equal((await f.service.call('subscriptionSettings')).ready,false)
  assert.equal((await f.service.call('subscriptionGrant')).demo,true)
  assert.equal(f.calls.length,before)
})
test('每人保留最近 50 条且重复事件不占位置，通知内容不含另一方的私密答案',() => {
  const state = {}
  for (let i = 0; i < 60; i += 1) appendNotice(state,'chef','店长',{ id:'event' + i,operation:'questionAnswer',kind:'daily',summary:'两人回答后揭晓' },i + 1)
  const before = state.noticeRevision
  appendNotice(state,'chef','店长',{ id:'event59',operation:'questionAnswer' },100)
  assert.equal(state.noticeRevision,before)
  assert.equal(inboxView(state,'diner').items.length,50)
  assert.equal(inboxView(state,'diner').unreadCount,50)
  assert.equal(inboxView(state,'chef').unreadCount,0)
  assert.equal(inboxView(state,'diner').items.at(-1).id,'event10')
})
