const app = getApp()
const extrasService = require('../../services/extras')

function dateText(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

Page({
  data: {
    safeTop: 54,
    loading: true,
    paired: false,
    occasions: [],
    dishes: [],
    showEditor: false,
    type: 'anniversary',
    title: '',
    date: '',
    revealTime: '18:00',
    selectedDishIds: [],
    saving: false
  },

  onLoad() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    this.setData({
      safeTop: app.getSafeTop(),
      date: dateText(tomorrow)
    })
  },

  async onShow() {
    await app.refreshDishes()
    this.setData({
      dishes: app.globalData.dishes
        .filter(dish => dish.available !== false)
        .map(dish => ({ ...dish, selected: false }))
    })
    await this.loadOccasions()
  },

  goBack() {
    wx.navigateBack()
  },

  formatOccasions(items) {
    return (items || []).map(item => {
      const dishes = (item.dishIds || [])
        .map(id => app.globalData.dishes.find(dish => dish.id === id))
        .filter(Boolean)
      const revealDate = item.revealAt ? new Date(item.revealAt) : null
      return {
        ...item,
        typeText: item.type === 'surprise' ? '惊喜晚餐' : '纪念日菜单',
        dateText: item.date ? `${Number(item.date.slice(5, 7))}月${Number(item.date.slice(8, 10))}日` : '',
        revealText: revealDate
          ? `${revealDate.getMonth() + 1}月${revealDate.getDate()}日 ${String(revealDate.getHours()).padStart(2, '0')}:${String(revealDate.getMinutes()).padStart(2, '0')} 揭晓`
          : '双方现在都可以查看',
        dishNames: dishes.map(dish => dish.name).join(' · '),
        icons: dishes.slice(0, 4).map(dish => dish.icon).join(' ')
      }
    })
  },

  async loadOccasions() {
    this.setData({ loading: true })
    const result = await extrasService.listOccasions()
    if (!result.ok) {
      this.setData({ loading: false })
      return
    }
    this.setData({
      loading: false,
      paired: result.paired,
      occasions: this.formatOccasions(result.occasions)
    })
  },

  openEditor() {
    if (!this.data.paired) {
      wx.showToast({ title: '请先绑定另一半', icon: 'none' })
      return
    }
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    this.setData({
      showEditor: true,
      type: 'anniversary',
      title: '',
      date: dateText(tomorrow),
      revealTime: '18:00',
      selectedDishIds: [],
      dishes: this.data.dishes.map(dish => ({ ...dish, selected: false }))
    })
  },

  closeEditor() {
    if (this.data.saving) return
    this.setData({ showEditor: false })
  },

  noop() {},

  chooseType(event) {
    this.setData({ type: event.currentTarget.dataset.type })
  },

  onTitleInput(event) {
    this.setData({ title: event.detail.value })
  },

  onDateChange(event) {
    this.setData({ date: event.detail.value })
  },

  onTimeChange(event) {
    this.setData({ revealTime: event.detail.value })
  },

  toggleDish(event) {
    const dishId = event.currentTarget.dataset.id
    const selected = [...this.data.selectedDishIds]
    const index = selected.indexOf(dishId)
    if (index >= 0) {
      selected.splice(index, 1)
    } else {
      selected.push(dishId)
    }
    this.setData({
      selectedDishIds: selected,
      dishes: this.data.dishes.map(dish => ({
        ...dish,
        selected: selected.includes(dish.id)
      }))
    })
  },

  async saveOccasion() {
    if (this.data.saving) return
    if (!this.data.title.trim()) {
      wx.showToast({ title: '请给这顿晚餐起个名字', icon: 'none' })
      return
    }
    if (!this.data.selectedDishIds.length) {
      wx.showToast({ title: '至少选择一道菜', icon: 'none' })
      return
    }
    const revealAt = this.data.type === 'surprise'
      ? new Date(`${this.data.date}T${this.data.revealTime}:00`).getTime()
      : 0
    this.setData({ saving: true })
    const result = await extrasService.saveOccasion({
      type: this.data.type,
      title: this.data.title,
      date: this.data.date,
      revealAt,
      dishIds: this.data.selectedDishIds
    })
    this.setData({ saving: false })
    if (!result.ok) {
      const messages = {
        content_risky: '标题需要修改',
        partner_required: '请先绑定另一半',
        menu_required: '至少选择一道菜',
        invalid_reveal_time: '揭晓时间需要晚于现在'
      }
      wx.showToast({ title: messages[result.reason] || '保存失败，请稍后重试', icon: 'none' })
      return
    }
    this.setData({
      showEditor: false,
      paired: result.paired,
      occasions: this.formatOccasions(result.occasions)
    })
    wx.showToast({
      title: this.data.type === 'surprise' ? '惊喜已悄悄藏好' : '纪念日菜单已保存',
      icon: 'none'
    })
  },

  deleteOccasion(event) {
    const occasionId = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这份安排？',
      content: '删除后双方都无法再查看。',
      confirmText: '删除',
      confirmColor: '#E75B43',
      success: async result => {
        if (!result.confirm) return
        const removed = await extrasService.deleteOccasion(occasionId)
        if (!removed.ok) {
          wx.showToast({ title: '删除失败', icon: 'none' })
          return
        }
        this.setData({
          occasions: this.formatOccasions(removed.occasions)
        })
      }
    })
  }
})
