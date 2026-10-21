const app = getApp()
const shoppingService = require('../../services/shopping-list')
const orderService = require('../../services/orders')

const CATEGORIES = ['蔬菜', '肉禽蛋', '水产', '主食', '调味料', '饮品', '其他']
const UNITS = ['g', 'kg', 'ml', 'L', '个', '颗', '根', '把', '盒', '袋', '瓶', '适量']

function emptyForm() {
  return {
    name: '',
    category: '蔬菜',
    quantity: '1',
    unit: '个',
    note: ''
  }
}

Page({
  data: {
    safeTop: 54,
    loading: true,
    saving: false,
    paired: true,
    cloudReady: true,
    list: null,
    sections: [],
    totalCount: 0,
    completedCount: 0,
    pendingCount: 0,
    progress: 0,
    updatedText: '',
    hideCompleted: false,
    showEditor: false,
    editingId: '',
    editingGenerated: false,
    form: emptyForm(),
    categories: CATEGORIES,
    units: UNITS,
    missingText: ''
  },

  onLoad() {
    this.setData({ safeTop: app.getSafeTop() })
  },

  onShow() {
    this.loadList()
  },

  async onPullDownRefresh() {
    await this.loadList()
    wx.stopPullDownRefresh()
  },

  goBack() {
    wx.navigateBack()
  },

  async loadList() {
    this.setData({ loading: true })
    const result = await shoppingService.getList()
    this.setData({ loading: false })
    if (!result.ok) {
      this.setData({
        paired: result.reason !== 'partner_required',
        cloudReady: !['cloud_not_configured', 'cloud_call_failed'].includes(result.reason),
        list: null,
        sections: []
      })
      return
    }
    this.applyList(result.list)
  },

  formatQuantity(item) {
    if (item.unit === '适量') return '适量'
    const quantity = Number(item.quantity || 0)
    return `${Number.isInteger(quantity) ? quantity : quantity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} ${item.unit}`
  },

  formatUpdated(timestamp) {
    if (!timestamp) return '刚刚更新'
    const date = new Date(timestamp)
    const today = new Date()
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return date.toDateString() === today.toDateString()
      ? `今天 ${time} 更新`
      : `${date.getMonth() + 1}月${date.getDate()}日 ${time} 更新`
  },

  applyList(list) {
    if (!list) {
      this.setData({
        paired: true,
        cloudReady: true,
        list: null,
        sections: [],
        totalCount: 0,
        completedCount: 0,
        pendingCount: 0,
        progress: 0,
        missingText: ''
      })
      return
    }
    const allItems = (list.items || []).map(item => ({
      ...item,
      quantityText: this.formatQuantity(item),
      stateText: {
        pending: '待购买',
        pantry: '家里已有',
        purchased: '已购买'
      }[item.state] || '待购买',
      sourceText: item.source === 'manual'
        ? '手动添加'
        : `来自 ${item.sources && item.sources.length
          ? item.sources.map(source => source.dishName).join('、')
          : '今晚菜单'}`,
      completed: item.state !== 'pending'
    }))
    const visibleItems = this.data.hideCompleted
      ? allItems.filter(item => item.state === 'pending')
      : allItems
    const sections = CATEGORIES.map(category => ({
      category,
      items: visibleItems.filter(item => item.category === category)
    })).filter(section => section.items.length)
    const completedCount = allItems.filter(item => item.state !== 'pending').length
    const totalCount = allItems.length
    const missingDishes = list.missingDishes || []
    this.setData({
      paired: true,
      cloudReady: true,
      list: { ...list, items: allItems },
      sections,
      totalCount,
      completedCount,
      pendingCount: totalCount - completedCount,
      progress: totalCount ? Math.round(completedCount / totalCount * 100) : 0,
      updatedText: this.formatUpdated(list.updatedAt),
      missingText: missingDishes.length
        ? `${missingDishes.map(item => item.name).join('、')}尚未配置食材`
        : ''
    })
  },

  async changeState(itemId, state) {
    if (this.data.saving) return
    this.setData({ saving: true })
    const result = await shoppingService.updateItem(itemId, { state })
    this.setData({ saving: false })
    if (!result.ok) {
      wx.showToast({ title: '状态同步失败，请重试', icon: 'none' })
      return
    }
    this.applyList(result.list)
  },

  togglePurchased(event) {
    const item = this.findItem(event.currentTarget.dataset.id)
    if (!item) return
    this.changeState(item.id, item.state === 'purchased' ? 'pending' : 'purchased')
  },

  togglePantry(event) {
    const item = this.findItem(event.currentTarget.dataset.id)
    if (!item) return
    this.changeState(item.id, item.state === 'pantry' ? 'pending' : 'pantry')
  },

  findItem(itemId) {
    return this.data.list &&
      (this.data.list.items || []).find(item => item.id === itemId)
  },

  toggleHideCompleted() {
    this.setData({ hideCompleted: !this.data.hideCompleted }, () => {
      this.applyList(this.data.list)
    })
  },

  openAdd() {
    if (!this.data.list) {
      wx.showToast({ title: '请先从订单生成清单', icon: 'none' })
      return
    }
    this.setData({
      showEditor: true,
      editingId: '',
      editingGenerated: false,
      form: emptyForm()
    })
  },

  openEdit(event) {
    const item = this.findItem(event.currentTarget.dataset.id)
    if (!item) return
    this.setData({
      showEditor: true,
      editingId: item.id,
      editingGenerated: item.source === 'generated',
      form: {
        name: item.name,
        category: item.category,
        quantity: item.unit === '适量' ? '' : String(item.quantity),
        unit: item.unit,
        note: item.note || ''
      }
    })
  },

  closeEditor() {
    if (this.data.saving) return
    this.setData({ showEditor: false })
  },

  noop() {},

  onFormInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  onCategoryChange(event) {
    const category = this.data.categories[Number(event.detail.value)]
    if (category) this.setData({ 'form.category': category })
  },

  onUnitChange(event) {
    const unit = this.data.units[Number(event.detail.value)]
    if (!unit) return
    this.setData({
      'form.unit': unit,
      ...(unit === '适量' ? { 'form.quantity': '' } : {})
    })
  },

  async saveItem() {
    if (this.data.saving) return
    const name = String(this.data.form.name || '').trim()
    const unit = this.data.form.unit
    const quantity = unit === '适量' ? 0 : Number(this.data.form.quantity)
    if (!name) {
      wx.showToast({ title: '请填写食材名称', icon: 'none' })
      return
    }
    if (unit !== '适量' && (!Number.isFinite(quantity) || quantity <= 0)) {
      wx.showToast({ title: '请填写正确数量', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    const payload = {
      name,
      category: this.data.form.category,
      quantity,
      unit,
      note: String(this.data.form.note || '').trim()
    }
    const result = this.data.editingId
      ? await shoppingService.updateItem(this.data.editingId, payload)
      : await shoppingService.addItem(payload)
    this.setData({ saving: false })
    if (!result.ok) {
      wx.showToast({
        title: result.reason === 'content_risky' ? '食材文字需要修改' : '保存失败，请重试',
        icon: 'none'
      })
      return
    }
    this.setData({ showEditor: false })
    this.applyList(result.list)
  },

  deleteItem(event) {
    const item = this.findItem(event.currentTarget.dataset.id)
    if (!item) return
    wx.showModal({
      title: `删除“${item.name}”？`,
      content: item.source === 'generated'
        ? '删除后可通过“同步订单”重新生成。'
        : '手动添加的食材删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#E75B43',
      success: async modalResult => {
        if (!modalResult.confirm) return
        const result = await shoppingService.deleteItem(item.id)
        if (!result.ok) {
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
          return
        }
        this.applyList(result.list)
      }
    })
  },

  generateFromOrder() {
    wx.showModal({
      title: this.data.list ? '同步今晚订单？' : '生成采购清单？',
      content: this.data.list
        ? '会重新计算订单食材，保留已购买状态和手动添加项。'
        : '将根据最近一份订单自动合并食材。',
      confirmText: '确认',
      confirmColor: '#6F8061',
      success: async modalResult => {
        if (!modalResult.confirm) return
        wx.showLoading({ title: '正在整理' })
        let orderId = this.data.list && this.data.list.orderId
        if (!orderId) {
          const orders = await orderService.listOrders()
          orderId = orders.ok && orders.orders && orders.orders[0]
            ? orders.orders[0].id
            : ''
        }
        const result = orderId
          ? await shoppingService.generateFromOrder(orderId)
          : { ok: false, reason: 'order_required' }
        wx.hideLoading()
        if (!result.ok) {
          wx.showToast({
            title: result.reason === 'order_required' ? '还没有可用订单' : '生成失败，请重试',
            icon: 'none'
          })
          return
        }
        this.applyList(result.list)
        wx.showToast({ title: '采购清单已更新', icon: 'none' })
      }
    })
  },

  markAllPurchased() {
    if (!this.data.pendingCount) return
    wx.showModal({
      title: '全部买齐了吗？',
      content: '“家里已有”的项目会保持原状态，其余项目标记为已购买。',
      confirmText: '全部买齐',
      confirmColor: '#6F8061',
      success: async modalResult => {
        if (!modalResult.confirm) return
        const result = await shoppingService.markAllPurchased()
        if (result.ok) this.applyList(result.list)
      }
    })
  },

  clearList() {
    if (!this.data.list) return
    wx.showModal({
      title: '清空采购清单？',
      content: '生成项和手动添加项都会永久删除，可稍后从订单重新生成。',
      confirmText: '清空',
      confirmColor: '#E75B43',
      success: async modalResult => {
        if (!modalResult.confirm) return
        const result = await shoppingService.clearList()
        if (result.ok) this.applyList(null)
      }
    })
  }
})
