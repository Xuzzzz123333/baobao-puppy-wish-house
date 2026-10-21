const app = getApp()
const wishes = require('../../services/wishes')
const shop = require('../../config/shop')
const { setModalOpen } = require('../../services/tab-bar')
const demo = require('../../services/demo')
Page({
  data: { safeTop:66, shop, categories:[{ id:'all', name:'全部心愿', icon:'♡' }].concat(wishes.categories),
    activeCategory:'all', search:'', visibleItems:[], total:wishes.items.length - 1, selected:null,
    optionGroups:[], choices:{}, timeOptions:wishes.timeOptions, when:wishes.timeOptions[0],
    note:'', submitting:false, requestId:'', hasDraft:false },
  onLoad() { this.setData({ safeTop:app.getHeaderTop() }); this.filterItems() },
  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected:1 })
    setModalOpen(this, this.data.selected)
    const category = wx.getStorageSync(demo.key('puppy_menu_category'))
    if (category) { this.setData({ activeCategory:category, search:'' }); wx.removeStorageSync(demo.key('puppy_menu_category')) }
    this.setData({ hasDraft:!!wx.getStorageSync(demo.key('puppy_wish_draft')) })
    this.filterItems()
    const direct = wx.getStorageSync(demo.key('puppy_direct_wish'))
    if (direct) {
      const note = wx.getStorageSync(demo.key('puppy_direct_wish_note'))
      wx.removeStorageSync(demo.key('puppy_direct_wish')); wx.removeStorageSync(demo.key('puppy_direct_wish_note'))
      this.compose(direct,typeof note === 'string' ? note : '')
    }
  },
  onHide() { setModalOpen(this, false) },
  onUnload() { setModalOpen(this, false) },
  chooseCategory(event) { this.setData({ activeCategory:event.currentTarget.dataset.id }); this.filterItems() },
  onSearch(event) { this.setData({ search:event.detail.value }); this.filterItems() },
  filterItems() {
    const query = this.data.search.trim()
    const visibleItems = wishes.items.filter(item => (this.data.activeCategory === 'all' || item.category === this.data.activeCategory) &&
      (!query || (item.title + item.description).includes(query))).map(item => {
        const category = wishes.categories.find(category => category.id === item.category)
        return { ...item, color:category ? category.color : 'peach', categoryName:category ? category.name : '专属心愿' }
      })
    this.setData({ visibleItems })
  },
  openWish(event) { this.compose(event.currentTarget.dataset.id) },
  compose(id,prefill = '') {
    const selected = wishes.items.find(item => item.id === id)
    if (!selected) return
    const cached = wx.getStorageSync(demo.key('puppy_wish_draft'))
    const draft = cached && cached.templateId === id && (!prefill || cached.note === prefill) ? cached : null
    const choices = {}
    selected.options.forEach(group => { choices[group.key] = draft && group.values.includes(draft.choices && draft.choices[group.key]) ? draft.choices[group.key] : group.values[0] })
    this.setData({ selected, choices, optionGroups:selected.options,
      when:draft && wishes.timeOptions.includes(draft.when) ? draft.when : wishes.timeOptions[0],
      note:prefill || (draft ? draft.note || '' : ''), requestId:draft ? draft.requestId : this.newRequestId() })
    setModalOpen(this, true)
    this.saveDraft()
  },
  newRequestId() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + '_' + Math.random().toString(36).slice(2) },
  restoreDraft() { const draft = wx.getStorageSync(demo.key('puppy_wish_draft')); if (draft) this.compose(draft.templateId) },
  saveDraft() {
    if (!this.data.selected) return
    wx.setStorageSync(demo.key('puppy_wish_draft'), { templateId:this.data.selected.id, requestId:this.data.requestId, choices:this.data.choices, when:this.data.when, note:this.data.note })
    this.setData({ hasDraft:true })
  },
  chooseOption(event) {
    this.setData({ ['choices.' + event.currentTarget.dataset.key]:event.currentTarget.dataset.value })
    this.saveDraft()
  },
  chooseTime(event) { this.setData({ when:event.currentTarget.dataset.value }); this.saveDraft() },
  onNote(event) { this.setData({ note:event.detail.value }); this.saveDraft() },
  closeSheet() {
    if (this.data.submitting) return
    this.setData({ selected:null })
    setModalOpen(this, false)
  },
  noop() {},
  async sendWish() {
    if (this.data.submitting || !this.data.selected) return
    if (this.data.selected.id === 'custom' && !this.data.note.trim()) { wx.showToast({ title:'把小愿望写下来吧', icon:'none' }); return }
    this.setData({ submitting:true })
    try {
      const account = await app.refreshAccount()
      if ((!account.cloudReady && !account.demo) || !account.partner || !account.me.role) {
        wx.showModal({ title:'先把另一半请进小店', content:'在“我们”里选择身份，交换邀请暗号后，小狗就能把心愿送给对方。你的草稿已经收好。', confirmText:'去邀请', cancelText:'再逛逛',
          success:result => { if (result.confirm) { this.closeSheet(); wx.switchTab({ url:'/pages/us/us' }) } } })
        return
      }
      const result = await wishes.create({ templateId:this.data.selected.id, requestId:this.data.requestId, choices:this.data.choices, when:this.data.when, note:this.data.note })
      if (!result.ok) { wx.showToast({ title:wishes.message(result.reason), icon:'none', duration:3000 }); return }
      wx.removeStorageSync(demo.key('puppy_wish_draft'))
      this.setData({ selected:null, hasDraft:false })
      setModalOpen(this, false)
      wx.showModal({ title:result.demo ? '演示纸条已存入本机信箱' : '小狗把心愿送到信箱啦', content:result.demo ? '进入小纸条，点击顶部“切换身份”，就能扮演另一半接收和回应。这张纸条只保存在本机。' : '对方打开小程序或刷新信箱，就能看到这张小纸条。', confirmText:'去看纸条', cancelText:'继续逛逛',
        success:modal => { if (modal.confirm) wx.switchTab({ url:'/pages/matches/matches' }) } })
    } finally { this.setData({ submitting:false }) }
  }
})
