// 同时供云端和本机演示使用；通知只发给另一方，保留每人最近 50 条。
const MAX_NOTICES = 50
function appendNotice(state, role, senderName, event, now = Date.now()) {
  const other = role === 'chef' ? 'diner' : 'chef'
  const titles = { create:'送来一个新心愿',accept:'接住了你的心愿',ready:'把心愿准备好啦',complete:'确认了这次心动',later:'想和你商量时间',decline:'回应了你的心愿',cancel:'收起了一个心愿',reply:'给你留了一句话',
    moodSet:'更新了心情天气',moodReact:'接住了你的心情',photoAdd:'放进了新的合照',photoSave:'更新了合照',photoDelete:'整理了小相册',photoRemove:'整理了小相册',photoCaption:'给合照留了一句话',photoOrder:'调整了合照顺序',photoLimit:'调整了相册上限',questionAnswer:'回答了今日默契问题' }
  if (!titles[event.operation]) return null
  state.notices = state.notices || {}
  const items = state.notices[other] || []
  if (items.some(item => item.id === event.id)) return null
  const notice = { id:event.id,kind:event.kind || 'home',title:senderName + titles[event.operation],senderName,
    summary:String(event.summary || '').slice(0,100),targetId:event.targetId || '',createdAt:now,readAt:0 }
  state.notices[other] = [notice,...items].slice(0,MAX_NOTICES)
  state.noticeRevision = Number(state.noticeRevision || 0) + 1
  return notice
}
function inboxView(state, role) {
  const items = state && state.notices && state.notices[role] || []
  return { items,unreadCount:items.filter(item => !item.readAt).length,revision:Number(state && state.noticeRevision || 0) }
}
function readNotices(state, role, ids, now = Date.now()) {
  const selected = new Set(ids)
  state.notices = state.notices || {}
  state.notices[role] = (state.notices[role] || []).map(item => selected.has(item.id) ? { ...item,readAt:item.readAt || now } : item)
  state.noticeRevision = Number(state.noticeRevision || 0) + 1
}
module.exports = { MAX_NOTICES,appendNotice,inboxView,readNotices }
