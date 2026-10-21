const crypto = require('crypto')
const { homeKey } = require('./home')
const { fail } = require('./domain')
const { appendNotice,inboxView,readNotices } = require('./notices')
function createInbox({ db,collection,getPair,readDoc,displayName }) {
  async function prepare(reader,pair,openid,event) {
    const id = 'home_' + homeKey(pair)
    const state = await readDoc(reader,collection,id) || { creatorId:openid,recipientId:pair.otherId,moods:{} }
    delete state._id; delete state._openid
    const notice = appendNotice(state,pair.me.role,displayName(pair.me),event,event.at || Date.now())
    return { delivery:notice ? { notice,recipientId:pair.otherId,session:homeKey(pair) } : null,
      commit:async () => { if (notice) await reader.collection(collection).doc(id).set({ data:state }) } }
  }
  async function handle(event,openid) {
    const pair = await getPair(db,openid,false)
    if (!pair) return { ok:true,paired:false,items:[],unreadCount:0 }
    const session = homeKey(pair), id = 'home_' + session
    if (event.action === 'inboxGet') return { ok:true,paired:true,session,...inboxView(await readDoc(db,collection,id),pair.me.role) }
    if (!Array.isArray(event.ids) || event.ids.length > 50 || event.ids.some(id => typeof id !== 'string' || id.length > 180)) fail('invalid_request')
    return db.runTransaction(async tx => {
      const current = await getPair(tx,openid,true)
      if (homeKey(current) !== session || event.session !== session) fail('pair_required')
      const state = await readDoc(tx,collection,id)
      if (!state) return { ok:true,paired:true,session,items:[],unreadCount:0 }
      delete state._id; delete state._openid
      readNotices(state,current.me.role,event.ids)
      await tx.collection(collection).doc(id).set({ data:state })
      return { ok:true,paired:true,session,...inboxView(state,current.me.role) }
    })
  }
  return { handle,prepare,id:() => crypto.randomBytes(12).toString('hex') }
}
module.exports = { createInbox }
