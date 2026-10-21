const { fail } = require('./domain')
const { homeKey } = require('./home')
const { dayKey,cardForRecord,questionView } = require('./keepsakes')
function createDailyHandler({ db,collection,getPair,readDoc,displayName,checkText,prepareNotice }) {
  return async function handle(event,openid) {
    const day = dayKey(), pair = await getPair(db,openid,event.action !== 'questionGet')
    if (!pair) return { ok:true,paired:false,daily:questionView(null,'chef',day) }
    const key = homeKey(pair), id = 'question_' + key + '_' + day
    const view = (record,current) => ({ ok:true,paired:true,partnerName:displayName(current.partner),daily:questionView(record,current.me.role,day) })
    if (event.action === 'questionGet') return view(await readDoc(db,collection,id),pair)
    const original = await readDoc(db,collection,id)
    if (event.day !== day || event.questionId !== cardForRecord(original,day).questionId) fail('day_changed')
    if (typeof event.answer !== 'string' || !event.answer.trim() || event.answer.length > 300) fail('invalid_answer')
    const text = event.answer.trim()
    await checkText(openid,text)
    return db.runTransaction(async transaction => {
      const current = await getPair(transaction,openid,true)
      if (homeKey(current) !== key || dayKey() !== day) fail('day_changed')
      const previous = await readDoc(transaction,collection,id)
      const card = cardForRecord(previous,day)
      if (event.questionId !== card.questionId) fail('day_changed')
      const answers = previous && previous.answers || {}
      if (answers[current.me.role]) {
        if (answers[current.me.role].text !== text) fail('answer_locked')
        return view(previous,current)
      }
      answers[current.me.role] = { text,at:Date.now() }
      const record = { creatorId:previous ? previous.creatorId : openid,recipientId:previous ? previous.recipientId : current.otherId,day,card,answers }
      const notice = prepareNotice ? await prepareNotice(transaction,current,openid,{ id:'daily:' + day + ':' + current.me.role,kind:'daily',operation:'questionAnswer',summary:'你们都回答后，小狗才会一起拆开答案。' }) : null
      await transaction.collection(collection).doc(id).set({ data:record })
      if (notice) await notice.commit()
      return view(record,current)
    })
  }
}
module.exports = { createDailyHandler }
