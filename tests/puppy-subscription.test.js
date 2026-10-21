const test = require('node:test')
const assert = require('node:assert/strict')
const { createSubscription } = require('../cloudfunctions/puppyWishes/subscription')
const { homeKey } = require('../cloudfunctions/puppyWishes/home')
function fixture(config = { templateId:'template_123456789012345678901',fields:{ title:'thing1',content:'thing2',name:'name3',time:'time4' },miniprogramState:'trial' }) {
  const users = { a:{ role:'chef',pairedAt:100,partnerOpenid:'b' },b:{ role:'diner',pairedAt:100,partnerOpenid:'a' } },sent = []
  let queue = Promise.resolve(),reject = false,returnCode = 0
  const collection = () => ({ doc:id => ({ update:async ({ data }) => { Object.assign(users[id],structuredClone(data)) } }) })
  const db = { collection,runTransaction(work) { const next = queue.then(() => work({ collection })); queue = next.catch(() => {}); return next } }
  const getPair = async (_,id) => ({ me:users[id],partner:users[users[id].partnerOpenid],otherId:users[id].partnerOpenid,key:'pair' })
  const service = createSubscription({ db,readDoc:async (_,name,id) => users[id],getPair,config,cloud:{ openapi:{ subscribeMessage:{ send:async input => { sent.push(input); if (reject) throw { errCode:43101 }; return { errCode:returnCode } } } } } })
  const delivery = { recipientId:'b',session:homeKey({ me:users.a,partner:users.b,key:'pair' }),notice:{ id:'wish:one:0',kind:'wish',title:'店长送来心愿',summary:'一起看一会儿星星',senderName:'店长',createdAt:Date.now() } }
  return { ...service,users,sent,delivery,setReject:value => { reject = value },setReturnCode:value => { returnCode = value } }
}
test('未配置或字段不受支持时不申请发送，也不能伪造订阅额度',async () => {
  for (const config of [{ templateId:'',fields:{} },{ templateId:'template_123456789012345678901',fields:{ title:'bad1' } }]) {
    const f = fixture(config)
    assert.equal((await f.handle({ action:'subscriptionSettings' },'b')).ready,false)
    await assert.rejects(f.handle({ action:'subscriptionGrant',requestId:'test_request_001' },'b'),/template_required/)
    await f.deliver(f.delivery,'a'); assert.equal(f.sent.length,0)
  }
})
test('示例模板四字段正确，单账号测试只给调用者发送，重复测试不重复消费',async () => {
  const config = { templateId:'test_template_123456789012345',fields:{ name:'name1',title:'thing10',content:'thing2',time:'time3' },miniprogramState:'trial' },f = fixture(config)
  f.users.a.partnerOpenid = ''; f.users.b.partnerOpenid = ''
  await assert.rejects(f.handle({ action:'subscriptionTest',requestId:'test_self_send_01' },'a'),/subscription_required/)
  await f.handle({ action:'subscriptionGrant',requestId:'self_grant_01' },'a')
  const result = await f.handle({ action:'subscriptionTest',requestId:'test_self_send_01',touser:'b',content:'伪造内容' },'a')
  assert.equal(result.submitted,true); assert.equal(f.sent.length,1); assert.equal(f.sent[0].touser,'a')
  assert.equal(f.sent[0].templateId,config.templateId)
  assert.deepEqual(Object.keys(f.sent[0].data).sort(),['name1','thing10','thing2','time3'])
  assert.equal(f.sent[0].data.name1.value,'小狗送信员')
  assert.equal(f.sent[0].data.thing10.value,'小狗送信测试')
  assert.equal(f.sent[0].data.thing2.value,'宝宝的小狗心愿屋通知测试')
  assert.match(f.sent[0].data.time3.value,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.equal(f.users.a.puppySubscription.credits,0)
  assert.equal((await f.handle({ action:'subscriptionTest',requestId:'test_self_send_01' },'a')).duplicate,true)
  assert.equal(f.sent.length,1)
})
test('微信返回错误码或抛异常时测试显示失败，不声称已送达，也不自动重发',async () => {
  for (const thrown of [false,true]) {
    const f = fixture(); await f.handle({ action:'subscriptionGrant',requestId:'self_grant_01' },'a')
    if (thrown) f.setReject(true); else f.setReturnCode(47003)
    const result = await f.handle({ action:'subscriptionTest',requestId:'test_failed_01' },'a')
    assert.equal(result.ok,false); assert.equal(result.submitted,undefined)
    assert.equal(result.code,thrown ? 43101 : 47003); assert.equal(f.users.a.puppySubscription.credits,0)
    assert.equal((await f.handle({ action:'subscriptionTest',requestId:'test_failed_01' },'a')).duplicate,true)
    assert.equal(f.sent.length,1)
  }
})
test('只有另一方的新心愿使用授权；同一授权请求和同一通知重复调用不重复消费',async () => {
  const f = fixture()
  await f.deliver(f.delivery,'a'); assert.equal(f.sent.length,0)
  const grant = { action:'subscriptionGrant',requestId:'test_request_001' }
  await f.handle(grant,'b'); await f.handle(grant,'b')
  assert.equal(f.users.b.puppySubscription.credits,1)
  await f.deliver({ ...f.delivery,notice:{ ...f.delivery.notice,kind:'home' } },'a')
  assert.equal(f.sent.length,0)
  await Promise.all([f.deliver(f.delivery,'a'),f.deliver(f.delivery,'a')])
  assert.equal(f.sent.length,1); assert.equal(f.users.b.puppySubscription.credits,0)
  assert.equal(f.sent[0].touser,'b'); assert.equal(f.sent[0].miniprogramState,'trial')
  assert.equal(f.sent[0].page,'pages/inbox/inbox'); assert.equal(f.sent[0].data.thing2.value,'一起看一会儿星星')
})
test('解除绑定后不向旧对象发送；发送失败不抛回业务层，关闭后也不发送',async () => {
  const f = fixture(); await f.handle({ action:'subscriptionGrant',requestId:'test_request_001' },'b')
  f.users.a.pairedAt = 200; f.users.b.pairedAt = 200
  await f.deliver(f.delivery,'a'); assert.equal(f.sent.length,0)
  f.users.a.pairedAt = 100; f.users.b.pairedAt = 100; f.setReject(true)
  await f.deliver(f.delivery,'a'); assert.equal(f.sent.length,1)
  await f.handle({ action:'subscriptionGrant',requestId:'test_request_002' },'b')
  await f.handle({ action:'subscriptionDisable' },'b')
  await f.deliver({ ...f.delivery,notice:{ ...f.delivery.notice,id:'another' } },'a')
  assert.equal(f.sent.length,1)
})
