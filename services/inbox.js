const cloud = require('./cloud')
const demo = require('./demo')
const { formatDate } = require('./wishes')
const listeners = new Set()
let current = { ok:true,items:[],unreadCount:0,session:'' },identity = '',pending = null,lastRead = 0
function mode() {
  if (demo.enabled()) { const a = demo.account(); return 'demo:' + a.me.role + ':' + a.demoSession }
  const a = typeof getApp === 'function' && getApp().globalData ? getApp().globalData.account : {}
  return 'real:' + (a.me && a.me.role || '') + ':' + (a.pairedAt || '') + ':' + !!a.partner
}
async function call(action,data = {}) {
  if (demo.enabled()) {
    if (action.startsWith('subscription')) return { ok:true,ready:false,demo:true,enabled:false,credits:0 }
    return demo.inbox(action,data)
  }
  try { const response = await cloud.callFunction('puppyWishes',{ ...data,action }); return response.result || { ok:false } }
  catch (_) { return { ok:false,reason:'service_unavailable' } }
}
function publish(result) {
  if (result.session && result.session === current.session && Number(result.revision || 0) < Number(current.revision || 0)) return current
  current = { ...result,items:(result.items || []).map(item => ({ ...item,dateText:formatDate(item.createdAt) })) }
  listeners.forEach(listener => listener(current))
  return current
}
function resetIfChanged() {
  const next = mode()
  if (next !== identity) { identity = next; pending = null; lastRead = 0; publish({ ok:true,items:[],unreadCount:0,session:'' }) }
  return next
}
async function refresh(force = false) {
  if (typeof getApp === 'function') { const app = getApp(); if (app.refreshAccount) await app.refreshAccount() }
  const key = resetIfChanged()
  if (pending) return pending
  if (!force && Date.now() - lastRead < 3000) return current
  const request = call('inboxGet').then(result => {
    if (mode() !== key || identity !== key) return { ok:false,reason:'mode_changed' }
    if (!result.ok) return result
    lastRead = Date.now(); return publish(result)
  }).finally(() => { if (pending === request) pending = null })
  pending = request
  return request
}
async function markRead(ids) {
  const key = resetIfChanged(),session = current.session
  if (!session || !ids.length) return current
  const result = await call('inboxRead',{ session,ids:ids.slice(0,50) })
  if (key === mode() && key === identity && result.ok && result.session === session) publish(result)
  return result
}
function open(item) {
  if (item.kind === 'wish' && item.targetId) {
    wx.setStorageSync(demo.key('puppy_open_wish'),item.targetId)
    wx.switchTab({ url:'/pages/matches/matches' })
  } else if (item.kind === 'daily') wx.navigateTo({ url:'/pages/daily/daily' })
  else wx.switchTab({ url:'/pages/index/index' })
}
module.exports = { refresh,markRead,open,call,mode,
  snapshot() { resetIfChanged(); return current },
  subscribe(listener) { resetIfChanged(); listeners.add(listener); listener(current); return () => listeners.delete(listener) },
  async readWish(id,seenAt) {
    const key = mode(); await refresh()
    if (mode() !== key) return { ok:false,reason:'mode_changed' }
    return markRead(current.items.filter(item => item.kind === 'wish' && item.targetId === id && !item.readAt && item.createdAt <= Number(seenAt || 0)).map(item => item.id))
  }
}
