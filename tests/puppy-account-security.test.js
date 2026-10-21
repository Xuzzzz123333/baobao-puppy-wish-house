const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
function fixture() {
  const tables = {},writes = []; let actor = 'alice',review = 'pass',readFailure = false,queue = Promise.resolve(),beforeTransaction = null
  const table = name => tables[name] || (tables[name] = new Map())
  const clone = value => structuredClone(value)
  function collection(name) {
    return { doc(id) { return {
      async get() { if (readFailure && name === 'users') throw new Error('network unavailable'); const value = table(name).get(id); if (!value) throw new Error('document does not exist'); return { data:{ ...clone(value),_id:id } } },
      async set({ data }) { table(name).set(id,clone(data)); writes.push([name,id,'set']) },
      async update({ data }) { assert.ok(table(name).has(id)); table(name).set(id,{ ...table(name).get(id),...clone(data) }); writes.push([name,id,'update']) },
      async remove() { table(name).delete(id); writes.push([name,id,'remove']) }
    } },where(query) {
      let limit = 100
      const matches = (data,condition) => Object.entries(condition).every(([key,value]) => data[key] === value)
      const chain = { limit(value) { limit = value; return chain },async get() { return { data:[...table(name)].filter(([,data]) => query.$or ? query.$or.some(condition => matches(data,condition)) : matches(data,query)).slice(0,limit).map(([id,data]) => ({ ...clone(data),_id:id })) } } }
      return chain
    } }
  }
  const db = { collection,serverDate:() => Date.now(),command:{ or:conditions => ({ $or:conditions }) },async createCollection(name) { table(name) },
    runTransaction(work) { const pending = queue.then(async () => { if (beforeTransaction) { const hook = beforeTransaction; beforeTransaction = null; hook() } return work({ collection }) }); queue = pending.catch(() => {}); return pending } }
  const cloud = { init() {},database:() => db,getWXContext:() => ({ OPENID:actor }),openapi:{ security:{ async msgSecCheck() { if (review === 'throw') throw new Error('security unavailable'); return review === 'missing' ? {} : { result:{ suggest:review } } } } },async deleteFile() {} }
  const filename = require.resolve('../cloudfunctions/coupleAccount'),originalLoad = Module._load
  delete require.cache[filename]
  let main
  try { Module._load = function(request,parent,isMain) { return request === 'wx-server-sdk' ? cloud : originalLoad.call(this,request,parent,isMain) }; main = require(filename).main }
  finally { Module._load = originalLoad }
  return { call:main,table,writes,setActor:value => { actor = value },setReview:value => { review = value },setReadFailure:value => { readFailure = value },beforeTransaction:hook => { beforeTransaction = hook } }
}
test('未登录、未知动作与非法请求不创建账号；临时读取失败不会覆盖已有账号',async () => {
  const f = fixture(); f.setActor('')
  assert.equal((await f.call({ action:'login' })).reason,'login_required'); assert.equal(f.writes.length,0)
  f.setActor('alice'); assert.equal((await f.call({ action:'forged_admin' })).reason,'unknown_action')
  assert.equal((await f.call(null)).reason,'invalid_request'); assert.equal(f.writes.length,0)
  f.table('users').set('alice',{ nickname:'原称呼',role:'chef',partnerOpenid:'bob',pairedAt:100 })
  f.setReadFailure(true); assert.equal((await f.call({ action:'login' })).reason,'service_unavailable')
  assert.equal(f.writes.length,0); assert.equal(f.table('users').get('alice').partnerOpenid,'bob')
})
test('昵称检查失败、结果缺失或风险判定均不落库，成功才更新',async () => {
  const f = fixture(); await f.call({ action:'login' })
  for (const review of ['throw','missing','review','risky']) {
    f.setReview(review)
    assert.equal((await f.call({ action:'updateProfile',nickname:'新的称呼' })).ok,false)
    assert.equal(f.table('users').get('alice').nickname,'微信用户')
  }
  f.setReview('pass'); assert.equal((await f.call({ action:'updateProfile',nickname:'宝宝的店长' })).ok,true)
  assert.equal(f.table('users').get('alice').nickname,'宝宝的店长')
  assert.equal((await f.call({ action:'updateProfile',nickname:{ name:'伪造' } })).reason,'invalid_nickname')
})
test('邀请码并发生成保持唯一有效码，绑定使用一次，绑定后不能改身份或再次发邀请',async () => {
  const f = fixture(); await f.call({ action:'setRole',role:'chef' })
  const [one,two] = await Promise.all([f.call({ action:'createInvite' }),f.call({ action:'createInvite' })])
  assert.equal(one.account.inviteCode,two.account.inviteCode); assert.match(one.account.inviteCode,/^[A-HJ-NP-Z2-9]{8}$/)
  assert.equal(f.table('inviteCodes').size,1)
  f.setActor('bob'); await f.call({ action:'setRole',role:'diner' })
  assert.equal((await f.call({ action:'bindInvite',inviteCode:one.account.inviteCode })).ok,true)
  assert.equal((await f.call({ action:'setRole',role:'chef' })).reason,'role_conflict')
  assert.equal((await f.call({ action:'createInvite' })).reason,'already_bound')
  f.setActor('eve'); await f.call({ action:'setRole',role:'diner' })
  assert.equal((await f.call({ action:'bindInvite',inviteCode:one.account.inviteCode })).reason,'code_used')
  assert.equal((await f.call({ action:'bindInvite',inviteCode:{ $ne:'' } })).reason,'invalid_code')
})
test('解除绑定的旧请求不会清掉刚建立的新关系；单边残留指针不暴露对方资料',async () => {
  const f = fixture()
  f.table('users').set('alice',{ role:'chef',nickname:'A',partnerOpenid:'bob',pairedAt:100 })
  f.table('users').set('bob',{ role:'diner',nickname:'B',partnerOpenid:'alice',pairedAt:100 })
  f.beforeTransaction(() => { f.table('users').get('alice').partnerOpenid = 'carol'; f.table('users').get('alice').pairedAt = 200 })
  assert.equal((await f.call({ action:'unbindPartner' })).reason,'state_changed')
  assert.equal(f.table('users').get('alice').partnerOpenid,'carol'); assert.equal(f.table('users').get('bob').partnerOpenid,'alice')
  f.table('users').set('carol',{ role:'diner',nickname:'不能泄露的称呼',partnerOpenid:'other',pairedAt:200 })
  const view = await f.call({ action:'login' }); assert.equal(view.account.partner,null)
  assert.equal(JSON.stringify(view).includes('不能泄露的称呼'),false)
})
test('直接删除账号也清理本人参与的心愿资料，陌生人的记录保留',async () => {
  const f = fixture(); await f.call({ action:'login' })
  f.table('puppyWishes').set('mine',{ creatorId:'alice',recipientId:'bob' }); f.table('puppyWishes').set('other',{ creatorId:'carol',recipientId:'dave' })
  const result = await f.call({ action:'deleteAccount',openid:'carol' })
  assert.equal(result.deleted,true); assert.equal(f.table('users').has('alice'),false)
  assert.equal(f.table('puppyWishes').has('mine'),false); assert.equal(f.table('puppyWishes').has('other'),true)
})
test('前端遵从昵称检查拒绝，不把被拒称呼保存成已同步资料',async () => {
  const filename = path.join(__dirname,'../services/account.js'),storage = new Map([['liangkou_account',{ me:{ nickname:'原称呼' },partner:null }],['liangkou_profile',{ nickname:'原称呼' }]])
  const module = { exports:{} },wx = { getStorageSync:key => structuredClone(storage.get(key)),setStorageSync:(key,value) => storage.set(key,structuredClone(value)) }
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{ module,exports:module.exports,require:() => ({ isConfigured:() => true,callFunction:async () => ({ result:{ ok:false,reason:'content_risky' } }) }),wx,console })
  const result = await module.exports.saveNickname('未通过的称呼')
  assert.equal(result.ok,false); assert.equal(storage.get('liangkou_account').me.nickname,'原称呼'); assert.equal(storage.get('liangkou_profile').nickname,'原称呼')
})
