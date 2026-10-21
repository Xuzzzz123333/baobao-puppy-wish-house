const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const domain = require('./domain')
const { createHomeHandler,HOME_ACTIONS,homeKey } = require('./home')
const { createDailyHandler } = require('./daily')
const { createInbox } = require('./inbox')
const { createSubscription } = require('./subscription')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COLLECTION = 'puppyWishes'
let collectionReady
async function ensureCollection() {
  if (!collectionReady) {
    collectionReady = db.createCollection(COLLECTION).catch(error => {
      if (!/exist|已存在/i.test(error.message || error.errMsg || '')) { collectionReady = null; throw error }
    })
  }
  return collectionReady
}
async function readDoc(reader, collection, id) {
  try { return (await reader.collection(collection).doc(id).get()).data || null } catch (error) {
    if (/not exist|not found|不存在|does not exist/i.test(error.message || error.errMsg || '')) return null
    throw error
  }
}
function pairKey(a, b) { return crypto.createHash('sha256').update([a, b].sort().join(':')).digest('hex') }
async function getPair(reader, openid, required) {
  const me = await readDoc(reader, 'users', openid)
  if (!me) domain.fail('account_required')
  if (!me.partnerOpenid) { if (required) domain.fail('pair_required'); return null }
  const partner = await readDoc(reader, 'users', me.partnerOpenid)
  if (!partner || partner.partnerOpenid !== openid) domain.fail('pair_required')
  if (Number(me.pairedAt || 0) !== Number(partner.pairedAt || 0)) domain.fail('pair_required')
  if (!['chef', 'diner'].includes(me.role) || !['chef', 'diner'].includes(partner.role) || me.role === partner.role) domain.fail('role_required')
  return { me, partner, otherId: me.partnerOpenid, key: pairKey(openid, me.partnerOpenid) }
}
function displayName(user) {
  return user.nickname && user.nickname !== '微信用户' ? user.nickname : (user.role === 'chef' ? '店长' : '宝宝')
}
function belongs(wish, pair, openid) {
  const pairedAt = Number(pair.me.pairedAt || 0)
  const sameBinding = wish && (wish.pairedAt === undefined ? Number(wish.createdAt || 0) >= pairedAt : Number(wish.pairedAt) === pairedAt)
  return sameBinding && wish.pairKey === pair.key && (
    (wish.creatorId === openid && wish.recipientId === pair.otherId) ||
    (wish.recipientId === openid && wish.creatorId === pair.otherId)
  )
}
async function checkText(openid, content) {
  if (!content.trim()) return
  const result = await cloud.openapi.security.msgSecCheck({ content, version: 2, scene: 1, openid })
  if (!result.result || result.result.suggest !== 'pass') domain.fail('content_review')
}
const handleHome = createHomeHandler({ db, collection:COLLECTION, getPair, readDoc, displayName,checkText })
const inbox = createInbox({ db,collection:COLLECTION,getPair,readDoc,displayName })
const subscriptions = createSubscription({ db,readDoc,getPair,cloud,config:require('./subscription.config') })
const handleDaily = createDailyHandler({ db,collection:COLLECTION,getPair,readDoc,displayName,checkText,prepareNotice:inbox.prepare })
async function dispatch(event = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { ok:false,reason:'invalid_request' }
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, reason: 'login_required' }
  try {
    await ensureCollection()
    if (['inboxGet','inboxRead'].includes(event.action)) return await inbox.handle(event,OPENID)
    if (['subscriptionSettings','subscriptionGrant','subscriptionDisable','subscriptionTest'].includes(event.action)) return await subscriptions.handle(event,OPENID)
    if (HOME_ACTIONS.includes(event.action)) return await handleHome(event, OPENID)
    if (['questionGet','questionAnswer'].includes(event.action)) return await handleDaily(event, OPENID)
    if (event.action === 'get') {
      if (!/^[a-f0-9]{64}$/.test(event.id || '')) domain.fail('invalid_request')
      const pair = await getPair(db,OPENID,true),wish = await readDoc(db,COLLECTION,event.id)
      if (!belongs(wish,pair,OPENID)) domain.fail('forbidden')
      return { ok:true,wish:domain.publicWish(wish,OPENID) }
    }
    if (event.action === 'list') {
      const pair = await getPair(db, OPENID, false)
      if (!pair) return { ok: true, paired: false, wishes: [], hasMore: false }
      const offset = Math.max(0, Math.min(10000, Math.floor(Number(event.offset) || 0)))
      const pairedAt = Number(pair.me.pairedAt || 0)
      const query = pairedAt > 0 ? { pairKey:pair.key,createdAt:db.command.gte(pairedAt) } : { pairKey:pair.key }
      const result = await db.collection(COLLECTION).where(query).orderBy('createdAt', 'desc').skip(offset).limit(21).get()
      const records = result.data || []
      const wishes = records.slice(0, 20).filter(wish => belongs(wish, pair, OPENID)).map(wish => domain.publicWish(wish, OPENID))
      return { ok: true, paired: true, wishes, hasMore: records.length > 20, nextOffset: offset + 20 }
    }
    if (event.action === 'create') {
      const input = domain.validateCreate(event)
      const originalPair = await getPair(db, OPENID, true)
      await checkText(OPENID, input.note)
      const id = crypto.createHash('sha256').update(OPENID + ':' + event.requestId).digest('hex')
      return await db.runTransaction(async transaction => {
        const pair = await getPair(transaction, OPENID, true)
        if (homeKey(pair) !== homeKey(originalPair)) domain.fail('pair_required')
        const existing = await readDoc(transaction, COLLECTION, id)
        if (existing) {
          if (!belongs(existing, pair, OPENID) || existing.creatorId !== OPENID) domain.fail('forbidden')
          return { ok: true, wish: domain.publicWish(existing, OPENID), duplicate: true }
        }
        const pairedAt = Number(pair.me.pairedAt || 0),now = Math.max(Date.now(),pairedAt)
        const data = { ...input, _openid: OPENID, pairKey: pair.key,pairedAt,creatorId: OPENID, recipientId: pair.otherId,
          creatorName: displayName(pair.me), recipientName: displayName(pair.partner),
          status: 'waiting', createdAt: now, updatedAt: now, completedAt: null,
          timeline: [{ action: 'create', byCreator: true, message: '小狗把心愿送到信箱啦。', at: now }] }
        const notice = await inbox.prepare(transaction,pair,OPENID,{ id:'wish:' + id + ':0',kind:'wish',operation:'create',targetId:id,summary:input.title || input.templateId,at:now })
        await transaction.collection(COLLECTION).doc(id).set({ data })
        await notice.commit()
        return { ok: true, wish: domain.publicWish({ ...data, _id: id }, OPENID),_delivery:notice.delivery }
      })
    }
    if (event.action === 'update') {
      if (!/^[a-f0-9]{64}$/.test(event.id || '')) domain.fail('invalid_request')
      if (typeof event.message !== 'string' || event.message.length > 500) domain.fail('invalid_text')
      const currentPair = await getPair(db, OPENID, true)
      const currentWish = await readDoc(db, COLLECTION, event.id)
      if (!belongs(currentWish, currentPair, OPENID)) domain.fail('forbidden')
      await checkText(OPENID, event.message)
      return await db.runTransaction(async transaction => {
        const pair = await getPair(transaction, OPENID, true)
        if (homeKey(pair) !== homeKey(currentPair)) domain.fail('pair_required')
        const wish = await readDoc(transaction, COLLECTION, event.id)
        if (!belongs(wish, pair, OPENID)) domain.fail('forbidden')
        const update = domain.transition(wish, OPENID, event.operation, event.message, Date.now())
        const notice = await inbox.prepare(transaction,pair,OPENID,{ id:'wish:' + event.id + ':' + update.timeline.length,kind:'wish',operation:event.operation,targetId:event.id,summary:event.message.trim() || wish.title,at:update.updatedAt })
        await transaction.collection(COLLECTION).doc(event.id).update({ data: update })
        await notice.commit()
        return { ok: true, wish: domain.publicWish({ ...wish, ...update }, OPENID),_delivery:notice.delivery }
      })
    }
    if (event.action === 'deletePersonalData') {
      let count = 0
      // 只删除本人参与的心愿；解除绑定之后仍可清理自己的记录。
      while (true) {
        const result = await db.collection(COLLECTION).where(db.command.or([{ creatorId: OPENID }, { recipientId: OPENID }])).limit(20).get()
        if (!result.data.length) break
        for (const wish of result.data) { await db.collection(COLLECTION).doc(wish._id).remove(); count += 1 }
      }
      return { ok: true, count }
    }
    return { ok: false, reason: 'unknown_action' }
  } catch (error) {
    if (!error.reason) console.error('puppyWishes action failed', event.action, error)
    return { ok: false, reason: error.reason || 'service_unavailable' }
  }
}
exports.main = async event => {
  const result = await dispatch(event)
  const delivery = result._delivery
  delete result._delivery
  if (delivery) await subscriptions.deliver(delivery,cloud.getWXContext().OPENID)
  return result
}
