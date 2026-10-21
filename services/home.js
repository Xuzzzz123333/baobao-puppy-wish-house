const cloud = require('./cloud')
const demo = require('./demo')
const weather = [
  { id:'sun', icon:'☀', name:'晴天', text:'开心的事情，想第一个分享给你。', category:'ritual' },
  { id:'cloud', icon:'☁', name:'多云', text:'没有特别的事，就是想靠近你一点。', category:'company' },
  { id:'rain', icon:'☂', name:'小雨', text:'今天想被温柔接住，先抱抱也可以。', category:'comfort' },
  { id:'storm', icon:'ϟ', name:'打雷', text:'有点小情绪，我们慢慢说，不着急。', category:'comfort' }
]
const reactions = [
  { id:'hug', label:'抱抱你', icon:'🫂', text:'一个抱抱正在向你赶来，晴雨都陪着你。' },
  { id:'listen', label:'我听你说', icon:'☁', text:'慢慢说，我在呢。你的心情，我会认真听。' },
  { id:'cheer', label:'陪你开心', icon:'☀', text:'你的开心我也收到啦，想陪你一起笑。' }
]
const messages = { pair_required:'先在“我们”里牵手，再分享给另一半吧', mood_changed:'对方换了心情，刷新看看再回应吧',
  album_full:'相册装满啦，可以提高上限或先收起一张',album_limit_small:'先把照片减少到这个数量，再调整上限',invalid_limit:'相册上限可以选择 3、6 或 10 张',
  state_changed:'相册有了新变化，刷新后再试',invalid_caption:'照片留言请写在 40 字以内',content_review:'这句话暂时未能保存，请调整后重试',
  invalid_photo:'这张照片暂时读不了，请换一张 JPG 或 PNG', unknown_action:'请先重新部署 puppyWishes 云函数', service_unavailable:'暂时没连上小店，请稍后再试' }
async function call(action, data) {
  if (demo.enabled()) return demo.home(action,data)
  try { const response = await cloud.callFunction('puppyWishes',{ action,...data }); return response.result || { ok:false,reason:'service_unavailable' } }
  catch (error) { console.error('小店首页同步失败',action,error); return { ok:false,reason:'service_unavailable' } }
}
function decorateMood(mood) {
  if (!mood) return null
  const selected = weather.find(item => item.id === mood.weatherId)
  if (!selected) return null
  const reply = mood.reply && reactions.find(item => item.id === mood.reply.id)
  const date = new Date(mood.updatedAt)
  const updatedText = Number.isFinite(date.getTime()) ? `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}` : ''
  return { ...mood,...selected,updatedText,reply:reply ? { ...mood.reply,...reply } : null }
}
function clearPhoto(filePath) { if (filePath) { try { wx.getFileSystemManager().unlinkSync(filePath) } catch (_) {} } }
function clearPhotos(photos,keep = []) {
  const paths = new Set(keep.map(item => item.filePath))
  ;(photos || []).forEach(item => { if (item.filePath && !paths.has(item.filePath)) clearPhoto(item.filePath) })
}
async function getAlbum(owner = 'viewer') {
  const result = await call('photoAlbumGet')
  if (!result.ok) return result
  const photos = (result.photos || []).map(photo => {
    const { image,...metadata } = photo
    if (!image) return { ...metadata,filePath:'',error:true }
    const cacheOwner = ['home','us','viewer'].includes(owner) ? owner : 'viewer'
    const filePath = wx.env.USER_DATA_PATH + (result.demo ? '/puppy-demo-album-' : '/puppy-album-') + cacheOwner + '-' + photo.version.slice(0,16) + '.' + photo.type
    try { wx.getFileSystemManager().writeFileSync(filePath,image,'base64'); return { ...metadata,filePath,error:false } }
    catch (_) { return { ...metadata,filePath:'',error:true } }
  })
  return { ok:true,demo:result.demo,home:result.home,album:result.album,photos }
}
async function getPhoto() {
  const result = await call('photoGet')
  if (!result.ok || !result.photo) return result
  const filePath = wx.env.USER_DATA_PATH + (result.demo ? '/puppy-demo-couple-' : '/puppy-couple-') + result.photo.version.slice(0,12) + '.' + result.photo.type
  try {
    wx.getFileSystemManager().writeFileSync(filePath,result.photo.image,'base64')
    return { ok:true, photo:{ filePath,version:result.photo.version } }
  } catch (_) { return { ok:false,reason:'photo_local_error' } }
}
function api(method, data) { return new Promise((resolve,reject) => wx[method]({ ...data,success:resolve,fail:reject })) }
async function compressPhoto(input,isActive) {
  const info = await api('getImageInfo',{ src:input })
  let image
  for (const [quality,width] of [[65,1280],[55,960],[45,720],[35,640],[25,512],[20,384]]) {
    if (!isActive()) throw new Error('cancelled')
    const scale = Math.min(1,width / Math.max(info.width,info.height))
    const compressed = await api('compressImage',{ src:input,quality,compressedWidth:Math.max(1,Math.round(info.width * scale)),compressedHeight:Math.max(1,Math.round(info.height * scale)) })
    image = wx.getFileSystemManager().readFileSync(compressed.tempFilePath,'base64')
    if (image.length <= Math.ceil(64 * 1024 / 3) * 4) return { image }
  }
  throw new Error('photo_too_large')
}
async function choosePhotos(count = 1,options = {}) {
  const chosen = await api('chooseMedia',{ count:Math.max(1,Math.min(9,count)),mediaType:['image'],sourceType:['album'],sizeType:['compressed'] })
  if (!chosen.tempFiles || !chosen.tempFiles.length) return null
  const photos = [],failed = [],isActive = options.isActive || (() => true)
  for (let index = 0; index < chosen.tempFiles.length; index += 1) {
    if (!isActive()) return null
    if (options.onProgress) options.onProgress(index + 1,chosen.tempFiles.length)
    try { photos.push(await compressPhoto(chosen.tempFiles[index].tempFilePath,isActive)) }
    catch (error) { if (/cancel/i.test(error.errMsg || error.message || '')) return null; failed.push({ index,reason:error.message || 'invalid_photo' }) }
  }
  return { photos,failed }
}
async function choosePhoto() { const result = await choosePhotos(1); return result && result.photos[0] || null }
module.exports = { weather,reactions,decorateMood,clearPhoto,clearPhotos,getPhoto,getAlbum,choosePhoto,choosePhotos,
  message:reason => messages[reason] || (reason === 'photo_local_error' ? '照片没能打开，请重试' : '这次没能同步，请稍后再试'),
  get:() => call('homeGet'),setMood:weatherId => call('moodSet',{ weatherId }),
  react:(version,reactionId) => call('moodReact',{ version,reactionId }),
  savePhoto:image => call('photoSave',{ image }),removePhoto:() => call('photoRemove'),
  addPhoto:image => call('photoAdd',{ image }),deletePhoto:photoId => call('photoDelete',{ photoId }),
  orderPhotos:ids => call('photoOrder',{ ids }),setAlbumLimit:limit => call('photoLimit',{ limit }),
  captionPhoto:(photoId,caption) => call('photoCaption',{ photoId,caption }) }
