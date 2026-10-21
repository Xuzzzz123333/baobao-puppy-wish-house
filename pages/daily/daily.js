const app = getApp()
const service = require('../../services/daily')
const demo = require('../../services/demo')
Page({
  data:{ safeTop:66,card:service.dailyCard(),opened:false,daily:null,answer:'',paired:false,partnerName:'另一半',loading:false,busy:false,error:'',demoMode:false },
  onLoad() { this.setData({ safeTop:app.getHeaderTop() }) },
  onShow() { this.load() },
  onUnload() { this.disposed = true },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()) },
  draftKey(day,questionId = this.data.card.questionId) { return demo.key('puppy_daily_draft_' + day + '_' + questionId) },
  async load() {
    if (this.data.loading || this.data.busy) return
    this.setData({ loading:true,error:'',demoMode:demo.enabled() })
    try {
      const result = await service.get()
      if (this.disposed) return
      if (!result.ok) { this.setData({ error:service.message(result.reason) }); return }
      const daily = result.daily,card = { ...service.dailyCard(daily.day),...daily }
      const legacyDraft = card.questionId === service.legacyCard(card.day).questionId ? wx.getStorageSync(demo.key('puppy_daily_draft_' + card.day)) : ''
      this.setData({ daily,card,paired:result.paired,partnerName:result.partnerName || '另一半',
        opened:wx.getStorageSync(demo.key('puppy_blindbox_' + card.day)) === true,
        answer:daily.mySubmitted ? daily.myAnswer : wx.getStorageSync(this.draftKey(card.day,card.questionId)) || legacyDraft || '' })
    } finally { if (!this.disposed) this.setData({ loading:false }) }
  },
  draw() {
    this.setData({ opened:true })
    wx.setStorageSync(demo.key('puppy_blindbox_' + this.data.card.day),true)
  },
  makeWish() {
    wx.setStorageSync(demo.key('puppy_direct_wish'),this.data.card.action.templateId)
    wx.setStorageSync(demo.key('puppy_direct_wish_note'),'今日心动：' + this.data.card.action.title + '\n' + this.data.card.action.text)
    wx.switchTab({ url:'/pages/menu/menu' })
  },
  onAnswer(event) {
    this.setData({ answer:event.detail.value })
    wx.setStorageSync(this.draftKey(this.data.card.day),event.detail.value)
  },
  async submit() {
    if (this.data.busy || this.data.loading || !this.data.daily || this.data.daily.mySubmitted) return
    if (!this.data.paired) { this.goUs(); return }
    if (!this.data.answer.trim()) { wx.showToast({ title:'认真写下一句真心话吧',icon:'none' }); return }
    this.setData({ busy:true })
    const key = this.draftKey(this.data.card.day)
    try {
      const result = await service.answer(this.data.card.day,this.data.card.questionId,this.data.answer)
      if (this.disposed) return
      if (!result.ok) { wx.showToast({ title:service.message(result.reason),icon:'none' }); return }
      this.setData({ daily:result.daily,answer:result.daily.myAnswer })
      wx.removeStorageSync(key)
      wx.showToast({ title:result.daily.revealed ? '两颗真心，一起揭晓啦' : (result.demo ? '演示答案已封好，切换身份继续' : '答案封好啦，等另一半来写'),icon:'none' })
    } finally { if (!this.disposed) this.setData({ busy:false }) }
  },
  goUs() { wx.switchTab({ url:'/pages/us/us' }) },
  goBack() { if (getCurrentPages().length > 1) wx.navigateBack(); else wx.switchTab({ url:'/pages/index/index' }) }
})
