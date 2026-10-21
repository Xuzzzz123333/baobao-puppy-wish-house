const domain = require('../data/wish-domain')
const { appendNotice,inboxView,readNotices } = require('../data/notices')
const { albumOf,albumView,changeAlbum,dayKey,cardForRecord,questionView } = require('../data/keepsakes')
const ACTIVE_KEY = 'puppy_demo_enabled'
const STATE_KEY = 'puppy_demo_state_v1'
const PHOTO_PREFIX = 'puppy_demo_photo_'
function fingerprint(image) {
  let a = 2166136261, b = 5381
  for (let index = 0; index < image.length; index += 1) { a = Math.imul(a ^ image.charCodeAt(index),16777619); b = Math.imul(b,33) ^ image.charCodeAt(index) }
  return (a >>> 0).toString(16).padStart(8,'0') + (b >>> 0).toString(16).padStart(8,'0')
}
const localKeys = ['puppy_wish_draft','puppy_weather','puppy_menu_category','puppy_notes_filter','puppy_direct_wish','puppy_direct_wish_note','puppy_open_wish']
function createDemo(storage) {
  const clone = value => JSON.parse(JSON.stringify(value))
  function fresh() { return { version:1,role:'chef',profiles:{ chef:{ nickname:'演示店长' },diner:{ nickname:'演示宝宝' } },wishes:[],moods:{},album:{ limit:10,items:[] },questions:{},startedAt:Date.now() } }
  function read() {
    const saved = storage.get(STATE_KEY)
    const state = saved && saved.version === 1 && ['chef','diner'].includes(saved.role) ? clone(saved) : fresh()
    if (!state.album) {
      state.album = { limit:10,items:[] }
      if (state.photo) {
        const id = fingerprint(state.photo.image)
        storage.set(PHOTO_PREFIX + id,{ ...state.photo,version:id })
        state.album.items.push({ id,caption:'' })
      }
      delete state.photo; save(state)
    }
    if (!state.questions) state.questions = {}
    return state
  }
  function save(state) { storage.set(STATE_KEY,state) }
  const enabled = () => storage.get(ACTIVE_KEY) === true
  const actor = role => 'demo_' + role
  const otherRole = role => role === 'chef' ? 'diner' : 'chef'
  const notify = (state,event) => appendNotice(state,state.role,state.profiles[state.role].nickname,event,event.at || Date.now())
  function account() {
    const state = read(), role = state.role, other = otherRole(role)
    return { demo:true,demoSession:String(state.startedAt),me:{ ...state.profiles[role],role },partner:{ ...state.profiles[other],role:other },cloudReady:false,inviteCode:'',inviteExpiresAt:null,pairedAt:null }
  }
  function homeState(state) {
    const role = state.role
    return { demo:true,paired:true,partnerName:state.profiles[otherRole(role)].nickname,
      me:state.moods[role] || null,partner:state.moods[otherRole(role)] || null,hasPhoto:state.album.items.length > 0,
      photoCount:state.album.items.length,albumLimit:state.album.limit }
  }
  function home(action,data = {}) {
    if (!enabled()) return { ok:false,reason:'demo_disabled' }
    try {
      const state = read(), role = state.role, other = otherRole(role), now = Date.now()
      if (action === 'photoGet') {
        const item = data.photoId ? state.album.items.find(item => item.id === data.photoId) : state.album.items[0]
        if (!item) return { ok:true,demo:true,photo:null }
        const photo = storage.get(PHOTO_PREFIX + item.id)
        return { ok:true,demo:true,photo:photo ? { ...photo,id:item.id,caption:item.caption || '' } : null }
      }
      if (action === 'photoAlbumGet') return { ok:true,demo:true,home:homeState(state),album:albumView(state),photos:state.album.items.map(item => ({ ...storage.get(PHOTO_PREFIX + item.id),id:item.id,version:item.id,caption:item.caption || '' })) }
      if (action === 'moodSet') {
        if (!['sun','cloud','rain','storm'].includes(data.weatherId)) domain.fail('invalid_weather')
        state.moods[role] = { weatherId:data.weatherId,updatedAt:now,version:now.toString(36) + '_' + Math.random().toString(36).slice(2),reply:null }
      } else if (action === 'moodReact') {
        if (!['hug','listen','cheer'].includes(data.reactionId)) domain.fail('invalid_reaction')
        const mood = state.moods[other]
        if (!mood || mood.version !== data.version) domain.fail('mood_changed')
        mood.reply = { id:data.reactionId,updatedAt:now }
      } else if (action.startsWith('photo')) {
        let photo = null
        if (['photoSave','photoAdd'].includes(action)) {
          const image = data.image
          if (typeof image !== 'string' || image.length > Math.ceil(64 * 1024 / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) domain.fail('invalid_photo')
          const type = image.startsWith('/9j/') ? 'jpg' : (image.startsWith('iVBORw0KGgo') ? 'png' : '')
          if (!type) domain.fail('invalid_photo')
          photo = { image,type,version:fingerprint(image) }
        }
        const changed = changeAlbum(state,{ ...data,action },photo,now)
        if (photo && !changed.duplicate) storage.set(PHOTO_PREFIX + photo.version,photo)
        state.album = changed.album
        if (!changed.duplicate) notify(state,{ id:'home:' + now + ':' + Math.random(),operation:action,summary:'点小狗，看看我们的小相册。' })
        save(state)
        changed.removed.forEach(item => storage.remove(PHOTO_PREFIX + item.id))
        return { ok:true,demo:true,home:homeState(state),album:albumView(state),duplicate:changed.duplicate }
      }
      else if (action !== 'homeGet') domain.fail('unknown_action')
      if (action !== 'homeGet') { notify(state,{ id:'home:' + now + ':' + Math.random(),operation:action,summary:action === 'moodSet' ? '看看对方今天的小天气。' : '对方回应了你的心情。' }); save(state) }
      return { ok:true,demo:true,home:homeState(state) }
    } catch (error) { return { ok:false,demo:true,reason:error.reason || 'service_unavailable' } }
  }
  function daily(action,data = {}) {
    if (!enabled()) return { ok:false,reason:'demo_disabled' }
    try {
      const state = read(), day = dayKey()
      const record = state.questions[day] || { answers:{} }
      const card = cardForRecord(record,day)
      if (action === 'questionAnswer') {
        if (data.day !== day || data.questionId !== card.questionId) domain.fail('day_changed')
        if (typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 300) domain.fail('invalid_answer')
        const text = data.answer.trim(), existing = record.answers[state.role]
        if (existing && existing.text !== text) domain.fail('answer_locked')
        record.card = card
        record.answers[state.role] = existing || { text,at:Date.now() }
        state.questions[day] = record
        if (!existing) notify(state,{ id:'daily:' + day + ':' + state.role,kind:'daily',operation:'questionAnswer',summary:'你们都回答后，小狗才会一起拆开答案。' })
        Object.keys(state.questions).sort().slice(0,-60).forEach(old => { delete state.questions[old] })
        save(state)
      } else if (action !== 'questionGet') domain.fail('unknown_action')
      return { ok:true,demo:true,paired:true,partnerName:state.profiles[otherRole(state.role)].nickname,daily:questionView(record,state.role,day) }
    } catch (error) { return { ok:false,demo:true,reason:error.reason || 'service_unavailable' } }
  }
  function wishes(action,data = {}) {
    if (!enabled()) return { ok:false,reason:'demo_disabled' }
    try {
      const state = read(), role = state.role, current = actor(role)
      if (action === 'get') {
        const wish = state.wishes.find(item => item.id === data.id)
        if (!wish) domain.fail('forbidden')
        return { ok:true,demo:true,wish:domain.publicWish(wish,current) }
      }
      if (action === 'list') {
        const offset = Math.max(0,Math.floor(Number(data.offset) || 0))
        const ordered = state.wishes.slice().sort((a,b) => b.createdAt - a.createdAt)
        return { ok:true,demo:true,paired:true,wishes:ordered.slice(offset,offset + 20).map(wish => domain.publicWish(wish,current)),hasMore:ordered.length > offset + 20,nextOffset:offset + 20 }
      }
      if (action === 'create') {
        const input = domain.validateCreate(data), id = actor(role) + '_' + data.requestId
        let wish = state.wishes.find(wish => wish.id === id)
        if (wish) return { ok:true,demo:true,duplicate:true,wish:domain.publicWish(wish,current) }
        const now = Date.now()
        wish = { ...input,id,creatorId:current,recipientId:actor(otherRole(role)),creatorName:state.profiles[role].nickname,
          recipientName:state.profiles[otherRole(role)].nickname,status:'waiting',createdAt:now,updatedAt:now,completedAt:null,
          timeline:[{ action:'create',byCreator:true,message:'这是一张本机演示纸条，切换身份后可以回应。',at:now }] }
        state.wishes.push(wish)
        notify(state,{ id:'wish:' + id + ':0',kind:'wish',operation:'create',targetId:id,summary:input.title,at:now })
        save(state)
        return { ok:true,demo:true,wish:domain.publicWish(wish,current) }
      }
      if (action === 'update') {
        const wish = state.wishes.find(wish => wish.id === data.id)
        if (!wish) domain.fail('forbidden')
        Object.assign(wish,domain.transition(wish,current,data.operation,data.message || '',Date.now()))
        notify(state,{ id:'wish:' + wish.id + ':' + wish.timeline.length,kind:'wish',operation:data.operation,targetId:wish.id,summary:data.message || wish.title,at:wish.updatedAt })
        save(state)
        return { ok:true,demo:true,wish:domain.publicWish(wish,current) }
      }
      domain.fail('unknown_action')
    } catch (error) { return { ok:false,demo:true,reason:error.reason || 'service_unavailable' } }
  }
  function inbox(action,data = {}) {
    if (!enabled()) return { ok:false,reason:'demo_disabled' }
    const state = read(),session = String(state.startedAt)
    if (action === 'inboxRead') {
      if (data.session !== session) return { ok:false,reason:'pair_required' }
      readNotices(state,state.role,Array.isArray(data.ids) ? data.ids.slice(0,50) : []); save(state)
    } else if (action !== 'inboxGet') return { ok:false,reason:'unknown_action' }
    return { ok:true,demo:true,paired:true,session,...inboxView(state,state.role) }
  }
  return { enabled,account,home,wishes,daily,inbox,
    key:base => enabled() ? 'puppy_demo_' + read().role + '_' + base : base,
    enter() { const state = read(); save(state); storage.set(ACTIVE_KEY,true); return account() },
    exit() { storage.remove(ACTIVE_KEY) },
    switchRole() { const state = read(); state.role = otherRole(state.role); save(state); return account() },
    saveNickname(value) {
      const nickname = typeof value === 'string' ? value.trim().slice(0,20) : ''
      if (!nickname) return { ok:false,reason:'empty_nickname' }
      const state = read(); state.profiles[state.role].nickname = nickname; save(state)
      return { ok:true,demo:true,synced:false,account:account() }
    },
    reset() {
      albumOf(read()).items.forEach(item => storage.remove(PHOTO_PREFIX + item.id))
      if (storage.keys) storage.keys().filter(key => key.startsWith('puppy_demo_') && ![ACTIVE_KEY,STATE_KEY].includes(key)).forEach(key => storage.remove(key))
      for (const role of ['chef','diner']) for (const key of localKeys) storage.remove('puppy_demo_' + role + '_' + key)
      save(fresh())
      return account()
    }
  }
}
const storage = {
  get:key => typeof wx === 'undefined' ? undefined : wx.getStorageSync(key),
  set:(key,value) => wx.setStorageSync(key,value),
  remove:key => wx.removeStorageSync(key),
  keys:() => typeof wx === 'undefined' ? [] : wx.getStorageInfoSync().keys
}
module.exports = { ...createDemo(storage),createDemo }
