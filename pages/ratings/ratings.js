const app = getApp()
const extrasService = require('../../services/extras')

Page({
  data: {
    safeTop: 54,
    loading: true,
    pendingOrders: [],
    leaderboard: [],
    ratingCount: 0,
    showRating: false,
    activeOrder: null,
    stars: [1, 2, 3, 4, 5],
    score: 5,
    comment: '',
    saving: false
  },

  onLoad() {
    this.setData({ safeTop: app.getSafeTop() })
  },

  onShow() {
    this.loadRatings()
  },

  goBack() {
    wx.navigateBack()
  },

  formatDate(timestamp) {
    const date = new Date(timestamp)
    return `${date.getMonth() + 1}月${date.getDate()}日`
  },

  formatResult(result) {
    return {
      pendingOrders: (result.pendingOrders || []).map(order => ({
        ...order,
        dateText: this.formatDate(order.createdAt),
        itemSummary: (order.items || []).map(item => item.name).join(' · '),
        icon: order.items && order.items[0] ? (order.items[0].icon || '🍽️') : '🍽️'
      })),
      leaderboard: (result.leaderboard || []).map((item, index) => ({
        ...item,
        rank: index + 1,
        scoreText: Number(item.averageScore || 0).toFixed(1)
      })),
      ratingCount: result.ratingCount || 0
    }
  },

  async loadRatings() {
    this.setData({ loading: true })
    const result = await extrasService.getRatings()
    if (!result.ok) {
      this.setData({ loading: false })
      wx.showToast({ title: '评分数据加载失败', icon: 'none' })
      return
    }
    this.setData({
      loading: false,
      ...this.formatResult(result)
    })
  },

  openRating(event) {
    const activeOrder = this.data.pendingOrders.find(
      order => order.id === event.currentTarget.dataset.id
    )
    if (!activeOrder) return
    this.setData({
      showRating: true,
      activeOrder,
      score: 5,
      comment: ''
    })
  },

  closeRating() {
    if (this.data.saving) return
    this.setData({ showRating: false })
  },

  noop() {},

  chooseScore(event) {
    this.setData({ score: Number(event.currentTarget.dataset.score) })
  },

  onCommentInput(event) {
    this.setData({ comment: event.detail.value })
  },

  async submitRating() {
    if (!this.data.activeOrder || this.data.saving) return
    this.setData({ saving: true })
    const result = await extrasService.rateOrder(
      this.data.activeOrder.id,
      this.data.score,
      this.data.comment
    )
    this.setData({ saving: false })
    if (!result.ok) {
      wx.showToast({
        title: result.reason === 'content_risky' ? '评价文字需要修改' : '评分保存失败',
        icon: 'none'
      })
      return
    }
    this.setData({
      showRating: false,
      ...this.formatResult(result)
    })
    wx.showToast({ title: '今晚的味道已记下', icon: 'none' })
  }
})
