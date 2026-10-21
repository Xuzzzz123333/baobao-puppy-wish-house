const app = getApp()
const shop = require('../../config/shop')
const { setModalOpen } = require('../../services/tab-bar')
const home = require('../../services/home')
const demo = require('../../services/demo')
const weather = home.weather
Page({
  data: { safeTop:66, shop, weather, awning:[1,2,3,4,5,6,7,8], selectedWeather:'sun', weatherText:weather[0].text,
    dogMessage:'汪！你的小愿望，我来送。', dogWag:false, showLetter:false,
    pairText:'等宝宝来敲门', greeting:'把想念，变成一个小动作。', paired:false,
    homeLoading:false, homeError:'', moodSaving:false, reactionSaving:false,
    myMood:null, partnerMood:null, partnerName:'另一半', reactions:home.reactions,
    weatherSyncHint:'点选天气，把今天的心情告诉另一半。', hasPhoto:false,
    showPhoto:false, photoLoading:false, photoPath:'', photoError:'',photoItems:[],photoIndex:0,photoPlaying:true },
  onLoad() {
    this.setData({ safeTop:app.getHeaderTop() })
    const saved = wx.getStorageSync(demo.key('puppy_weather'))
    const selected = weather.find(item => item.id === saved)
    if (selected) this.setData({ selectedWeather:selected.id, weatherText:selected.text })
  },
  async onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected:0 })
    setModalOpen(this, this.data.showLetter || this.data.showPhoto)
    const account = await app.refreshAccount()
    const owner = account.me && account.me.role === 'chef'
    this.setData({ pairText:account.demo ? '单账号演示，体验两个人的小店' : (account.partner ? '两个人的小店，今天也开着' : (owner ? '等宝宝来敲门' : '等店长来接住你的心愿')),
      greeting:owner ? '宝宝的小愿望，值得认真回应。' : '把想念，变成一个小动作。' })
    await this.loadHome()
  },
  onPullDownRefresh() { return this.loadHome().finally(() => wx.stopPullDownRefresh()) },
  async loadHome() {
    if (this.data.homeLoading || this.data.moodSaving || this.data.reactionSaving) return
    this.setData({ homeLoading:true, homeError:'' })
    try {
      const result = await home.get()
      if (!result.ok) { this.setData({ homeError:home.message(result.reason) }); return }
      this.applyHome(result.home)
    } finally { this.setData({ homeLoading:false }) }
  },
  applyHome(state) {
    const mine = home.decorateMood(state.me), partner = home.decorateMood(state.partner)
    const data = { paired:state.paired, myMood:mine, partnerMood:partner, partnerName:state.partnerName || '另一半', hasPhoto:state.hasPhoto, homeError:'',
      weatherSyncHint:state.demo ? '仅本机演示，切换身份可查看和回应这份心情。' : (state.paired ? (mine ? '已分享给对方，进店或刷新就能看到。' : '点选天气，把今天的心情告诉另一半。') : '牵手后，你们就能看见彼此的心情。') }
    if (mine) { data.selectedWeather = mine.weatherId; data.weatherText = mine.text }
    this.setData(data)
    if (this.data.showPhoto && (!state.paired || !state.hasPhoto)) {
      home.clearPhotos(this.data.photoItems)
      this.setData({ photoPath:'',photoItems:[],photoIndex:0, photoError:state.paired ? '' : '先在“我们”里牵手，再把合照交给小狗保管。' })
    }
  },
  async chooseWeather(event) {
    if (this.data.moodSaving || this.data.homeLoading || this.data.reactionSaving) return
    const selected = weather.find(item => item.id === event.currentTarget.dataset.id)
    if (!selected) return
    this.setData({ selectedWeather:selected.id, weatherText:selected.text, myMood:null })
    wx.setStorageSync(demo.key('puppy_weather'), selected.id)
    if (!this.data.paired) { wx.showToast({ title:'已记在本机，牵手后再分享吧', icon:'none' }); return }
    this.setData({ moodSaving:true, weatherSyncHint:'小狗正在送去你的心情…' })
    try {
      const result = await home.setMood(selected.id)
      if (!result.ok) { this.setData({ weatherSyncHint:'暂存在本机，点一下天气重试。' }); wx.showToast({ title:home.message(result.reason), icon:'none' }); return }
      this.applyHome(result.home)
      wx.showToast({ title:result.demo ? '演示心情已保存在本机' : '今天的心情，分享好啦', icon:'none' })
    } finally { this.setData({ moodSaving:false }) }
  },
  async reactToWeather(event) {
    if (this.data.reactionSaving || this.data.moodSaving || this.data.homeLoading || !this.data.partnerMood) return
    this.setData({ reactionSaving:true })
    try {
      const result = await home.react(this.data.partnerMood.version,event.currentTarget.dataset.id)
      if (!result.ok) { wx.showToast({ title:home.message(result.reason), icon:'none' }); return }
      this.applyHome(result.home)
      wx.showToast({ title:result.demo ? '演示回应已保存在本机' : '你的回应，小狗送到啦', icon:'none' })
    } finally { this.setData({ reactionSaving:false }) }
  },
  petDog() {
    const lines = ['摸摸收到！今天也要被好好爱着。','抱抱这单，我已经替你记在心里啦。','想说的话，小声告诉我也可以。','汪！小店不打烊，温柔慢慢来。','今天的你，也值得一句认真夸夸。']
    const index = ((this.dogLine || 0) + 1) % lines.length
    this.dogLine = index
    this.setData({ dogMessage:lines[index], dogWag:true })
    clearTimeout(this.wagTimer)
    this.wagTimer = setTimeout(() => this.setData({ dogWag:false }),600)
    this.openPhoto()
  },
  async openPhoto() {
    if (this.data.photoLoading) return
    const previous = this.data.photoItems
    this.setData({ showPhoto:true, photoLoading:true, photoError:'', photoPath:'',photoItems:[],photoIndex:0,photoPlaying:true })
    setModalOpen(this, true)
    try {
      if (!this.data.paired) { home.clearPhotos(previous); this.setData({ photoError:'先在“我们”里牵手，再把合照交给小狗保管。' }); return }
      const result = await home.getAlbum('home')
      if (!this.data.showPhoto || this.photoDisposed) { home.clearPhotos(previous); home.clearPhotos(result.photos); return }
      home.clearPhotos(previous,result.photos || [])
      if (!result.ok) { this.setData({ photoError:home.message(result.reason) }); return }
      const photos = result.photos || []
      this.setData({ photoItems:photos,photoPath:photos[0] ? photos[0].filePath : '', hasPhoto:photos.length > 0 })
    } finally { if (!this.photoDisposed) this.setData({ photoLoading:false }) }
  },
  closePhoto() {
    home.clearPhotos(this.data.photoItems)
    this.setData({ showPhoto:false, photoPath:'',photoItems:[],photoIndex:0,photoPlaying:false })
    setModalOpen(this, this.data.showLetter)
  },
  onPhotoChange(event) { this.setData({ photoIndex:event.detail.current }) },
  togglePhotoPlaying() { this.setData({ photoPlaying:!this.data.photoPlaying }) },
  previewPhoto(event) {
    const index = event && event.currentTarget && Number(event.currentTarget.dataset.index)
    const photo = this.data.photoItems[Number.isFinite(index) ? index : this.data.photoIndex]
    if (!photo || !photo.filePath) { wx.showToast({ title:'这张照片暂时没打开，重新加载试试',icon:'none' }); return }
    this.setData({ photoPlaying:false })
    wx.previewImage({ current:photo.filePath,urls:this.data.photoItems.map(item => item.filePath).filter(Boolean) })
  },
  goPhotoSettings() { this.closePhoto(); wx.switchTab({ url:'/pages/us/us' }) },
  goMenu(event) {
    wx.setStorageSync(demo.key('puppy_menu_category'),event.currentTarget.dataset.category || '')
    wx.switchTab({ url:'/pages/menu/menu' })
  },
  goWeatherWish() {
    wx.setStorageSync(demo.key('puppy_menu_category'),weather.find(item => item.id === this.data.selectedWeather).category)
    wx.switchTab({ url:'/pages/menu/menu' })
  },
  goNotes() { wx.switchTab({ url:'/pages/matches/matches' }) },
  goDaily() { wx.navigateTo({ url:'/pages/daily/daily' }) },
  openLetter() { this.setData({ showLetter:true }); setModalOpen(this, true) },
  closeLetter() { this.setData({ showLetter:false }); setModalOpen(this, this.data.showPhoto) },
  noop() {},
  onHide() { this.setData({ photoPlaying:false }); setModalOpen(this, false) },
  onUnload() { this.photoDisposed = true; clearTimeout(this.wagTimer); home.clearPhotos(this.data.photoItems); setModalOpen(this, false) }
})
