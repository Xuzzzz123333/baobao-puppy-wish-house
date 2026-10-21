const app = getApp()
const orderService = require('../../services/orders')
const notifications = require('../../services/notifications')

const STATUS_META = {
  confirmed: {
    text: '等待接单',
    nextStatus: 'accepted',
    nextAction: '接受订单'
  },
  accepted: {
    text: '已经接受',
    nextStatus: 'preparing',
    nextAction: '开始制作'
  },
  preparing: {
    text: '制作中',
    nextStatus: 'ready',
    nextAction: '通知可以开饭'
  },
  ready: {
    text: '可以开饭',
    nextStatus: 'completed',
    nextAction: '标记已完成'
  },
  completed: {
    text: '已完成',
    nextStatus: '',
    nextAction: ''
  }
}

Page({
  data: {
    safeTop: 54,
    loading: true,
    accessDenied: false,
    activeOrders: [],
    completedOrders: [],
    pendingCount: 0,
    updatingId: ''
  },

  onLoad() {
    this.setData({ safeTop: app.getSafeTop() })
  },

  onShow() {
    this.loadOrders()
  },

  goBack() {
    wx.navigateBack()
  },

  formatDate(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const prefix = date.toDateString() === now.toDateString()
      ? '今天'
      : `${date.getMonth() + 1}月${date.getDate()}日`
    return `${prefix} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },

  formatOrder(order) {
    const meta = STATUS_META[order.status] || STATUS_META.confirmed
    return {
      ...order,
      statusText: meta.text,
      nextStatus: meta.nextStatus,
      nextAction: meta.nextAction,
      dateText: this.formatDate(order.createdAt),
      itemSummary: (order.items || [])
        .map(item => `${item.name} × ${item.quantity}`)
        .join('、'),
      notesText: (order.notes || []).join('、') || '无特别备注'
    }
  },

  async loadOrders() {
    this.setData({ loading: true })
    const result = await orderService.listOrders()
    if (!result.ok) {
      this.setData({ loading: false })
      wx.showToast({ title: '订单加载失败', icon: 'none' })
      return
    }
    if (!result.canManage) {
      this.setData({ loading: false, accessDenied: true })
      return
    }
    const orders = (result.orders || [])
      .filter(order => order.canManage)
      .map(order => this.formatOrder(order))
    this.setData({
      loading: false,
      accessDenied: false,
      activeOrders: orders.filter(order => order.status !== 'completed'),
      completedOrders: orders.filter(order => order.status === 'completed'),
      pendingCount: orders.filter(order => order.status === 'confirmed').length
    })
  },

  advanceOrder(event) {
    const orderId = event.currentTarget.dataset.id
    const nextStatus = event.currentTarget.dataset.status
    const order = this.data.activeOrders.find(item => item.id === orderId)
    if (!order || !nextStatus || this.data.updatingId) return
    wx.showModal({
      title: order.nextAction,
      content: `${order.itemSummary}\n\n确认后，双方看到的订单状态会立即更新。`,
      confirmText: '确认',
      confirmColor: '#E75B43',
      success: async result => {
        if (!result.confirm) return
        this.setData({ updatingId: orderId })
        const updated = await orderService.updateStatus(orderId, nextStatus)
        this.setData({ updatingId: '' })
        if (!updated.ok) {
          wx.showToast({
            title: updated.reason === 'invalid_transition'
              ? '订单状态已变化，请刷新'
              : '状态更新失败',
            icon: 'none'
          })
          await this.loadOrders()
          return
        }
        let toastTitle = STATUS_META[nextStatus].text
        if (nextStatus === 'ready') {
          const notice = await notifications.sendOrderStatusNotification(
            updated.order,
            app.globalData.account.me.nickname
          )
          toastTitle = notice.sent ? '已提醒食客开饭' : '状态已更新，未提醒'
        }
        wx.showToast({ title: toastTitle, icon: 'none' })
        await this.loadOrders()
      }
    })
  }
})
