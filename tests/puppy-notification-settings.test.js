const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
function fixture(settings = { ok:true,ready:true,templateId:'template_id_123',enabled:true,credits:1 },testResult = { ok:true,submitted:true }) {
  const calls = [],modals = [],toasts = [],requests = []
  const inbox = { mode:() => 'real',async call(action,data) { calls.push({ action,data }); return action === 'subscriptionSettings' ? settings : (action === 'subscriptionTest' ? testResult : { ok:true }) } }
  const wx = { requestSubscribeMessage(options) { requests.push(options) },showToast:options => toasts.push(options),showModal:options => modals.push(options) }
  let definition
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../components/notification-settings/index.js'),'utf8'),{ Component:value => { definition = value },require:() => inbox,wx,console })
  const component = { ...definition.methods,data:structuredClone(definition.data),setData(patch) { Object.assign(this.data,patch) } }
  return { component,calls,requests,modals,toasts }
}
test('微信订阅从点击直接发起，只有 accept 才记录授权',async () => {
  const f = fixture(); await f.component.load(); f.calls.length = 0
  f.component.subscribe()
  assert.equal(f.requests.length,1); assert.equal(f.calls.length,0)
  await f.requests[0].success({ template_id_123:'reject' }); f.requests[0].complete()
  assert.equal(f.calls.length,0)
  f.component.subscribe()
  await f.requests[1].success({ template_id_123:'accept' }); f.requests[1].complete()
  assert.equal(f.calls.filter(item => item.action === 'subscriptionGrant').length,1)
})
test('自测需要授权，成功仅提示已提交并让用户到微信确认，失败展示错误码',async () => {
  const denied = fixture({ ok:true,ready:true,credits:0,enabled:false }); await denied.component.load()
  await denied.component.testNotification(); assert.equal(denied.calls.some(item => item.action === 'subscriptionTest'),false)
  const f = fixture(); await f.component.load(); await f.component.testNotification()
  assert.equal(f.modals[0].title,'测试通知已提交'); assert.match(f.modals[0].content,/服务通知/)
  const failed = fixture(undefined,{ ok:false,reason:'subscription_send_failed',code:47003 }); await failed.component.load(); await failed.component.testNotification()
  assert.equal(failed.modals[0].title,'测试还没发送成功'); assert.match(failed.modals[0].content,/47003/)
})
test('本机演示不会调起微信授权或发送测试通知',async () => {
  const f = fixture({ ok:true,demo:true,ready:false,credits:0,enabled:false }); await f.component.load()
  f.component.subscribe(); await f.component.testNotification()
  assert.equal(f.requests.length,0); assert.equal(f.calls.some(item => item.action === 'subscriptionTest'),false)
})
