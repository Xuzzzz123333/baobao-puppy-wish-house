const app = getApp()
const likesService = require('../../services/likes')
const WHEEL_COLORS = ['#f3c9bc', '#e7d893', '#cddcbe', '#c6dce5', '#e2cee4', '#f0d7ad']

Page({
  data: {
    safeTop: 54,
    mode: 'mutual',
    modes: [
      { id: 'mutual', name: '共同喜欢' },
      { id: 'all', name: '全部在售' }
    ],
    mutualIds: [],
    wheelDishes: [],
    wheelBackground: '#f3c9bc',
    rotation: 0,
    spinning: false,
    resultDish: null,
    sourceText: '优先从双方共同喜欢中抽取'
  },

  onLoad() {
    this.setData({ safeTop: app.getSafeTop() })
  },

  async onShow() {
    await app.refreshDishes()
    const likes = await likesService.loadSummary()
    this.setData({
      mutualIds: likes.ok ? (likes.mutualIds || []) : []
    })
    if (!this.data.mutualIds.length) {
      this.setData({ mode: 'all' })
    }
    this.buildWheel()
  },

  onUnload() {
    if (this.spinTimer) clearTimeout(this.spinTimer)
  },

  goBack() {
    wx.navigateBack()
  },

  chooseMode(event) {
    if (this.data.spinning) return
    const mode = event.currentTarget.dataset.mode
    if (mode === 'mutual' && !this.data.mutualIds.length) {
      wx.showToast({ title: '还没有共同喜欢的菜', icon: 'none' })
      return
    }
    this.setData({
      mode,
      resultDish: null,
      sourceText: mode === 'mutual'
        ? '只从双方共同喜欢中抽取'
        : '从大厨今天供应的菜中抽取'
    })
    this.buildWheel()
  },

  buildWheel() {
    const available = app.globalData.dishes.filter(dish => dish.available !== false)
    const source = this.data.mode === 'mutual'
      ? available.filter(dish => this.data.mutualIds.includes(dish.id))
      : available
    const shuffled = [...source].sort(() => Math.random() - 0.5).slice(0, 6)
    const slice = 360 / Math.max(shuffled.length, 1)
    const wheelDishes = shuffled.map((dish, index) => {
      // conic-gradient 的 0° 是扇形边界，标签需要再偏移半个扇区才能落在正中。
      const angle = index * slice + slice / 2
      return {
        ...dish,
        angle,
        labelStyle: `transform: rotate(${angle}deg) translateY(-205rpx) rotate(${-angle}deg);`
      }
    })
    const wheelBackground = shuffled.length
      ? `conic-gradient(${shuffled.map((dish, index) => (
        `${WHEEL_COLORS[index % WHEEL_COLORS.length]} ${index * slice}deg ${(index + 1) * slice}deg`
      )).join(', ')})`
      : WHEEL_COLORS[0]
    this.setData({ wheelDishes, wheelBackground })
  },

  spin() {
    if (this.data.spinning || !this.data.wheelDishes.length) return
    const index = Math.floor(Math.random() * this.data.wheelDishes.length)
    const slice = 360 / this.data.wheelDishes.length
    const targetOffset = 360 - (index * slice + slice / 2)
    const currentOffset = ((this.data.rotation % 360) + 360) % 360
    const adjustment = (targetOffset - currentOffset + 360) % 360
    const rotation = this.data.rotation + 1440 + adjustment
    this.setData({
      spinning: true,
      resultDish: null,
      rotation
    })
    this.spinTimer = setTimeout(() => {
      this.setData({
        spinning: false,
        resultDish: this.data.wheelDishes[index]
      })
    }, 3600)
  },

  addResult() {
    if (!this.data.resultDish) return
    const added = app.addToCart(this.data.resultDish.id)
    wx.showToast({
      title: added ? '已加入今晚菜单' : '这道菜暂不供应',
      icon: 'none'
    })
  },

  spinAgain() {
    if (this.data.spinning) return
    this.buildWheel()
    this.setData({ resultDish: null })
    setTimeout(() => this.spin(), 80)
  }
})
