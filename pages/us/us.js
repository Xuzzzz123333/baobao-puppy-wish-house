const app = getApp()
const accounts = require('../../services/account')
const wishes = require('../../services/wishes')
const shop = require('../../config/shop')
const { setModalOpen } = require('../../services/tab-bar')
const home = require('../../services/home')
const demo = require('../../services/demo')
const release = require('../../config/release')
function nameFor(user, fallback) { return user && user.nickname && user.nickname !== '微信用户' ? user.nickname : fallback }
Page({
  data: { safeTop:66, shop, me:null, partner:null, myRole:'', roleSaving:false, saving:false, busy:false,
    meName:'我', partnerName:'另一半', meInitial:'我', partnerInitial:'?', cloudReady:false,
    nicknameInput:'', bindCode:'', inviteCode:'', inviteExpiresAt:null, inviteExpiryText:'',
    daysText:'—', total:wishes.items.length - 1, showLetter:false, hasPhoto:false, photoBusy:false, photoStateLoading:false, demoMode:false,
    photoItems:[],photoCount:0,albumLimit:10,albumLimits:[3,6,10],photoError:'',showDemoEntry:false,version:release.version,filingNumber:release.filingNumber },
  onLoad() { this.setData({ safeTop:app.getHeaderTop() }) },
  onShow() { if (this.getTabBar()) this.getTabBar().setData({ selected:3 }); setModalOpen(this, this.data.showLetter); this.loadAccount() },
  async loadAccount() { const account = await app.refreshAccount(); if (this.disposed) return; this.applyAccount(account); if (!this.data.photoBusy) await this.loadPhotoState() },
  async loadPhotoState() {
    if (this.disposed || this.data.photoStateLoading) return
    if (!this.data.partner) { home.clearPhotos(this.data.photoItems); this.setData({ photoItems:[],hasPhoto:false,photoCount:0,photoError:'' }); return }
    this.setData({ photoStateLoading:true,photoError:'' })
    try {
      const result = await home.getAlbum('us')
      if (this.disposed) { home.clearPhotos(result.photos); return }
      if (!result.ok) { this.setData({ photoError:home.message(result.reason) }); return }
      home.clearPhotos(this.data.photoItems,result.photos)
      this.setData({ photoItems:result.photos,hasPhoto:result.photos.length > 0,photoCount:result.photos.length,albumLimit:result.album.limit })
    } finally { if (!this.disposed) this.setData({ photoStateLoading:false }) }
  },
  applyAccount(account) {
    const me = account.me || {}
    const partner = account.partner
    const meName = nameFor(me, me.role === 'chef' ? shop.owner : (me.role === 'diner' ? shop.beloved : '我'))
    const partnerName = nameFor(partner, me.role === 'chef' ? shop.beloved : shop.owner)
    const pairedAt = Number(account.pairedAt)
    const daysText = account.demo ? '演示' : (partner && Number.isFinite(pairedAt) && pairedAt > 0 ? String(Math.floor((Date.now() - pairedAt) / 86400000) + 1) : '—')
    this.setData({ me, partner, myRole:me.role || '', meName, partnerName, demoMode:account.demo === true,
      meInitial:accounts.initialOf(meName), partnerInitial:partner ? accounts.initialOf(partnerName) : '?',
      nicknameInput:me.nickname === '微信用户' ? '' : me.nickname || '', cloudReady:account.cloudReady === true,
      inviteCode:account.inviteCode || '', inviteExpiresAt:account.inviteExpiresAt || null, daysText })
    this.startCountdown(account.inviteExpiresAt)
    if (!partner) { home.clearPhotos(this.data.photoItems); this.setData({ hasPhoto:false,photoItems:[],photoCount:0 }) }
  },
  startCountdown(expiresAt) {
    clearInterval(this.inviteTimer)
    const update = () => {
      const remaining = Number(expiresAt || 0) - Date.now()
      const text = !expiresAt ? '' : (remaining <= 0 ? '暗号已过期，点一下重新生成' : Math.floor(remaining / 60000) + ':' + String(Math.floor(remaining % 60000 / 1000)).padStart(2,'0') + ' 后过期')
      this.setData({ inviteExpiryText:text })
      if (remaining <= 0) clearInterval(this.inviteTimer)
    }
    update()
    if (Number(expiresAt) > Date.now()) this.inviteTimer = setInterval(update,1000)
  },
  onHide() { clearInterval(this.inviteTimer); setModalOpen(this, false) },
  onUnload() { this.disposed = true; clearInterval(this.inviteTimer); home.clearPhotos(this.data.photoItems); setModalOpen(this, false) },
  onNicknameInput(event) { this.setData({ nicknameInput:event.detail.value }) },
  async saveNickname() {
    if (this.data.saving) return
    this.setData({ saving:true })
    try {
      const result = await app.saveNickname(this.data.nicknameInput)
      if (!result.ok) { wx.showToast({ title:result.reason === 'empty_nickname' ? '先写下想被叫的名字吧' : (result.reason === 'content_risky' ? '这个称呼暂未通过检查，请调整一下' : '称呼暂未能保存，请稍后重试'), icon:'none' }); return }
      this.applyAccount(result.account)
      wx.showToast({ title:result.demo ? '演示称呼已保存在本机' : (result.synced ? '专属称呼已收好' : '已保存在本机，稍后再同步'), icon:'none' })
    } finally { this.setData({ saving:false }) }
  },
  async selectRole(event) {
    if (this.data.roleSaving || this.data.partner) return
    const role = event.currentTarget.dataset.role
    this.setData({ roleSaving:true })
    try {
      const result = await app.saveRole(role)
      if (!result.ok) { wx.showToast({ title:result.reason === 'role_conflict' ? '另一半已经选了这个身份' : '没能收好身份，请重试', icon:'none' }); return }
      this.applyAccount(result.account)
      wx.showToast({ title:role === 'chef' ? '店长就位，等宝宝敲门' : '宝宝就位，等店长接住心愿', icon:'none' })
    } finally { this.setData({ roleSaving:false }) }
  },
  async copyCode() {
    if (this.data.busy) return
    if (!this.data.myRole) { wx.showToast({ title:'先选一个小店身份吧', icon:'none' }); return }
    this.setData({ busy:true })
    try {
      let code = this.data.inviteCode
      if (!code || Number(this.data.inviteExpiresAt) <= Date.now()) {
        const result = code ? await app.regenerateInvite() : await app.createInvite()
        if (!result.ok) { wx.showToast({ title:'暗号没能生成，请重试', icon:'none' }); return }
        this.applyAccount(result.account)
        code = result.account.inviteCode
      }
      wx.setClipboardData({ data:code })
    } finally { this.setData({ busy:false }) }
  },
  async regenerateInvite() {
    if (this.data.busy) return
    this.setData({ busy:true })
    try {
      const result = await app.regenerateInvite()
      if (!result.ok) { wx.showToast({ title:'暗号没能生成，请重试', icon:'none' }); return }
      this.applyAccount(result.account)
      wx.showToast({ title:'新暗号已备好', icon:'none' })
    } finally { this.setData({ busy:false }) }
  },
  onBindInput(event) { this.setData({ bindCode:event.detail.value.toUpperCase() }) },
  async bindPartner() {
    if (this.data.busy) return
    this.setData({ busy:true })
    try {
      const result = await app.bindPartner(this.data.bindCode)
      if (!result.ok) {
        const text = { empty_code:'把对方的 8 位暗号填进来吧', invalid_code:'没找到这个暗号，请检查一下', own_code:'这是你自己的暗号，要填对方的哦',
          code_used:'这个暗号已经用过了', code_expired:'暗号过期了，请对方生成新的', code_revoked:'这个暗号已经撤回了',
          role_required:'你们都要先选好身份', role_conflict:'你们要分别选择店长和宝宝', already_bound:'其中一方已经有绑定关系了' }
        wx.showToast({ title:text[result.reason] || '这次没牵上手，请重试', icon:'none', duration:3000 }); return
      }
      this.applyAccount(result.account)
      this.setData({ bindCode:'' })
      wx.showToast({ title:'两个人的小店，正式开门啦', icon:'none' })
    } finally { this.setData({ busy:false }) }
  },
  goNotes() { wx.switchTab({ url:'/pages/matches/matches' }) },
  enterDemo() { if (!this.data.busy && !this.data.photoBusy && !this.data.saving && !this.data.roleSaving) app.enterDemo() },
  toggleDemoEntry() { this.setData({ showDemoEntry:!this.data.showDemoEntry }) },
  async chooseCouplePhoto() {
    if (this.data.photoBusy || this.data.photoStateLoading) return
    if (!this.data.partner) { wx.showToast({ title:'先和另一半牵手，再放合照吧', icon:'none' }); return }
    const remaining = this.data.albumLimit - this.data.photoCount
    if (remaining <= 0) { wx.showToast({ title:'相册装满啦，先调高上限或收起一张',icon:'none' }); return }
    this.setData({ photoBusy:true })
    let loadingShown = false
    try {
      const selected = await home.choosePhotos(remaining,{ isActive:() => !this.disposed,onProgress:(index,total) => { loadingShown = true; wx.showLoading({ title:'整理照片 ' + index + '/' + total,mask:true }) } })
      if (!selected || this.disposed) return
      let added = 0,duplicates = 0,failed = selected.failed.length,reason = ''
      for (let index = 0; index < selected.photos.length; index += 1) {
        if (this.disposed) return
        loadingShown = true; wx.showLoading({ title:'收好照片 ' + (index + 1) + '/' + selected.photos.length,mask:true })
        const result = await home.addPhoto(selected.photos[index].image)
        if (this.disposed) return
        if (!result.ok) { failed += selected.photos.length - index; reason = home.message(result.reason); break }
        if (result.duplicate) duplicates += 1; else added += 1
      }
      await this.loadPhotoState()
      if (this.disposed) return
      if (loadingShown) { wx.hideLoading(); loadingShown = false }
      if (failed) wx.showModal({ title:'这次收好 ' + added + ' 张',content:(duplicates ? duplicates + ' 张已经在相册里。' : '') + failed + ' 张未完成。' + (reason || '有些图片太大或格式暂不支持，可以换一张再试。'),showCancel:false })
      else wx.showToast({ title:added ? '收好 ' + added + ' 张，去首页点小狗吧' : '这些照片已经在相册里啦',icon:'none' })
    } catch (error) {
      if (!this.disposed && !/cancel/i.test(error.errMsg || error.message || '')) wx.showToast({ title:error.message === 'photo_too_large' ? '照片还是有点大，换一张试试吧' : '照片没能选好，请再试一次', icon:'none' })
    } finally { if (loadingShown) wx.hideLoading(); if (!this.disposed) this.setData({ photoBusy:false }) }
  },
  previewCouplePhoto(event) {
    const id = event && event.currentTarget.dataset.id
    const photo = this.data.photoItems.find(item => item.id === id) || this.data.photoItems[0]
    if (!photo || !photo.filePath) { this.loadPhotoState(); return }
    wx.previewImage({ current:photo.filePath,urls:this.data.photoItems.map(item => item.filePath).filter(Boolean) })
  },
  async albumAction(method,...args) {
    if (this.data.photoBusy || this.data.photoStateLoading || this.disposed) return
    this.setData({ photoBusy:true })
    try {
      const result = await home[method](...args)
      if (this.disposed) return
      if (!result.ok) { wx.showToast({ title:home.message(result.reason),icon:'none' }); return }
      await this.loadPhotoState()
      if (!this.disposed) wx.showToast({ title:this.data.demoMode ? '演示相册已在本机更新' : '我们的小相册，整理好啦',icon:'none' })
    } finally { if (!this.disposed) this.setData({ photoBusy:false }) }
  },
  setAlbumLimit(event) { this.albumAction('setAlbumLimit',Number(event.currentTarget.dataset.limit)) },
  setAlbumCover(event) {
    const id = event.currentTarget.dataset.id,ids = this.data.photoItems.map(item => item.id)
    if (ids[0] !== id) this.albumAction('orderPhotos',[id,...ids.filter(other => other !== id)])
  },
  moveAlbumPhoto(event) {
    const ids = this.data.photoItems.map(item => item.id),index = ids.indexOf(event.currentTarget.dataset.id)
    if (index <= 0) return
    ;[ids[index - 1],ids[index]] = [ids[index],ids[index - 1]]
    this.albumAction('orderPhotos',ids)
  },
  captionAlbumPhoto(event) {
    if (this.data.photoBusy || this.data.photoStateLoading) return
    const photo = this.data.photoItems.find(item => item.id === event.currentTarget.dataset.id)
    if (!photo) return
    wx.showModal({ title:'给这一刻留一句话',content:photo.caption || '',editable:true,placeholderText:'最多 40 字，播放到这一张时会出现',
      success:result => { if (result.confirm && !this.disposed) this.albumAction('captionPhoto',photo.id,String(result.content || '')) } })
  },
  removeCouplePhoto(event) {
    if (this.data.photoBusy || this.data.photoStateLoading) return
    const id = event.currentTarget.dataset.id
    wx.showModal({ title:'把这一张合照收起来？',content:'会从两个人的小相册中移除这张，其他照片保留。',confirmText:'收起来',
      success:result => { if (result.confirm && !this.disposed) this.albumAction('deletePhoto',id) } })
  },
  goPhotoShow() { wx.switchTab({ url:'/pages/index/index' }) },
  goDaily() { wx.navigateTo({ url:'/pages/daily/daily' }) },
  goMemories() { wx.setStorageSync(demo.key('puppy_notes_filter'),'memories'); wx.switchTab({ url:'/pages/matches/matches' }) },
  openLetter() { this.setData({ showLetter:true }); setModalOpen(this, true) },
  closeLetter() { this.setData({ showLetter:false }); setModalOpen(this, false) },
  noop() {},
  goPrivacy() { wx.navigateTo({ url:'/pages/privacy/privacy' }) },
  unbind() {
    if (demo.enabled()) return
    wx.showModal({ title:'暂时分开这间小店？', content:'解除后将无法继续读取这段绑定关系中的小纸条。请输入“解除”确认。', editable:true, placeholderText:'输入“解除”', confirmColor:'#b96542',
      success:async modal => {
        if (!modal.confirm || String(modal.content || '').trim() !== '解除') return
        const result = await app.unbindPartner()
        if (!result.ok) { wx.showToast({ title:'没能解除，请重试', icon:'none' }); return }
        this.applyAccount(result.account)
        wx.showToast({ title:'绑定关系已解除', icon:'none' })
      } })
  },
  deletePersonalData() {
    if (demo.enabled()) {
      wx.showModal({ title:'清空本机演示数据？', content:'会清理演示心愿、心情、合照和草稿，重新开始体验。真实账号的数据保留。', confirmText:'清空演示',
        success:modal => { if (modal.confirm) app.resetDemo() } })
      return
    }
    wx.showModal({ title:'删除我的数据', content:'会永久删除你参与的小纸条与回忆，并清除账号和绑定关系。另一半也将无法查看这些记录。请输入“删除”确认。', editable:true, placeholderText:'输入“删除”', confirmColor:'#b96542',
      success:async modal => {
        if (!modal.confirm || String(modal.content || '').trim() !== '删除') return
        wx.showLoading({ title:'正在清理小店' })
        try {
          const removed = await wishes.deletePersonalData()
          if (!removed.ok) { wx.showModal({ title:'暂时没能清理完成', content:'请稍后重试，账号信息暂时保留。', showCancel:false }); return }
          const result = await app.deleteAccount()
          if (!result.ok) { wx.showModal({ title:'纸条已清理，账号尚未删除', content:'请再试一次，完成账号和绑定关系的清理。', showCancel:false }); return }
          ;['puppy_weather','puppy_wish_draft','puppy_menu_category','puppy_notes_filter'].forEach(key => wx.removeStorageSync(key))
          wx.getStorageInfoSync().keys.filter(key => key.startsWith('puppy_daily_draft_') || key.startsWith('puppy_blindbox_') || ['puppy_direct_wish','puppy_direct_wish_note','puppy_open_wish'].includes(key)).forEach(key => wx.removeStorageSync(key))
          wx.showModal({ title:'个人数据已删除', content:'继续使用时会创建一个新的空账号。', showCancel:false, success:() => wx.reLaunch({ url:'/pages/index/index' }) })
        } finally { wx.hideLoading() }
      } })
  }
})
