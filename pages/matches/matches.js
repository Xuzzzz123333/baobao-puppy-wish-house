const app = getApp()
const service = require('../../services/wishes')
const shop = require('../../config/shop')
const { setModalOpen } = require('../../services/tab-bar')
const demo = require('../../services/demo')
const inbox = require('../../services/inbox')
const finalStates = ['completed','cancelled','declined']
function withActions(wish) {
  const actions = []
  if (!finalStates.includes(wish.status)) {
    if (wish.isCreator) {
      if (wish.status === 'ready') actions.push({ op:'complete', text:'收到啦，收进回忆', primary:true })
      else actions.push({ op:'cancel', text:'收回这张纸条' })
    } else {
      if (wish.status === 'waiting' || wish.status === 'scheduled') actions.push({ op:'accept', text:'这个心愿，我接住了', primary:true })
      if (wish.status === 'accepted') actions.push({ op:'ready', text:'已经认真兑现啦', primary:true })
      if (wish.status !== 'ready') {
        actions.push({ op:'later', text:'商量晚一点' })
        actions.push({ op:'decline', text:'这次先放一放' })
      }
    }
    actions.push({ op:'reply', text:'寄出这句回信' })
  }
  return { ...wish, actions }
}
Page({
  data: { safeTop:66, shop, filter:'all', filters:[{ id:'all', name:'全部纸条' },{ id:'inbox', name:'收到的' },{ id:'sent', name:'我发出的' },{ id:'memories', name:'回忆小票' }],
    wishes:[], visibleWishes:[], selected:null, message:'', loading:false, busy:false, error:'', paired:false, hasMore:false, nextOffset:0 },
  onLoad() { this.setData({ safeTop:app.getHeaderTop() }) },
  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected:2 })
    setModalOpen(this, this.data.selected)
    const filter = wx.getStorageSync(demo.key('puppy_notes_filter'))
    if (filter) { this.setData({ filter }); wx.removeStorageSync(demo.key('puppy_notes_filter')) }
    this.load()
  },
  onHide() { setModalOpen(this, false) },
  onUnload() { this.disposed = true; setModalOpen(this, false) },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    if (this.disposed || this.data.loading || this.data.busy) return
    this.setData({ loading:true, error:'' })
    try {
      const account = await app.refreshAccount()
      if (this.disposed) return
      const mode = inbox.mode()
      if (!account.cloudReady && !account.demo) { this.setData({ error:'账号暂时没连上小店，请稍后重试' }); return }
      if (!account.partner) { this.setData({ paired:false, wishes:[], visibleWishes:[], hasMore:false, selected:null, message:'' }); setModalOpen(this, false); return }
      this.setData({ paired:true })
      const result = await service.list()
      if (this.disposed || mode !== inbox.mode()) return
      if (!result.ok) { this.setData({ error:service.message(result.reason) }); return }
      this.setData({ wishes:result.wishes, paired:result.paired, hasMore:result.hasMore, nextOffset:result.nextOffset || 0 })
      this.applyFilter()
      const directId = wx.getStorageSync(demo.key('puppy_open_wish'))
      if (directId) {
        let wish = result.wishes.find(item => item.id === directId)
        if (!wish) { const found = await service.get(directId); if (found.ok) wish = service.decorate(found.wish) }
        if (this.disposed || mode !== inbox.mode()) return
        if (wish) { this.setData({ selected:withActions(wish),message:'' }); setModalOpen(this,true); inbox.readWish(directId,wish.updatedAt) }
        else wx.showToast({ title:'暂时无法打开这张纸条，请刷新重试',icon:'none' })
        wx.removeStorageSync(demo.key('puppy_open_wish'))
      }
    } finally { if (!this.disposed) this.setData({ loading:false }) }
  },
  async loadMore() {
    if (this.data.loading || !this.data.hasMore) return
    this.setData({ loading:true })
    try {
      const result = await service.list(this.data.nextOffset)
      if (!result.ok) { wx.showToast({ title:service.message(result.reason), icon:'none' }); return }
      const merged = this.data.wishes.concat(result.wishes).filter((item,index,all) => all.findIndex(other => other.id === item.id) === index)
      this.setData({ wishes:merged, hasMore:result.hasMore, nextOffset:result.nextOffset })
      this.applyFilter()
    } finally { this.setData({ loading:false }) }
  },
  chooseFilter(event) { this.setData({ filter:event.currentTarget.dataset.id }); this.applyFilter() },
  applyFilter() {
    const filter = this.data.filter
    this.setData({ visibleWishes:this.data.wishes.filter(wish => filter === 'all' || (filter === 'inbox' && !wish.isCreator) || (filter === 'sent' && wish.isCreator) || (filter === 'memories' && wish.status === 'completed')) })
  },
  openWish(event) {
    const wish = this.data.wishes.find(item => item.id === event.currentTarget.dataset.id)
    if (wish) { this.setData({ selected:withActions(wish), message:'' }); setModalOpen(this, true); inbox.readWish(wish.id,wish.updatedAt) }
  },
  closeSheet() { if (!this.data.busy) { this.setData({ selected:null }); setModalOpen(this, false) } },
  onMessage(event) { this.setData({ message:event.detail.value }) },
  noop() {},
  async act(event) {
    if (this.data.busy || !this.data.selected) return
    const operation = event.currentTarget.dataset.op
    if (['reply','later'].includes(operation) && !this.data.message.trim()) {
      wx.showToast({ title:operation === 'later' ? '写下想约的时间或原因吧' : '先写一句想说的话吧', icon:'none' }); return
    }
    if (['cancel','decline'].includes(operation)) {
      const confirmed = await new Promise(resolve => wx.showModal({ title:operation === 'cancel' ? '收回这张小纸条？' : '这次先放一放？',
        content:operation === 'cancel' ? '对方会看到心愿已收回，记录仍会保留。' : '把你的想法留在回信里，也可以以后换一种方式陪伴。',
        confirmText:'确认', success:result => resolve(result.confirm), fail:() => resolve(false) }))
      if (!confirmed) return
    }
    this.setData({ busy:true })
    try {
      const result = await service.update(this.data.selected.id, operation, this.data.message)
      if (!result.ok) { wx.showToast({ title:service.message(result.reason), icon:'none', duration:3000 }); return }
      const updated = service.decorate(result.wish)
      this.setData({ selected:withActions(updated), message:'', wishes:this.data.wishes.map(item => item.id === updated.id ? updated : item) })
      this.applyFilter()
      wx.showToast({ title:result.demo ? '演示进展已保存在本机' : (operation === 'complete' ? '这份小幸福，收好啦' : '小狗把回信送到啦'), icon:'none' })
    } finally { this.setData({ busy:false }) }
  },
  goUs() { wx.switchTab({ url:'/pages/us/us' }) },
  goInbox() { wx.navigateTo({ url:'/pages/inbox/inbox' }) },
  goMenu() { wx.switchTab({ url:'/pages/menu/menu' }) }
})
