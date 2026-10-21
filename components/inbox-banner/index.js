const inbox = require('../../services/inbox')
Component({
  data:{ count:0,latest:null },
  lifetimes:{ attached() { this.unsubscribe = inbox.subscribe(value => this.setData({ count:value.unreadCount,latest:value.items.find(item => !item.readAt) || null })); inbox.refresh() },detached() { if (this.unsubscribe) this.unsubscribe() } },
  pageLifetimes:{ show() { inbox.refresh() } },
  methods:{ goInbox() { wx.navigateTo({ url:'/pages/inbox/inbox' }) } }
})
