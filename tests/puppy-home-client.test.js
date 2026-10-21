const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const home = require('../services/home')
function fixture(overrides = {}) {
  const file = path.join(__dirname,'../pages/index/index.js'), localRequire = createRequire(file)
  const storage = new Map(), toasts = [], cleared = [], previews = [], tab = { hidden:false }
  const service = { ...home,clearPhoto:filePath => { if (filePath) cleared.push(filePath) },clearPhotos:photos => (photos || []).forEach(photo => { if (photo.filePath) cleared.push(photo.filePath) }),...overrides }
  let definition
  const wx = { getStorageSync:key => storage.get(key),setStorageSync:(key,value) => storage.set(key,value),showToast:value => toasts.push(value),previewImage:value => previews.push(value) }
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{ getApp:() => ({}),wx,require:name => name.endsWith('/services/home') ? service : localRequire(name),Page:value => { definition = value },console,setTimeout,clearTimeout })
  const page = { ...definition,data:structuredClone(definition.data),setData(patch) { Object.assign(this.data,patch) },getTabBar:() => ({ setData:patch => Object.assign(tab,patch) }) }
  return { page,storage,toasts,cleared,previews,tab }
}
test('天气分享失败只保存在本机，不显示送达或沿用旧回应', async () => {
  const f = fixture({ setMood:async () => ({ ok:false,reason:'service_unavailable' }) })
  f.page.data.paired = true
  f.page.data.myMood = { weatherId:'sun',reply:{ id:'hug' } }
  await f.page.chooseWeather({ currentTarget:{ dataset:{ id:'rain' } } })
  assert.equal(f.storage.get('puppy_weather'),'rain')
  assert.equal(f.page.data.selectedWeather,'rain')
  assert.equal(f.page.data.myMood,null)
  assert.match(f.page.data.weatherSyncHint,/本机/)
  assert.equal(f.toasts.some(toast => /分享好啦/.test(toast.title)),false)
  assert.equal(f.page.data.moodSaving,false)
})
test('未绑定时不会向云端分享天气', async () => {
  let calls = 0
  const f = fixture({ setMood:async () => { calls += 1 } })
  await f.page.chooseWeather({ currentTarget:{ dataset:{ id:'cloud' } } })
  assert.equal(calls,0)
  assert.match(f.toasts[0].title,/本机/)
})
test('回应携带当前天气版本，成功后采用云端状态', async () => {
  const requests = []
  const f = fixture({ react:async (version,id) => { requests.push({ version,id }); return { ok:true,home:{ paired:true,me:null,partner:{ weatherId:'rain',version,updatedAt:1,reply:{ id,updatedAt:2 } },partnerName:'宝宝',hasPhoto:false } } } })
  f.page.data.partnerMood = { weatherId:'rain',version:'current-version' }
  await f.page.reactToWeather({ currentTarget:{ dataset:{ id:'hug' } } })
  assert.deepEqual(requests,[{ version:'current-version',id:'hug' }])
  assert.equal(f.page.data.partnerMood.reply.id,'hug')
  assert.equal(f.page.data.reactionSaving,false)
})
test('合照尚在加载时关闭弹窗，晚到的图片会清理且不会重开弹窗', async () => {
  let resolve
  const f = fixture({ getAlbum:() => new Promise(done => { resolve = done }) })
  f.page.data.paired = true
  const pending = f.page.openPhoto()
  assert.equal(f.tab.hidden,true)
  f.page.closePhoto()
  assert.equal(f.tab.hidden,false)
  resolve({ ok:true,photos:[{ id:'first',filePath:'/private/photo.jpg' }] })
  await pending
  assert.equal(f.page.data.showPhoto,false)
  assert.equal(f.page.data.photoPath,'')
  assert.deepEqual(f.cleared,['/private/photo.jpg'])
})
test('相册播放可暂停、切换与放大，关闭时清理全部临时照片并恢复导航', async () => {
  const photos = [{ id:'one',filePath:'/private/one.jpg',caption:'第一次约会' },{ id:'two',filePath:'/private/two.jpg',caption:'一起看夕阳' }]
  const f = fixture({ getAlbum:async () => ({ ok:true,photos }) }); f.page.data.paired = true
  await f.page.openPhoto()
  assert.equal(f.page.data.photoItems.length,2)
  assert.equal(f.page.data.photoPlaying,true)
  f.page.onPhotoChange({ detail:{ current:1 } })
  f.page.togglePhotoPlaying()
  assert.equal(f.page.data.photoPlaying,false)
  f.page.previewPhoto({ currentTarget:{ dataset:{ index:1 } } })
  assert.equal(f.previews[0].current,'/private/two.jpg')
  f.page.closePhoto()
  assert.equal(f.tab.hidden,false)
  assert.deepEqual(f.cleared,['/private/one.jpg','/private/two.jpg'])
  assert.equal(f.page.data.photoItems.length,0)
})
