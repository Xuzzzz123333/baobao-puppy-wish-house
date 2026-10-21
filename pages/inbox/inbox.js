const inbox = require('../../services/inbox')
Page({
  data:{ safeTop:66,items:[],unreadCount:0,loading:false,error:'' },
  onLoad() { this.setData({ safeTop:getApp().getHeaderTop() }); this.unsubscribe = inbox.subscribe(value => this.setData({ items:value.items,unreadCount:value.unreadCount })) },
  onShow() { this.load() },
  onUnload() { this.disposed = true; if (this.unsubscribe) this.unsubscribe() },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    if (this.data.loading) return
    this.setData({ loading:true,error:'' })
    const result = await inbox.refresh(true)
    if (!this.disposed) this.setData({ loading:false,error:result.ok ? '' : '这次没能取到新动态，点刷新再试试。' })
  },
  async readAll() {
    const ids = this.data.items.filter(item => !item.readAt).map(item => item.id)
    const result = await inbox.markRead(ids)
    if (!result.ok && !this.disposed) wx.showToast({ title:'还没标记成功，请重试',icon:'none' })
  },
  async openNotice(event) {
    const item = this.data.items.find(item => item.id === event.currentTarget.dataset.id)
    if (!item) return
    if (item.kind !== 'wish') await inbox.markRead([item.id])
    if (!this.disposed) inbox.open(item)
  },
  goBack() { wx.navigateBack({ fail:() => wx.switchTab({ url:'/pages/index/index' }) }) }
})
