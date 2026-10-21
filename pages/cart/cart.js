const app = getApp()
const notifications = require('../../services/notifications')
const orderService = require('../../services/orders')
const shoppingService = require('../../services/shopping-list')

Page({
  data: {
    safeTop: 54,
    items: [],
    count: 0,
    total: 0,
    selectedNotes: ['少盐'],
    noteMap: { '少盐': true },
    selectedNotesText: '少盐',
    notes: ['少盐', '微辣', '不要香菜', '餐具 2 份'],
    showSuccess: false,
    notificationText: '点菜提醒尚未配置',
    shoppingListText: '',
    shoppingListReady: false,
    tableTitle: '微信用户的晚餐',
    syncLabel: '本机保存',
    expectedDinnerTime: '19:00'
  },

  onLoad() {
    const selectedNotes = wx.getStorageSync('liangkou_order_notes') || ['少盐']
    this.setData({
      safeTop: app.getHeaderTop(),
      selectedNotes,
      noteMap: this.buildNoteMap(selectedNotes),
      selectedNotesText: selectedNotes.join('、')
    })
    this.loadAccount()
  },

  async onShow() {
    await app.refreshDishes()
    this.syncCart()
    this.loadAccount()
  },

  async loadAccount() {
    const account = await app.refreshAccount()
    const meName = account.me.nickname || '微信用户'
    const partnerName = account.partner && account.partner.nickname
    this.setData({
      tableTitle: partnerName ? `${meName} & ${partnerName}的晚餐` : `${meName}的晚餐`,
      syncLabel: account.cloudReady
        ? (partnerName ? '情侣已绑定' : '等待绑定')
        : '本机保存'
    })
  },

  syncCart() {
    const validCart = app.globalData.cart.filter(cartItem => {
      const dish = app.globalData.dishes.find(item => item.id === cartItem.id)
      return dish && dish.available !== false
    })
    if (validCart.length !== app.globalData.cart.length) {
      app.globalData.cart = validCart
      app.saveCart()
    }
    const items = validCart.map(cartItem => {
      const dish = app.globalData.dishes.find(item => item.id === cartItem.id)
      if (!dish) return null
      return { ...dish, quantity: cartItem.quantity, subtotal: dish.price * cartItem.quantity }
    }).filter(Boolean)
    const summary = app.getCartSummary()
    this.setData({
      items,
      count: summary.count,
      total: summary.total,
      expectedDinnerTime: app.globalData.menuMeta.expectedDinnerTime || '19:00'
    })
  },

  goBack() {
    wx.navigateBack()
  },

  add(event) {
    app.addToCart(event.currentTarget.dataset.id)
    this.syncCart()
  },

  decrease(event) {
    app.updateCart(event.currentTarget.dataset.id, -1)
    this.syncCart()
  },

  chooseNote(event) {
    const note = event.currentTarget.dataset.note
    const selectedNotes = [...this.data.selectedNotes]
    const index = selectedNotes.indexOf(note)
    if (index >= 0) {
      selectedNotes.splice(index, 1)
    } else {
      selectedNotes.push(note)
    }
    wx.setStorageSync('liangkou_order_notes', selectedNotes)
    this.setData({
      selectedNotes,
      noteMap: this.buildNoteMap(selectedNotes),
      selectedNotesText: selectedNotes.join('、')
    })
  },

  buildNoteMap(selectedNotes) {
    return selectedNotes.reduce((map, note) => {
      map[note] = true
      return map
    }, {})
  },

  clearCart() {
    wx.showModal({
      title: '清空今晚菜单？',
      content: '已经挑好的菜会全部移除。',
      confirmText: '清空',
      confirmColor: '#E75B43',
      success: result => {
        if (result.confirm) {
          app.clearCart()
          this.syncCart()
        }
      }
    })
  },

  async submitOrder() {
    if (!this.data.count) return
    const order = {
      id: `LK${Date.now()}`,
      items: this.data.items.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        icon: item.icon,
        imageUrl: item.imageUrl || ''
      })),
      notes: this.data.selectedNotes,
      total: this.data.total,
      expectedDinnerTime: this.data.expectedDinnerTime,
      creatorNickname: app.globalData.account.me.nickname || '微信用户',
      createdAt: Date.now()
    }
    wx.setStorageSync('liangkou_last_order', order)

    const saved = await orderService.saveOrder(order)
    let result = { sent: false, reason: 'order_not_saved' }
    let shoppingResult = { ok: false, reason: 'order_not_saved' }
    if (saved.ok) {
      ;[result, shoppingResult] = await Promise.all([
        notifications.sendPartnerOrderNotification(saved.order || order),
        shoppingService.generateFromOrder((saved.order && saved.order.id) || order.id)
      ])
    }
    const notificationMessages = {
      not_configured: '微信提醒待完成云配置',
      cloud_call_failed: '提醒发送失败，请稍后重试',
      subscription_not_granted: '菜单已保存，对方需要再次授权提醒'
    }
    const shoppingListText = shoppingResult.ok
      ? (
        shoppingResult.list && shoppingResult.list.missingDishes &&
        shoppingResult.list.missingDishes.length
          ? `采购清单已生成，${shoppingResult.list.missingDishes.length} 道菜待补食材`
          : '采购清单已自动生成'
      )
      : ({
        partner_required: '绑定另一半后可共享采购清单',
        cloud_not_configured: '采购清单等待云环境配置',
        cloud_call_failed: '采购清单生成失败，可稍后重试'
      }[shoppingResult.reason] || '采购清单暂未生成')
    this.setData({
      showSuccess: true,
      shoppingListReady: shoppingResult.ok,
      shoppingListText,
      notificationText: result.sent
        ? '已向另一半发送微信提醒'
        : (
          notificationMessages[result.reason] ||
          (saved.ok ? '菜单已保存，另一半尚未绑定或授权' : '菜单保存失败，请稍后重试')
        )
    })
  },

  openShoppingList() {
    app.clearCart()
    this.setData({ showSuccess: false })
    wx.navigateTo({ url: '/pages/shopping-list/shopping-list' })
  },

  finishOrder() {
    app.clearCart()
    this.setData({ showSuccess: false })
    wx.switchTab({ url: '/pages/index/index' })
  }
})
