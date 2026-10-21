const inbox = require('../../services/inbox')
Component({
  data:{ loading:true,busy:false,ready:false,enabled:false,credits:0,demo:false,error:'',showTest:false },
  lifetimes:{ attached() { this.load() },detached() { this.disposed = true } },
  pageLifetimes:{ show() { this.load() } },
  methods:{
    toggleTest() { this.setData({ showTest:!this.data.showTest }) },
    async load() {
      const mode = inbox.mode(),result = await inbox.call('subscriptionSettings')
      if (this.disposed || mode !== inbox.mode()) return
      this.settings = result
      this.setData({ loading:false,ready:result.ready === true,enabled:result.enabled === true,credits:result.credits || 0,demo:result.demo === true,error:result.ok ? '' : '通知配置暂时没能读取，请重试。' })
    },
    subscribe() {
      if (this.data.error) { this.load(); return }
      if (this.data.busy || this.data.loading) return
      const settings = this.settings || {},mode = inbox.mode()
      if (settings.demo) { wx.showToast({ title:'演示可体验站内提醒；微信通知需真实账号',icon:'none' }); return }
      if (!settings.ready) { wx.showModal({ title:'微信服务通知待配置',content:'店长需先在微信公众平台添加可用的订阅消息模板，再把模板 ID 和字段配置到云函数。站内新消息提醒已经可以使用。',showCancel:false }); return }
      if (!wx.requestSubscribeMessage) { wx.showToast({ title:'请更新微信后再试',icon:'none' }); return }
      this.setData({ busy:true })
      // 保持在点击回调内直接申请；不能先等待云函数或其他异步任务。
      wx.requestSubscribeMessage({ tmplIds:[settings.templateId],success:async result => {
        if (this.disposed || mode !== inbox.mode()) return
        if (result[settings.templateId] !== 'accept') { wx.showToast({ title:'这次没有订阅，站内提醒照常保留',icon:'none' }); return }
        const saved = await inbox.call('subscriptionGrant',{ requestId:Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) })
        if (this.disposed || mode !== inbox.mode()) return
        wx.showToast({ title:saved.ok ? '订阅已记录，下次心愿动态会尝试提醒' : '订阅记录未保存，请重试',icon:'none',duration:3000 }); this.load()
      },fail:() => { if (!this.disposed && mode === inbox.mode()) wx.showToast({ title:'未能申请订阅，请检查微信设置',icon:'none' }) },complete:() => { if (!this.disposed) this.setData({ busy:false }) } })
    },
    async disable() {
      if (this.data.busy) return
      const mode = inbox.mode(); this.setData({ busy:true })
      const result = await inbox.call('subscriptionDisable')
      if (this.disposed || mode !== inbox.mode()) return
      this.setData({ busy:false })
      if (result.ok) this.load(); else wx.showToast({ title:'暂时没能关闭，请重试',icon:'none' })
    },
    async testNotification() {
      if (this.data.busy || this.data.loading || !this.data.ready || this.data.demo) return
      if (!this.data.enabled || this.data.credits < 1) { wx.showToast({ title:'先点上面的订阅按钮并同意，再发测试',icon:'none' }); return }
      const mode = inbox.mode(); this.setData({ busy:true })
      const result = await inbox.call('subscriptionTest',{ requestId:Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) })
      if (this.disposed || mode !== inbox.mode()) return
      this.setData({ busy:false }); this.load()
      if (result.submitted) wx.showModal({ title:'测试通知已提交',content:'请退出小程序，到微信的“服务通知”查看是否收到。这次测试使用了一次订阅，之后可再次订阅。',showCancel:false })
      else if (result.duplicate) wx.showToast({ title:'这次测试已提交过，请到微信查看',icon:'none' })
      else wx.showModal({ title:'测试还没发送成功',content:result.reason === 'subscription_required' ? '请先重新订阅，再试一次。' : '请先重新订阅再试。' + (result.code ? '错误码：' + result.code + '。' : '') + '如果仍失败，把这个提示发给店长检查。',showCancel:false })
    },
    goInbox() { wx.navigateTo({ url:'/pages/inbox/inbox' }) }
  }
})
