const inbox = require('../services/inbox')
Component({
  lifetimes:{ attached() { this.unsubscribe = inbox.subscribe(value => this.setData({ unread:value.unreadCount })) },detached() { if (this.unsubscribe) this.unsubscribe() } },
  data: {
    selected: 0,
    hidden: false,
    unread:0,
    color: '#A09387',
    selectedColor: '#B96542',
    list: [
      { pagePath: '/pages/index/index', text: '小店', icon: '⌂' },
      { pagePath: '/pages/menu/menu', text: '点心愿', icon: '♡' },
      { pagePath: '/pages/matches/matches', text: '小纸条', icon: '✉' },
      { pagePath: '/pages/us/us', text: '我们', icon: '◌' }
    ]
  },

  methods: {
    switchTab(event) {
      const { path } = event.currentTarget.dataset
      wx.switchTab({ url: path })
    }
  }
})
