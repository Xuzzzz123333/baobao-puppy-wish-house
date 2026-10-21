const { fail } = require('./wish-domain')
const ALBUM_LIMITS = [3,6,10]
const MAX_PHOTOS = 10
function albumOf(state = {}) {
  if (state.album && Array.isArray(state.album.items)) return { limit:ALBUM_LIMITS.includes(state.album.limit) ? state.album.limit : 10,items:state.album.items.map(item => ({ ...item })) }
  return { limit:10,items:state.photoVersion ? [{ id:state.photoVersion,caption:'',legacy:true }] : [] }
}
function albumView(state) {
  const album = albumOf(state)
  return { limit:album.limit,items:album.items.map((item,index) => ({ id:item.id,caption:item.caption || '',cover:index === 0 })) }
}
function changeAlbum(state,event,photo,now) {
  const album = albumOf(state), removed = []
  let duplicate = false
  if (['photoAdd','photoSave'].includes(event.action)) {
    if (album.items.some(item => item.id === photo.version)) duplicate = true
    else {
      const item = { id:photo.version,caption:'',updatedAt:now }
      if (event.action === 'photoSave' && album.items.length) removed.push(album.items.shift())
      if (album.items.length >= album.limit || album.items.length >= MAX_PHOTOS) fail('album_full')
      if (event.action === 'photoSave') album.items.unshift(item)
      else album.items.push(item)
    }
  } else if (['photoDelete','photoRemove'].includes(event.action)) {
    const id = event.action === 'photoRemove' ? album.items[0] && album.items[0].id : event.photoId
    const index = album.items.findIndex(item => item.id === id)
    if (index < 0 && id) fail('state_changed')
    if (index >= 0) removed.push(...album.items.splice(index,1))
  } else if (event.action === 'photoOrder') {
    const ids = event.ids
    if (!Array.isArray(ids) || ids.length !== album.items.length || new Set(ids).size !== ids.length || ids.some(id => !album.items.some(item => item.id === id))) fail('state_changed')
    album.items = ids.map(id => album.items.find(item => item.id === id))
  } else if (event.action === 'photoLimit') {
    if (!ALBUM_LIMITS.includes(event.limit)) fail('invalid_limit')
    if (album.items.length > event.limit) fail('album_limit_small')
    album.limit = event.limit
  } else if (event.action === 'photoCaption') {
    const item = album.items.find(item => item.id === event.photoId)
    if (!item) fail('state_changed')
    if (typeof event.caption !== 'string' || event.caption.length > 40) fail('invalid_caption')
    item.caption = event.caption.trim()
  } else fail('unknown_action')
  return { album,removed,duplicate }
}
const { questions,actions,questionThemes,legacyQuestions,legacyActions } = require('./daily-content')
function dayKey(now = Date.now()) { return new Date(now + 8 * 3600000).toISOString().slice(0,10) }
function dailyCard(day = dayKey()) {
  const number = Math.floor(Date.parse(day + 'T00:00:00+08:00') / 86400000)
  return cardAt(day,deck(questions.length,'puppy-questions-v2')[mod(number,questions.length)],deck(actions.length,'puppy-actions-v2')[mod(number,actions.length)])
}
const decks = {}
function mod(value,length) { return ((value % length) + length) % length }
function deck(length,salt) {
  const key = salt + ':' + length
  if (decks[key]) return decks[key]
  let seed = 2166136261
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0),16777619)
  const random = () => { seed += 0x6D2B79F5; let value = seed; value = Math.imul(value ^ value >>> 15,value | 1); value ^= value + Math.imul(value ^ value >>> 7,value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296 }
  const order = Array.from({ length },(_,index) => index)
  for (let index = length - 1; index > 0; index -= 1) { const other = Math.floor(random() * (index + 1)); [order[index],order[other]] = [order[other],order[index]] }
  decks[key] = order
  return order
}
function cardAt(day,q,a) {
  return { day,questionId:'q' + q,question:questions[q],questionTheme:questionThemes[q],pool:{ questions:questions.length,actions:actions.length },
    action:{ id:'a' + a,templateId:actions[a][0],title:actions[a][1],text:actions[a][2],icon:actions[a][3],theme:actions[a][4] } }
}
function legacyCard(day = dayKey()) {
  const number = Math.floor(Date.parse(day + 'T00:00:00+08:00') / 86400000)
  return cardAt(day,mod(number,legacyQuestions.length),mod(number,legacyActions.length))
}
function cardForRecord(record,day) {
  if (record && record.card && record.card.day === day) return record.card
  return record && record.answers && Object.keys(record.answers).length ? legacyCard(day) : dailyCard(day)
}
function questionView(record,role,day) {
  const answers = record && record.answers || {}, other = role === 'chef' ? 'diner' : 'chef'
  const mine = answers[role], partner = answers[other], revealed = !!(mine && partner)
  return { ...cardForRecord(record,day),myAnswer:mine ? mine.text : '',mySubmitted:!!mine,partnerSubmitted:!!partner,revealed,
    partnerAnswer:revealed ? partner.text : '',answeredAt:mine ? mine.at : null }
}
module.exports = { ALBUM_LIMITS,MAX_PHOTOS,albumOf,albumView,changeAlbum,dayKey,dailyCard,legacyCard,cardForRecord,questionView }
