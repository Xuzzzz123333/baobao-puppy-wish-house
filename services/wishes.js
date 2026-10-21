const cloud = require('./cloud')
const demo = require('./demo')
const catalog = require('../data/interaction-catalog')
const messages = {
  pair_required: '先在“我们”里邀请另一半进店吧', role_required: '先在“我们”里选择宝宝和店长',
  account_required: '账号还没准备好，请重新进入小店', login_required: '请重新进入小店后再试',
  state_changed: '纸条有了新进展，请刷新后再试', forbidden: '这张纸条暂时不能这样操作',
  content_review: '这段文字暂时未能发送，请调整后重试', message_required: '给对方留一句话吧',
  too_many_replies: '这张纸条已经写满，重新写一张吧', invalid_text: '小纸条请写在 500 字以内',
  service_unavailable: '小狗暂时没能送达，请稍后重试'
}
async function call(action, data) {
  if (demo.enabled()) return demo.wishes(action,data)
  try {
    const response = await cloud.callFunction('puppyWishes', { action, ...data })
    return response.result || { ok: false, reason: 'service_unavailable' }
  } catch (error) {
    console.error('小狗心愿服务暂不可用', error)
    return { ok: false, reason: 'service_unavailable' }
  }
}
function formatDate(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const today = date.toDateString() === new Date().toDateString()
  return `${today ? '今天' : `${date.getMonth() + 1}月${date.getDate()}日`} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function decorate(wish) {
  return { ...wish, dateText: formatDate(wish.createdAt),
    detailText: (wish.details || []).map(item => item.value).join(' · '),
    lastReply: (wish.timeline || []).filter(item => item.action !== 'create').slice(-1)[0] || null,
    timeline: (wish.timeline || []).map(item => ({ ...item, dateText: formatDate(item.at) })) }
}
module.exports = {
  ...catalog, decorate, formatDate,
  message: reason => messages[reason] || '这次没能送达，请稍后再试',
  list: async offset => { const result = await call('list', { offset: offset || 0 }); if (result.ok) result.wishes = result.wishes.map(decorate); return result },
  create: data => call('create', data),
  get: id => call('get',{ id }),
  update: (id, operation, message) => call('update', { id, operation, message: message || '' }),
  deletePersonalData: () => call('deletePersonalData', {})
}
