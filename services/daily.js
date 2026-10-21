const cloud = require('./cloud')
const demo = require('./demo')
const { dailyCard,dayKey,legacyCard } = require('../data/keepsakes')
const messages = { pair_required:'先在“我们”里牵手，或进入单账号演示',day_changed:'新的一天开始啦，刷新看看今天的问题',
  answer_locked:'今天的答案已经封好，明天再写新的吧',invalid_answer:'写下 1 到 300 字的真心话吧',
  content_review:'这段文字暂时未能寄出，请调整后重试',unknown_action:'请先重新部署 puppyWishes 云函数',service_unavailable:'小狗暂时没连上，请稍后重试' }
async function call(action,data) {
  if (demo.enabled()) return demo.daily(action,data)
  try { const response = await cloud.callFunction('puppyWishes',{ action,...data }); return response.result || { ok:false,reason:'service_unavailable' } }
  catch (error) { console.error('双向小秘密暂不可用',error); return { ok:false,reason:'service_unavailable' } }
}
module.exports = { dailyCard,dayKey,legacyCard,get:() => call('questionGet'),answer:(day,questionId,answer) => call('questionAnswer',{ day,questionId,answer }),
  message:reason => messages[reason] || '这次没能收好，请稍后再试' }
