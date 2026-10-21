const app = getApp()
const extrasService = require('../../services/extras')

function dateText(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function mondayOf(source) {
  const date = new Date(source)
  date.setHours(12, 0, 0, 0)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return date
}

Page({
  data: {
    safeTop: 54,
    weekStart: '',
    weekTitle: '',
    days: [],
    dishes: [],
    showEditor: false,
    editorDate: '',
    editorTitle: '',
    selectedDishIds: [],
    saving: false,
    loading: true
  },

  onLoad() {
    const weekStart = dateText(mondayOf(new Date()))
    this.setData({
      safeTop: app.getSafeTop(),
      weekStart
    })
  },

  async onShow() {
    await app.refreshDishes()
    this.setData({
      dishes: app.globalData.dishes
        .filter(dish => dish.available !== false)
        .map(dish => ({ ...dish, selected: false }))
    })
    await this.loadWeek()
  },

  goBack() {
    wx.navigateBack()
  },

  buildDays(planDays) {
    const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const start = new Date(`${this.data.weekStart}T12:00:00`)
    const planMap = new Map((planDays || []).map(day => [day.date, day.dishIds || []]))
    const today = dateText(new Date())
    return names.map((name, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      const dateValue = dateText(date)
      const dishIds = planMap.get(dateValue) || []
      const plannedDishes = dishIds
        .map(id => app.globalData.dishes.find(dish => dish.id === id))
        .filter(Boolean)
      return {
        name,
        date: dateValue,
        shortDate: `${date.getMonth() + 1}/${date.getDate()}`,
        isToday: dateValue === today,
        dishIds,
        dishNames: plannedDishes.map(dish => dish.name).join(' · '),
        icons: plannedDishes.slice(0, 4).map(dish => dish.icon).join(' '),
        count: plannedDishes.length
      }
    })
  },

  async loadWeek() {
    this.setData({ loading: true })
    const result = await extrasService.getWeek(this.data.weekStart)
    const start = new Date(`${this.data.weekStart}T12:00:00`)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    this.setData({
      loading: false,
      days: this.buildDays(result.ok ? result.days : []),
      weekTitle: `${start.getMonth() + 1}月${start.getDate()}日 — ${end.getMonth() + 1}月${end.getDate()}日`
    })
  },

  async shiftWeek(event) {
    const delta = Number(event.currentTarget.dataset.delta)
    const start = new Date(`${this.data.weekStart}T12:00:00`)
    start.setDate(start.getDate() + delta * 7)
    this.setData({ weekStart: dateText(start) })
    await this.loadWeek()
  },

  openDay(event) {
    const date = event.currentTarget.dataset.date
    const day = this.data.days.find(item => item.date === date)
    this.setData({
      showEditor: true,
      editorDate: date,
      editorTitle: `${day.name} · ${day.shortDate}`,
      selectedDishIds: [...day.dishIds],
      dishes: this.data.dishes.map(dish => ({
        ...dish,
        selected: day.dishIds.includes(dish.id)
      }))
    })
  },

  closeEditor() {
    if (this.data.saving) return
    this.setData({ showEditor: false })
  },

  noop() {},

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

  async saveDay() {
    if (this.data.saving) return
    this.setData({ saving: true })
    const result = await extrasService.saveDay(
      this.data.editorDate,
      this.data.selectedDishIds
    )
    this.setData({ saving: false })
    if (!result.ok) {
      wx.showToast({ title: '菜单安排保存失败', icon: 'none' })
      return
    }
    this.setData({
      showEditor: false,
      days: this.buildDays(result.days)
    })
    wx.showToast({
      title: this.data.selectedDishIds.length ? '本周菜单已更新' : '当天安排已清空',
      icon: 'none'
    })
  }
})
