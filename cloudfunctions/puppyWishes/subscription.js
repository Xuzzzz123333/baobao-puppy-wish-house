const { fail } = require('./domain')
const { homeKey } = require('./home')
function createSubscription({ db,readDoc,getPair,cloud,config }) {
  const fields = config.fields || {}
  const ready = /^[\w-]{20,}$/.test(config.templateId || '') && Object.keys(fields).length > 0 && Object.entries(fields).every(([semantic,key]) =>
    ['title','content','name','time'].includes(semantic) && /^(thing|name|time)\d+$/.test(key) && (semantic === 'time' ? key.startsWith('time') : !key.startsWith('time'))) && new Set(Object.values(fields)).size === Object.keys(fields).length
  function settings(user) {
    const value = user && user.puppySubscription || {}
    return { ok:true,ready,templateId:ready ? config.templateId : '',enabled:ready && value.enabled === true,credits:ready ? Number(value.credits || 0) : 0 }
  }
  async function send(recipientId,notice) {
    const stamp = new Date(notice.createdAt + 8 * 3600000).toISOString().slice(0,16).replace('T',' ')
    const values = { title:notice.title,content:notice.summary || '小店里有一条新动态',name:notice.senderName,time:stamp },data = {}
    Object.entries(fields).forEach(([semantic,key]) => { data[key] = { value:Array.from(values[semantic]).slice(0,key.startsWith('name') ? 10 : (key.startsWith('time') ? 16 : 20)).join('') } })
    const result = await cloud.openapi.subscribeMessage.send({ touser:recipientId,templateId:config.templateId,
      page:'pages/inbox/inbox',miniprogramState:['developer','trial','formal'].includes(config.miniprogramState) ? config.miniprogramState : 'developer',lang:'zh_CN',data })
    const code = Number(result.errCode || result.errcode || 0)
    if (code) { const error = new Error('subscription_send_failed'); error.errCode = code; throw error }
  }
  async function testNotification(event,openid) {
    if (!ready) fail('template_required')
    if (!/^[\w-]{8,100}$/.test(event.requestId || '')) fail('invalid_request')
    const id = 'test:' + event.requestId
    const claimed = await db.runTransaction(async tx => {
      const user = await readDoc(tx,'users',openid)
      if (!user) fail('account_required')
      const value = user.puppySubscription || {},delivered = value.delivered || []
      if (delivered.includes(id)) return false
      if (!value.enabled || Number(value.credits || 0) < 1) fail('subscription_required')
      await tx.collection('users').doc(openid).update({ data:{ puppySubscription:{ ...value,credits:value.credits - 1,delivered:[id,...delivered].slice(0,100) } } })
      return true
    })
    if (!claimed) return { ok:true,duplicate:true }
    try {
      // 接收人始终为调用者，不接受客户端传来的 OpenID、正文或跳转地址。
      await send(openid,{ title:'小狗送信测试',summary:'宝宝的小狗心愿屋通知测试',senderName:'小狗送信员',createdAt:Date.now() })
      return { ok:true,submitted:true }
    } catch (error) {
      const code = Number(error.errCode || error.errcode || 0)
      console.warn('puppy subscription test failed',code || 'send_failed')
      return { ok:false,reason:'subscription_send_failed',code }
    }
  }
  async function handle(event,openid) {
    if (event.action === 'subscriptionSettings') return settings(await readDoc(db,'users',openid))
    if (event.action === 'subscriptionTest') return testNotification(event,openid)
    if (event.action === 'subscriptionGrant' && !ready) fail('template_required')
    if (event.action === 'subscriptionGrant' && !/^[\w-]{8,100}$/.test(event.requestId || '')) fail('invalid_request')
    return db.runTransaction(async tx => {
      const user = await readDoc(tx,'users',openid)
      if (!user) fail('account_required')
      const previous = user.puppySubscription || {}, grants = previous.grants || []
      const grant = event.action === 'subscriptionGrant'
      const value = grant ? { ...previous,enabled:true,credits:Math.min(30,Number(previous.credits || 0) + (grants.includes(event.requestId) ? 0 : 1)),grants:[event.requestId,...grants.filter(id => id !== event.requestId)].slice(0,30) } : { ...previous,enabled:false,credits:0,grants:[] }
      await tx.collection('users').doc(openid).update({ data:{ puppySubscription:value } })
      return settings({ puppySubscription:value })
    })
  }
  async function deliver(delivery,actorId) {
    if (!ready || !delivery || delivery.notice.kind !== 'wish') return
    try {
      // 业务记录已提交；订阅发送失败不会改变心愿结果。只消费一次，不自动重试。
      const granted = await db.runTransaction(async tx => {
        const pair = await getPair(tx,actorId,true)
        if (pair.otherId !== delivery.recipientId || homeKey(pair) !== delivery.session) return false
        const value = pair.partner.puppySubscription || {}
        const delivered = value.delivered || []
        if (!value.enabled || Number(value.credits || 0) < 1 || delivered.includes(delivery.notice.id)) return false
        await tx.collection('users').doc(pair.otherId).update({ data:{ puppySubscription:{ ...value,credits:value.credits - 1,delivered:[delivery.notice.id,...delivered].slice(0,100) } } })
        return true
      })
      if (!granted) return
      await send(delivery.recipientId,delivery.notice)
    } catch (error) { console.warn('puppy subscription unavailable',error.errCode || error.code || 'send_failed') }
  }
  return { handle,deliver }
}
module.exports = { createSubscription }
