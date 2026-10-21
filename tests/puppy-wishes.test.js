const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const domain = require('../cloudfunctions/puppyWishes/domain')
const catalog = require('../cloudfunctions/puppyWishes/catalog')
const base = { creatorId:'alice', recipientId:'bob', status:'waiting', timeline:[] }
const valid = { templateId:'hug', requestId:'test_request_12345', choices:{ style:'紧紧抱住' }, when:'今晚', note:'今天想要抱抱' }
test('49 个条目在前后端一致，标识唯一，选项均有内容', () => {
  assert.equal(catalog.items.length,49)
  assert.equal(new Set(catalog.items.map(item => item.id)).size,49)
  assert.deepEqual(require('../data/interaction-catalog'),catalog)
  assert.equal(fs.readFileSync(path.join(__dirname,'../data/interaction-catalog.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../cloudfunctions/puppyWishes/catalog.js'),'utf8'))
  for (const item of catalog.items) assert.ok(item.options.every(option => option.values.length > 0))
})
test('云端采用自身目录，拒绝伪造选项、超长文字和空白自定义心愿', () => {
  assert.equal(domain.validateCreate({ ...valid, title:'伪造标题' }).title,'想要抱抱')
  for (const changed of [{ templateId:'fake' },{ choices:{ style:'不在目录里的选项' } },{ choices:{ style:'紧紧抱住', forged:'yes' } },{ when:'假的时间' },{ note:'a'.repeat(501) },{ templateId:'custom', choices:{ style:'我写在小纸条里' }, note:'  ' }]) {
    assert.throws(() => domain.validateCreate({ ...valid,...changed }))
  }
})
test('双方只能执行属于自己的动作，第三个人不能操作', () => {
  assert.throws(() => domain.transition(base,'outsider','accept','',1),/forbidden/)
  assert.throws(() => domain.transition(base,'alice','accept','',1),/forbidden/)
  assert.throws(() => domain.transition({ ...base,status:'ready' },'bob','complete','',1),/forbidden/)
  assert.throws(() => domain.transition(base,'bob','complete','',1),/forbidden/)
})
test('接下、兑现和发起人确认后才会成为回忆，晚点与拒绝也有真实状态', () => {
  const accepted = { ...base,...domain.transition(base,'bob','accept','我来啦',2) }
  assert.equal(accepted.status,'accepted')
  assert.equal(accepted.completedAt,null)
  const ready = { ...accepted,...domain.transition(accepted,'bob','ready','抱过啦',3) }
  assert.equal(ready.status,'ready')
  assert.equal(ready.completedAt,null)
  const complete = domain.transition(ready,'alice','complete','收到，开心',4)
  assert.equal(complete.status,'completed')
  assert.equal(complete.completedAt,4)
  assert.throws(() => domain.transition({ ...ready,...complete },'alice','reply','又一句',5),/state_changed/)
  assert.equal(domain.transition(base,'bob','later','今晚九点好吗',2).status,'scheduled')
  assert.throws(() => domain.transition(base,'bob','later','  ',2),/message_required/)
  assert.equal(domain.transition(base,'bob','decline','今天不方便',2).status,'declined')
})
test('返回前端的数据不包含双方 OpenID 和内部配对标识', () => {
  const result = domain.publicWish({ ...base, pairKey:'private', _openid:'alice', _id:'id' },'alice')
  for (const key of ['creatorId','recipientId','pairKey','_openid']) assert.ok(!(key in result))
  assert.equal(result.isCreator,true)
})

// 隔离的数据库替身验证云函数边界，不会连接、写入真实环境。
test('云函数：防重复、串改隔离、解除绑定失效、内容检查失败不落库', async () => {
  let actor = 'alice', suggest = 'pass'
  const tables = { users:new Map([
    ['alice',{ nickname:'A',role:'chef',partnerOpenid:'bob' }],
    ['bob',{ nickname:'B',role:'diner',partnerOpenid:'alice' }],
    ['eve',{ nickname:'E',role:'diner',partnerOpenid:'other' }],
    ['other',{ nickname:'O',role:'chef',partnerOpenid:'eve' }]
  ]), puppyWishes:new Map() }
  const copy = value => JSON.parse(JSON.stringify(value))
  function collection(name) {
    return { doc(id) { return {
      async get() { const data = tables[name].get(id); return { data:data ? { ...copy(data),_id:id } : null } },
      async set({ data }) { tables[name].set(id,copy(data)) },
      async update({ data }) { tables[name].set(id,{ ...tables[name].get(id),...copy(data) }) },
      async remove() { tables[name].delete(id) }
    } },
    where(query) {
      let offset = 0, limit = 100
      const matches = (doc,condition) => Object.entries(condition).every(([key,value]) => value && typeof value === 'object' && '$gte' in value ? doc[key] >= value.$gte : doc[key] === value)
      const api = { orderBy() { return api },skip(n) { offset = n; return api },limit(n) { limit = n; return api },
        async get() { return { data:[...tables[name]].map(([id,data]) => ({ ...copy(data),_id:id })).filter(doc => query.$or ? query.$or.some(condition => matches(doc,condition)) : matches(doc,query)).sort((a,b) => b.createdAt - a.createdAt).slice(offset,offset + limit) } } }
      return api
    } }
  }
  let queue = Promise.resolve()
  const db = { collection, command:{ or:conditions => ({ $or:conditions }),gte:value => ({ $gte:value }) }, async createCollection() { throw new Error('collection already exists') },
    runTransaction(work) { const result = queue.then(() => work({ collection })); queue = result.catch(() => {}); return result } }
  const cloud = { init() {},database:() => db,getWXContext:() => ({ OPENID:actor }),openapi:{ security:{ msgSecCheck:async () => ({ result:{ suggest } }) } } }
  const originalLoad = Module._load
  let main
  try {
    Module._load = function(request,parent,isMain) {
      if (request === 'wx-server-sdk') return cloud
      if (request === './subscription.config') return { templateId:'test_template_123456789012345',fields:{ name:'name1',title:'thing10',content:'thing2',time:'time3' },miniprogramState:'trial' }
      return originalLoad.call(this,request,parent,isMain)
    }
    main = require('../cloudfunctions/puppyWishes').main
  } finally { Module._load = originalLoad }
  const first = await main({ action:'create',...valid })
  assert.equal(first.ok,true)
  const again = await main({ action:'create',...valid })
  assert.equal(again.wish.id,first.wish.id)
  assert.equal(tables.puppyWishes.size,2) // 心愿和私有首页通知状态各一条；重试不新增。
  assert.equal((await main({ action:'inboxGet' })).unreadCount,0)
  actor = 'eve'
  assert.equal((await main({ action:'update',id:first.wish.id,operation:'accept',message:'' })).reason,'forbidden')
  assert.equal((await main({ action:'list' })).wishes.length,0)
  actor = 'bob'
  let inbox = await main({ action:'inboxGet' })
  assert.equal(inbox.unreadCount,1)
  assert.equal(inbox.items[0].targetId,first.wish.id)
  assert.equal(JSON.stringify(inbox).includes('alice'),false)
  assert.equal((await main({ action:'get',id:first.wish.id })).ok,true)
  assert.equal((await main({ action:'inboxRead',session:'wrong',ids:[inbox.items[0].id] })).reason,'pair_required')
  assert.equal((await main({ action:'inboxRead',session:inbox.session,ids:[inbox.items[0].id] })).unreadCount,0)
  assert.equal((await main({ action:'update',id:first.wish.id,operation:'accept',message:'' })).ok,true)
  actor = 'alice'
  inbox = await main({ action:'inboxGet' })
  assert.equal(inbox.unreadCount,1)
  assert.match(inbox.items[0].title,/接住/)
  assert.equal((await main({ action:'subscriptionSettings' })).ready,true)
  assert.equal((await main({ action:'subscriptionTest',requestId:'no_grant_test_123' })).reason,'subscription_required')
  actor = 'bob'
  tables.users.set('bob',{ ...tables.users.get('bob'),partnerOpenid:'' })
  assert.equal((await main({ action:'update',id:first.wish.id,operation:'ready',message:'' })).reason,'pair_required')
  tables.users.set('bob',{ ...tables.users.get('bob'),partnerOpenid:'alice' })
  actor = 'alice'; suggest = 'risky'
  assert.equal((await main({ action:'create',...valid,requestId:'another_request_12345' })).reason,'content_review')
  assert.equal(tables.puppyWishes.size,2)
  assert.equal((await main({ action:'moodSet',weatherId:'rain' })).ok,true)
  assert.equal((await main({ action:'photoSave',image:Buffer.from([255,216,255,217]).toString('base64') })).ok,true)
  assert.equal((await main({ action:'list' })).wishes.length,1)
  assert.equal(tables.puppyWishes.size,3)
  const card = require('../data/keepsakes').dailyCard()
  suggest = 'pass'
  assert.equal((await main({ action:'questionAnswer',day:card.day,questionId:card.questionId,answer:'测试今天的真心话' })).ok,true)
  assert.equal((await main({ action:'list' })).wishes.length,1)
  assert.equal(tables.puppyWishes.size,4)
  const nextBinding = Date.now() + 1000
  for (const id of ['alice','bob']) tables.users.set(id,{ ...tables.users.get(id),pairedAt:nextBinding })
  assert.equal((await main({ action:'list' })).wishes.length,0)
  assert.equal((await main({ action:'get',id:first.wish.id })).reason,'forbidden')
  assert.equal((await main({ action:'update',id:first.wish.id,operation:'reply',message:'新绑定不能回复旧心愿' })).reason,'forbidden')
  const newWish = await main({ action:'create',...valid,requestId:'new_binding_request_123' })
  assert.equal(newWish.ok,true)
  assert.equal((await main({ action:'list' })).wishes.length,1)
  // 兼容尚未带 pairedAt 的旧版文档，仅属于本次绑定时间范围的记录可见。
  tables.puppyWishes.set('e'.repeat(64),{ ...tables.puppyWishes.get(newWish.wish.id),pairedAt:undefined,createdAt:nextBinding + 1 })
  assert.equal((await main({ action:'get',id:'e'.repeat(64) })).ok,true)
  tables.users.set('bob',{ ...tables.users.get('bob'),pairedAt:nextBinding + 1 })
  assert.equal((await main({ action:'list' })).reason,'pair_required')
  tables.users.set('bob',{ ...tables.users.get('bob'),pairedAt:nextBinding })
  assert.equal((await main(null)).reason,'invalid_request')
  const removed = await main({ action:'deletePersonalData' })
  assert.equal(removed.ok,true)
  assert.equal(tables.puppyWishes.size,0)
})
