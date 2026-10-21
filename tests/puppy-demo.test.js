const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { createDemo } = require('../services/demo')
function fixture() {
  const saved = new Map(), copy = value => value === undefined ? undefined : structuredClone(value)
  const demo = createDemo({ get:key => copy(saved.get(key)),set:(key,value) => saved.set(key,copy(value)),remove:key => saved.delete(key),keys:() => [...saved.keys()] })
  return { demo,saved }
}
const valid = { templateId:'hug',requestId:'test_demo_request_123',choices:{ style:'紧紧抱住' },when:'今晚',note:'演示一下抱抱' }
test('演示未读信箱按身份分别保存，自己不收到提醒，重试不会重复提醒',() => {
  const { demo } = fixture(); demo.enter()
  const created = demo.wishes('create',valid); demo.wishes('create',valid)
  assert.equal(demo.inbox('inboxGet').unreadCount,0)
  demo.switchRole()
  const first = demo.inbox('inboxGet'); assert.equal(first.unreadCount,1)
  assert.equal(demo.wishes('get',{ id:created.wish.id }).wish.id,created.wish.id)
  assert.equal(demo.inbox('inboxRead',{ session:first.session,ids:[first.items[0].id] }).unreadCount,0)
  demo.wishes('update',{ id:created.wish.id,operation:'accept' }); demo.switchRole()
  assert.equal(demo.inbox('inboxGet').unreadCount,1)
  demo.reset(); assert.equal(demo.inbox('inboxGet').items.length,0)
  demo.exit(); assert.equal(demo.inbox('inboxGet').reason,'demo_disabled')
})
test('演示状态规则由云端规则同步，身份和草稿与真实账号分别保存', () => {
  const original = fs.readFileSync(path.join(__dirname,'../cloudfunctions/puppyWishes/domain.js'),'utf8')
  assert.equal(fs.readFileSync(path.join(__dirname,'../data/wish-domain.js'),'utf8'),original.replace("require('./catalog')","require('./interaction-catalog')"))
  assert.equal(fs.readFileSync(path.join(__dirname,'../data/keepsakes.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../cloudfunctions/puppyWishes/keepsakes.js'),'utf8').replace("require('./domain')","require('./wish-domain')"))
  const f = fixture()
  f.saved.set('liangkou_account',{ me:{ nickname:'真实店长' },partner:null })
  f.saved.set('puppy_wish_draft',{ note:'真实草稿' })
  assert.equal(f.demo.enabled(),false)
  const account = f.demo.enter()
  assert.equal(account.demo,true)
  assert.equal(account.cloudReady,false)
  assert.equal(account.me.role,'chef')
  assert.equal(account.partner.role,'diner')
  const chefDraft = f.demo.key('puppy_wish_draft')
  f.saved.set(chefDraft,{ note:'店长演示草稿' })
  f.demo.switchRole()
  assert.notEqual(f.demo.key('puppy_wish_draft'),chefDraft)
  f.demo.exit()
  assert.equal(f.demo.key('puppy_wish_draft'),'puppy_wish_draft')
  assert.equal(f.saved.get('puppy_wish_draft').note,'真实草稿')
  assert.equal(f.saved.get('liangkou_account').me.nickname,'真实店长')
})
test('单账号手动切换两方，走完发送、接下、兑现和确认；不自动制造回信', () => {
  const { demo } = fixture(); demo.enter()
  const created = demo.wishes('create',valid)
  assert.equal(created.ok,true)
  assert.equal(created.wish.status,'waiting')
  assert.equal(created.wish.timeline.length,1)
  const id = created.wish.id
  assert.equal(demo.wishes('create',valid).duplicate,true)
  assert.equal(demo.wishes('list').wishes.length,1)
  assert.equal(demo.wishes('update',{ id,operation:'accept' }).reason,'forbidden')
  demo.switchRole()
  assert.equal(demo.wishes('list').wishes[0].isCreator,false)
  assert.equal(demo.wishes('update',{ id,operation:'accept',message:'好呀' }).wish.status,'accepted')
  assert.equal(demo.wishes('update',{ id,operation:'ready' }).wish.status,'ready')
  assert.equal(demo.wishes('update',{ id,operation:'complete' }).reason,'forbidden')
  demo.switchRole()
  const completed = demo.wishes('update',{ id,operation:'complete' })
  assert.equal(completed.wish.status,'completed')
  assert.ok(completed.wish.completedAt)
  assert.equal(demo.wishes('update',{ id,operation:'reply',message:'再说一句' }).reason,'state_changed')
})
test('演示天气、回应与合照可跨身份查看，清空只清理演示', () => {
  const { demo,saved } = fixture(); demo.enter()
  saved.set('puppy_weather','storm'); saved.set('puppy_wish_draft',{ note:'真实内容' })
  saved.set(demo.key('puppy_wish_draft'),{ note:'演示内容' })
  const mood = demo.home('moodSet',{ weatherId:'rain' }).home.me
  assert.equal(demo.home('moodReact',{ version:mood.version,reactionId:'hug' }).reason,'mood_changed')
  const photo = '/9j/2Q=='
  assert.equal(demo.home('photoSave',{ image:photo }).ok,true)
  demo.switchRole()
  assert.equal(demo.home('homeGet').home.partner.weatherId,'rain')
  assert.equal(demo.home('photoGet').photo.image,photo)
  assert.equal(demo.home('moodReact',{ version:mood.version,reactionId:'hug' }).ok,true)
  demo.switchRole()
  assert.equal(demo.home('homeGet').home.me.reply.id,'hug')
  demo.home('moodSet',{ weatherId:'sun' })
  demo.switchRole()
  assert.equal(demo.home('moodReact',{ version:mood.version,reactionId:'hug' }).reason,'mood_changed')
  demo.reset()
  assert.equal(demo.enabled(),true)
  assert.equal(demo.wishes('list').wishes.length,0)
  assert.equal(demo.home('homeGet').home.me,null)
  assert.equal(demo.home('photoGet').photo,null)
  assert.equal(saved.has('puppy_demo_chef_puppy_wish_draft'),false)
  assert.equal(saved.get('puppy_weather'),'storm')
  assert.equal(saved.get('puppy_wish_draft').note,'真实内容')
})
function loadModule(relative,overrides,wx) {
  const file = path.join(__dirname,'..',relative), localRequire = createRequire(file), module = { exports:{} }
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{ module,exports:module.exports,require:name => overrides[name] || localRequire(name),wx,console })
  return module.exports
}
test('真实服务入口在演示中完全走本机，心愿、天气、照片均不调用云端', async () => {
  const { demo } = fixture(); demo.enter()
  let cloudCalls = 0
  const cloud = { callFunction:async () => { cloudCalls += 1; throw new Error('演示不应调用云端') } }
  const files = new Map()
  const wx = { env:{ USER_DATA_PATH:'/local' },getFileSystemManager:() => ({ writeFileSync:(file,image) => files.set(file,image),unlinkSync:file => files.delete(file) }) }
  const overrides = { './demo':demo,'./cloud':cloud }
  const wishes = loadModule('services/wishes.js',overrides,wx), home = loadModule('services/home.js',overrides,wx)
  assert.equal((await wishes.create(valid)).demo,true)
  demo.switchRole()
  const list = await wishes.list()
  assert.equal(list.wishes.length,1)
  assert.equal(list.wishes[0].isCreator,false)
  assert.equal((await home.setMood('cloud')).ok,true)
  assert.equal((await home.savePhoto('/9j/2Q==')).ok,true)
  const photo = await home.getPhoto()
  assert.match(photo.photo.filePath,/puppy-demo-couple-/)
  assert.equal(files.get(photo.photo.filePath),'/9j/2Q==')
  home.clearPhoto(photo.photo.filePath)
  assert.equal(files.size,0)
  assert.equal(cloudCalls,0)
})
test('App 的账号更新在演示中不会写真实账号，退出后恢复真实账号读取', async () => {
  const { demo } = fixture(); demo.enter()
  let calls = 0, definition
  const accountService = new Proxy({}, { get:(_,name) => async () => { calls += 1; return name === 'loadAccount' ? { me:{ nickname:'真实账号' },partner:null,cloudReady:true } : { ok:true } } })
  const file = path.join(__dirname,'../app.js'), localRequire = createRequire(file)
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{ App:value => { definition = value },require:name => name === './services/demo' ? demo : (name === './services/account' ? accountService : localRequire(name)),wx:{},console })
  const app = { ...definition,globalData:structuredClone(definition.globalData) }
  assert.equal((await app.refreshAccount()).demo,true)
  assert.equal((await app.saveNickname('演示称呼')).account.me.nickname,'演示称呼')
  for (const [method,input] of [['saveRole','diner'],['savePreferences',{}],['createInvite'],['bindPartner','SAMPLE00'],['revokeInvite'],['regenerateInvite'],['unbindPartner'],['deleteAccount']]) {
    assert.equal((await app[method](input)).reason,'demo_mode')
  }
  assert.equal(calls,0)
  demo.exit()
  assert.equal((await app.refreshAccount()).me.nickname,'真实账号')
  assert.equal(calls,1)
})
test('选择照片期间退出演示，晚到的压缩结果不会传到真实账号', async () => {
  let finish, saved = 0, definition
  const file = path.join(__dirname,'../pages/us/us.js'), localRequire = createRequire(file)
  const home = { choosePhotos:() => new Promise(resolve => { finish = resolve }),addPhoto:async () => { saved += 1; return { ok:true } },clearPhotos() {} }
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{ Page:value => { definition = value },getApp:() => ({}),
    require:name => name.endsWith('/services/home') ? home : localRequire(name),wx:{},clearInterval,console })
  const page = { ...definition,data:{ ...structuredClone(definition.data),partner:{ role:'diner' } },setData(patch) { Object.assign(this.data,patch) } }
  const pending = page.chooseCouplePhoto()
  page.onUnload()
  finish({ photos:[{ image:'/9j/2Q==' }],failed:[] })
  await pending
  assert.equal(saved,0)
})
test('演示十张相册分开保存，旧合照可迁移，重置清理照片与每日草稿', () => {
  const { demo,saved } = fixture()
  saved.set('puppy_demo_state_v1',{ version:1,role:'chef',profiles:{ chef:{ nickname:'演示店长' },diner:{ nickname:'演示宝宝' } },wishes:[],moods:{},photo:{ image:'/9j/2Q==',type:'jpg',version:'legacy' } })
  demo.enter()
  assert.equal(demo.home('photoAlbumGet').photos[0].image,'/9j/2Q==')
  for (let index = 0; index < 9; index += 1) assert.equal(demo.home('photoAdd',{ image:Buffer.from([255,216,255,index,255,217]).toString('base64') }).ok,true)
  assert.equal(demo.home('photoAlbumGet').photos.length,10)
  assert.equal(demo.home('photoAdd',{ image:Buffer.from([255,216,255,12,255,217]).toString('base64') }).reason,'album_full')
  assert.equal(demo.home('photoLimit',{ limit:3 }).reason,'album_limit_small')
  assert.equal(saved.has('puppy_demo_photo_legacy'),false)
  assert.ok([...saved.values()].every(value => Buffer.byteLength(JSON.stringify(value)) < 100000))
  saved.set(demo.key('puppy_daily_draft_2026-10-18'),'演示草稿')
  saved.set('puppy_daily_draft_2026-10-18','真实草稿')
  demo.reset()
  assert.equal([...saved.keys()].filter(key => key.startsWith('puppy_demo_photo_')).length,0)
  assert.equal(saved.has('puppy_demo_chef_puppy_daily_draft_2026-10-18'),false)
  assert.equal(saved.get('puppy_daily_draft_2026-10-18'),'真实草稿')
})
test('演示双向小秘密也要手动切换并分别提交，退出演示后服务停用', () => {
  const { demo } = fixture(); demo.enter()
  const card = require('../data/keepsakes').dailyCard(),input = { day:card.day,questionId:card.questionId }
  assert.equal(demo.daily('questionAnswer',{ ...input,answer:'店长的小秘密' }).daily.revealed,false)
  demo.switchRole()
  const waiting = demo.daily('questionGet')
  assert.equal(waiting.daily.partnerSubmitted,true)
  assert.equal(waiting.daily.partnerAnswer,'')
  assert.equal(demo.daily('questionAnswer',{ ...input,answer:'宝宝的小秘密' }).daily.partnerAnswer,'店长的小秘密')
  demo.exit()
  assert.equal(demo.daily('questionGet').reason,'demo_disabled')
})
test('批量选图保留比例，单张压缩失败不会丢掉其他选中的照片', async () => {
  const compressed = [],chosen = []
  const wx = {
    chooseMedia:options => { chosen.push(options.count); options.success({ tempFiles:[{ tempFilePath:'ok' },{ tempFilePath:'bad' }] }) },
    getImageInfo:options => options.src === 'bad' ? options.fail({ errMsg:'unsupported' }) : options.success({ width:4000,height:3000 }),
    compressImage:options => { compressed.push([options.compressedWidth,options.compressedHeight]); options.success({ tempFilePath:'compressed' }) },
    getFileSystemManager:() => ({ readFileSync:() => '/9j/2Q==' })
  }
  const home = loadModule('services/home.js',{},wx)
  const result = await home.choosePhotos(10)
  assert.deepEqual(chosen,[9])
  assert.deepEqual(compressed,[[1280,960]])
  assert.equal(result.photos.length,1)
  assert.equal(result.failed.length,1)
})
test('批量上传部分失败时说明真实数量，已经添加的照片保留', async () => {
  let definition,calls = 0
  const file = path.join(__dirname,'../pages/us/us.js'),localRequire = createRequire(file),modals = []
  const home = { choosePhotos:async () => ({ photos:[{ image:'first' },{ image:'second' }],failed:[{ reason:'invalid_photo' }] }),
    addPhoto:async () => { calls += 1; return { ok:true,duplicate:calls === 2 } },clearPhotos() {},
    getAlbum:async () => ({ ok:true,photos:[{ id:'one',filePath:'/local/one.jpg' }],album:{ limit:10 } }) }
  const wx = { showLoading() {},hideLoading() {},showToast() {},showModal:value => modals.push(value) }
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{ Page:value => { definition = value },getApp:() => ({}),wx,console,require:name => name.endsWith('/services/home') ? home : localRequire(name) })
  const page = { ...definition,data:{ ...structuredClone(definition.data),partner:{ role:'diner' } },setData(patch) { Object.assign(this.data,patch) } }
  await page.chooseCouplePhoto()
  assert.equal(calls,2)
  assert.equal(page.data.photoItems.length,1)
  assert.equal(page.data.photoBusy,false)
  assert.match(modals[0].title,/1 张/)
  assert.match(modals[0].content,/1 张未完成/)
  assert.match(modals[0].content,/1 张已经在相册里/)
})
