const crypto = require('crypto')
const { fail } = require('./domain')
const { albumOf,albumView,changeAlbum } = require('./keepsakes')
const { appendNotice } = require('./notices')
const HOME_ACTIONS = ['homeGet','moodSet','moodReact','photoGet','photoAlbumGet','photoSave','photoRemove','photoAdd','photoDelete','photoOrder','photoLimit','photoCaption']
const weatherIds = ['sun','cloud','rain','storm']
const reactionIds = ['hug','listen','cheer']
// Base64 后约 86 KiB，为小程序的函数文本请求留出封装余量。
const MAX_PHOTO_BYTES = 64 * 1024
function homeKey(pair) {
  if (Number(pair.me.pairedAt || 0) !== Number(pair.partner.pairedAt || 0)) fail('pair_required')
  return crypto.createHash('sha256').update(pair.key + ':' + Number(pair.me.pairedAt || 0)).digest('hex')
}
function photoInput(image) {
  if (typeof image !== 'string' || !image || image.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) fail('invalid_photo')
  const buffer = Buffer.from(image,'base64')
  if (buffer.toString('base64') !== image || buffer.length > MAX_PHOTO_BYTES) fail('invalid_photo')
  let type
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) type = 'jpg'
  else if (buffer.length >= 24 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type = 'png'
  else fail('invalid_photo')
  return { image, type, version:crypto.createHash('sha256').update(buffer).digest('hex') }
}
function publicMood(value) {
  if (!value || !weatherIds.includes(value.weatherId)) return null
  return { weatherId:value.weatherId, version:value.version, updatedAt:value.updatedAt,
    reply:value.reply && reactionIds.includes(value.reply.id) ? { id:value.reply.id, updatedAt:value.reply.updatedAt } : null }
}
function publicHome(pair, state, displayName) {
  const moods = state && state.moods || {}
  const album = albumOf(state || {})
  return { paired:true, partnerName:displayName(pair.partner), me:publicMood(moods[pair.me.role]),
    partner:publicMood(moods[pair.partner.role]), hasPhoto:album.items.length > 0,photoCount:album.items.length,albumLimit:album.limit }
}
function createHomeHandler({ db, collection, getPair, readDoc, displayName,checkText = async () => {} }) {
  return async function handle(event, openid) {
    const pair = await getPair(db,openid,event.action !== 'homeGet')
    if (!pair) return { ok:true, home:{ paired:false, me:null, partner:null, hasPhoto:false,photoCount:0,albumLimit:10 } }
    const key = homeKey(pair), stateId = 'home_' + key, photoId = 'photo_' + key
    if (event.action === 'homeGet') {
      const state = await readDoc(db,collection,stateId)
      return { ok:true, home:publicHome(pair,state,displayName) }
    }
    const fileId = item => item.legacy ? photoId : 'album_' + key + '_' + item.id
    if (['photoGet','photoAlbumGet'].includes(event.action)) {
      const state = await readDoc(db,collection,stateId), album = albumOf(state || {})
      if (event.action === 'photoGet') {
        const item = event.photoId ? album.items.find(item => item.id === event.photoId) : album.items[0]
        if (!item) { if (event.photoId) fail('forbidden'); return { ok:true,photo:null } }
        const photo = await readDoc(db,collection,fileId(item))
        return { ok:true,photo:photo ? { id:item.id,caption:item.caption || '',image:photo.image,type:photo.type,version:photo.version } : null }
      }
      const photos = await Promise.all(album.items.map(async item => {
        const photo = await readDoc(db,collection,fileId(item))
        return { id:item.id,caption:item.caption || '',image:photo ? photo.image : '',type:photo ? photo.type : 'jpg',version:item.id }
      }))
      return { ok:true,home:publicHome(pair,state,displayName),album:albumView(state || {}),photos }
    }
    if (event.action === 'moodSet' && !weatherIds.includes(event.weatherId)) fail('invalid_weather')
    if (event.action === 'moodReact' && (!reactionIds.includes(event.reactionId) || !/^[a-f0-9]{24}$/.test(event.version || ''))) fail('invalid_reaction')
    const photo = ['photoSave','photoAdd'].includes(event.action) ? photoInput(event.image) : null
    if (event.action === 'photoCaption') {
      if (typeof event.caption !== 'string' || event.caption.length > 40) fail('invalid_caption')
      await checkText(openid,event.caption)
    }
    return db.runTransaction(async transaction => {
      const latest = await getPair(transaction,openid,true)
      if (homeKey(latest) !== key) fail('pair_required')
      const previous = await readDoc(transaction,collection,stateId)
      if (previous) { delete previous._id; delete previous._openid }
      // 不设置 pairKey，首页资料不会混入心愿列表；参与人字段用于统一删除。
      const state = previous || { creatorId:openid, recipientId:latest.otherId, moods:{}, photoVersion:'' }
      const now = Date.now()
      const notice = () => appendNotice(state,latest.me.role,displayName(latest.me),{ id:'home:' + crypto.randomBytes(12).toString('hex'),operation:event.action,
        summary:event.action === 'moodSet' ? ({ sun:'今天是晴天',cloud:'今天有点多云',rain:'今天下起小雨',storm:'今天需要被接住' }[event.weatherId]) : (event.action === 'moodReact' ? { hug:'给你一个抱抱',listen:'我在，想说什么都可以',cheer:'今天也站在你这边' }[event.reactionId] : '点小狗，看看我们的小相册。') },now)
      if (event.action === 'moodSet') {
        state.moods = { ...state.moods, [latest.me.role]:{ weatherId:event.weatherId, version:crypto.randomBytes(12).toString('hex'), updatedAt:now, reply:null } }
      } else if (event.action === 'moodReact') {
        const mood = state.moods[latest.partner.role]
        if (!mood || mood.version !== event.version) fail('mood_changed')
        state.moods = { ...state.moods, [latest.partner.role]:{ ...mood, reply:{ id:event.reactionId, updatedAt:now } } }
      } else if (event.action.startsWith('photo')) {
        const changed = changeAlbum(state,event,photo,now)
        const existing = await Promise.all(changed.removed.map(item => readDoc(transaction,collection,fileId(item))))
        if (photo && !changed.duplicate) await transaction.collection(collection).doc('album_' + key + '_' + photo.version).set({ data:{ ...photo,creatorId:state.creatorId,recipientId:state.recipientId,updatedAt:now } })
        for (let index = 0; index < changed.removed.length; index += 1) if (existing[index]) await transaction.collection(collection).doc(fileId(changed.removed[index])).remove()
        state.album = changed.album
        state.photoVersion = changed.album.items[0] ? changed.album.items[0].id : ''
        if (!changed.duplicate) notice()
        await transaction.collection(collection).doc(stateId).set({ data:{ ...state,updatedAt:now } })
        return { ok:true,home:publicHome(latest,state,displayName),album:albumView(state),duplicate:changed.duplicate }
      } else fail('unknown_action')
      notice()
      await transaction.collection(collection).doc(stateId).set({ data:{ ...state, updatedAt:now } })
      return { ok:true, home:publicHome(latest,state,displayName) }
    })
  }
}
module.exports = { createHomeHandler, photoInput, MAX_PHOTO_BYTES,homeKey,HOME_ACTIONS }
