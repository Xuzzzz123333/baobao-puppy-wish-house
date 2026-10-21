const { items, timeOptions } = require('./interaction-catalog')
const statuses = {
  waiting: '等一封回信', accepted: '接下这个心愿', scheduled: '约好晚一点',
  ready: '等你确认收到', completed: '已收进回忆', declined: '这次先放一放', cancelled: '心愿已收回'
}
function fail(reason) { const error = new Error(reason); error.reason = reason; throw error }
function clean(value, max, required) {
  if (typeof value !== 'string' || value.length > max) fail('invalid_text')
  const result = value.trim()
  if (required && !result) fail('message_required')
  return result
}
function validateCreate(input) {
  const template = items.find(item => item.id === input.templateId)
  if (!template) fail('invalid_template')
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(input.requestId || '')) fail('invalid_request')
  if (!timeOptions.includes(input.when)) fail('invalid_time')
  const choices = input.choices || {}
  if (typeof choices !== 'object' || Array.isArray(choices)) fail('invalid_option')
  if (Object.keys(choices).some(key => !template.options.some(option => option.key === key))) fail('invalid_option')
  const details = template.options.map(option => {
    if (!option.values.includes(choices[option.key])) fail('invalid_option')
    return { label: option.label, value: choices[option.key] }
  })
  const note = clean(input.note === undefined ? '' : input.note, 500, template.id === 'custom')
  return { templateId: template.id, title: template.title, icon: template.icon, category: template.category, details, when: input.when, note }
}
function transition(wish, actor, action, message, now) {
  const isCreator = wish.creatorId === actor
  const isRecipient = wish.recipientId === actor
  if (!isCreator && !isRecipient) fail('forbidden')
  const text = clean(message === undefined ? '' : message, 500, action === 'later' || action === 'reply')
  const allowed = {
    accept: { role: isRecipient, from: ['waiting', 'scheduled'], to: 'accepted', fallback: '收到啦，这个心愿我接下了。' },
    later: { role: isRecipient, from: ['waiting', 'accepted', 'scheduled'], to: 'scheduled' },
    decline: { role: isRecipient, from: ['waiting', 'accepted', 'scheduled'], to: 'declined', fallback: '这次先放一放，想换一种方式陪你。' },
    ready: { role: isRecipient, from: ['accepted'], to: 'ready', fallback: '心愿已经认真兑现，等你签收。' },
    complete: { role: isCreator, from: ['ready'], to: 'completed', fallback: '收到啦，把这次的小幸福收好。' },
    cancel: { role: isCreator, from: ['waiting', 'accepted', 'scheduled'], to: 'cancelled', fallback: '我先把这张小纸条收回啦。' },
    reply: { role: true, from: ['waiting', 'accepted', 'scheduled', 'ready'], to: wish.status }
  }
  const rule = allowed[action]
  if (!rule || !rule.role) fail('forbidden')
  if (!rule.from.includes(wish.status)) fail('state_changed')
  if ((wish.timeline || []).length >= 40) fail('too_many_replies')
  const entry = { action, byCreator: isCreator, message: text || rule.fallback || '', at: now }
  return { status: rule.to, updatedAt: now, timeline: (wish.timeline || []).concat(entry), completedAt: rule.to === 'completed' ? now : null }
}
function publicWish(wish, openid) {
  return {
    id: wish._id || wish.id, templateId: wish.templateId, title: wish.title, icon: wish.icon,
    details: wish.details, when: wish.when, note: wish.note, creatorName: wish.creatorName,
    recipientName: wish.recipientName, isCreator: wish.creatorId === openid, status: wish.status,
    statusText: statuses[wish.status] || '小纸条', createdAt: wish.createdAt,
    updatedAt: wish.updatedAt, completedAt: wish.completedAt || null, timeline: wish.timeline || []
  }
}
module.exports = { statuses, fail, validateCreate, transition, publicWish }
