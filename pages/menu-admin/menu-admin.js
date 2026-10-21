const app = getApp()
const menuService = require('../../services/menu')

const INGREDIENT_CATEGORIES = ['蔬菜', '肉禽蛋', '水产', '主食', '调味料', '饮品', '其他']
const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'L', '个', '颗', '根', '把', '盒', '袋', '瓶', '适量']

function emptyForm() {
  return {
    name: '',
    price: '',
    subtitle: '',
    category: '热菜',
    icon: '🍽️',
    imageUrl: '',
    time: '20 分钟',
    available: true,
    ingredients: []
  }
}

function emptyIngredient() {
  return {
    id: `ingredient-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    category: '蔬菜',
    quantity: '1',
    unit: '个',
    optional: false,
    note: ''
  }
}

Page({
  data: {
    safeTop: 54,
    loading: true,
    saving: false,
    dishes: [],
    expectedDinnerTime: '19:00',
    sortMode: false,
    draggingId: '',
    draggingY: 0,
    listHeight: 0,
    categories: ['热菜', '主食', '轻食', '甜品', '饮品'],
    ingredientCategories: INGREDIENT_CATEGORIES,
    ingredientUnits: INGREDIENT_UNITS,
    categoryIndex: 0,
    showEditor: false,
    editingId: '',
    editorTitle: '添加菜品',
    form: emptyForm()
  },

  async onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.dragStepPx = 190 * Number(windowInfo.windowWidth || 375) / 750
    this.setData({ safeTop: app.getSafeTop() })
    const account = await app.refreshAccount()
    if (!account.me || account.me.role !== 'chef') {
      wx.showModal({
        title: '仅大厨可进入',
        content: '食客可以浏览和点菜，只有绑定角色为“大厨”的用户可以管理菜单。',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }
    await this.loadDishes()
  },

  goBack() {
    wx.navigateBack()
  },

  async loadDishes() {
    this.setData({ loading: true })
    const result = await app.refreshDishes()
    const dishes = (result.dishes || app.globalData.dishes).map((dish, index) => ({
      ...dish,
      ingredients: Array.isArray(dish.ingredients) ? dish.ingredients : [],
      dragY: index * (this.dragStepPx || 95)
    }))
    this.setData({
      loading: false,
      dishes,
      expectedDinnerTime: result.expectedDinnerTime ||
        app.globalData.menuMeta.expectedDinnerTime ||
        '19:00',
      listHeight: dishes.length * 190
    })
  },

  openCreate() {
    this.setData({
      showEditor: true,
      editingId: '',
      editorTitle: '添加一道菜',
      categoryIndex: 0,
      form: emptyForm()
    })
  },

  openEdit(event) {
    const dish = this.data.dishes.find(item => item.id === event.currentTarget.dataset.id)
    if (!dish) return
    const categoryIndex = Math.max(0, this.data.categories.indexOf(dish.category))
    this.setData({
      showEditor: true,
      editingId: dish.id,
      editorTitle: '编辑菜品',
      categoryIndex,
      form: {
        name: dish.name,
        price: String(dish.price),
        subtitle: dish.subtitle,
        category: dish.category,
        icon: dish.icon,
        imageUrl: dish.imageUrl || '',
        time: dish.time,
        available: dish.available !== false,
        ingredients: (dish.ingredients || []).map(item => ({
          ...item,
          quantity: item.unit === '适量' ? '' : String(item.quantity)
        }))
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
    const categoryIndex = Number(event.detail.value)
    this.setData({
      categoryIndex,
      'form.category': this.data.categories[categoryIndex]
    })
  },

  addIngredient() {
    const ingredients = [...this.data.form.ingredients, emptyIngredient()]
    this.setData({ 'form.ingredients': ingredients })
  },

  removeIngredient(event) {
    const index = Number(event.currentTarget.dataset.index)
    const ingredients = [...this.data.form.ingredients]
    if (!Number.isInteger(index) || index < 0 || index >= ingredients.length) return
    ingredients.splice(index, 1)
    this.setData({ 'form.ingredients': ingredients })
  },

  onIngredientInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    if (!Number.isInteger(index) || !field) return
    this.setData({ [`form.ingredients[${index}].${field}`]: event.detail.value })
  },

  onIngredientCategoryChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    const category = this.data.ingredientCategories[Number(event.detail.value)]
    if (!Number.isInteger(index) || !category) return
    this.setData({ [`form.ingredients[${index}].category`]: category })
  },

  onIngredientUnitChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    const unit = this.data.ingredientUnits[Number(event.detail.value)]
    if (!Number.isInteger(index) || !unit) return
    this.setData({
      [`form.ingredients[${index}].unit`]: unit,
      ...(unit === '适量'
        ? { [`form.ingredients[${index}].quantity`]: '' }
        : {})
    })
  },

  onIngredientOptionalChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index)) return
    this.setData({
      [`form.ingredients[${index}].optional`]: event.detail.value === true
    })
  },

  async chooseImage() {
    try {
      const result = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      const file = result.tempFiles && result.tempFiles[0]
      if (!file) return
      if (Number(file.size || 0) > 5 * 1024 * 1024) {
        wx.showToast({ title: '图片请小于 5MB', icon: 'none' })
        return
      }
      wx.showLoading({ title: '上传图片' })
      const uploaded = await menuService.uploadDishImage(file.tempFilePath)
      wx.hideLoading()
      if (!uploaded.ok) {
        wx.showToast({ title: '图片上传失败', icon: 'none' })
        return
      }
      this.setData({ 'form.imageUrl': uploaded.fileID })
    } catch (error) {
      wx.hideLoading()
    }
  },

  removeImage() {
    this.setData({ 'form.imageUrl': '' })
  },

  async toggleAvailable(event) {
    const dish = this.data.dishes.find(item => item.id === event.currentTarget.dataset.id)
    if (!dish) return
    const result = await menuService.updateDish(dish.id, {
      available: dish.available === false
    })
    if (!result.ok) {
      wx.showToast({ title: '状态更新失败', icon: 'none' })
      return
    }
    await this.loadDishes()
    wx.showToast({
      title: dish.available === false ? '已恢复供应' : '已设为暂停售罄',
      icon: 'none'
    })
  },

  async onDinnerTimeChange(event) {
    const expectedDinnerTime = event.detail.value
    const result = await menuService.updateSettings(expectedDinnerTime)
    if (!result.ok) {
      wx.showToast({ title: '开饭时间保存失败', icon: 'none' })
      return
    }
    app.globalData.menuMeta.expectedDinnerTime = expectedDinnerTime
    this.setData({ expectedDinnerTime })
    wx.showToast({ title: `预计 ${expectedDinnerTime} 开饭`, icon: 'none' })
  },

  toggleSortMode() {
    this.setData({
      sortMode: !this.data.sortMode,
      draggingId: ''
    })
  },

  onDragStart(event) {
    if (!this.data.sortMode) return
    this.setData({
      draggingId: event.currentTarget.dataset.id,
      draggingY: Number(event.currentTarget.dataset.y) || 0
    })
  },

  onDragChange(event) {
    if (
      !this.data.sortMode ||
      event.detail.source !== 'touch' ||
      event.currentTarget.dataset.id !== this.data.draggingId
    ) return
    this.setData({ draggingY: Number(event.detail.y) || 0 })
  },

  async onDragEnd() {
    if (!this.data.draggingId) return
    const dishes = [...this.data.dishes]
    const fromIndex = dishes.findIndex(item => item.id === this.data.draggingId)
    if (fromIndex < 0) {
      this.setData({ draggingId: '' })
      return
    }
    const targetIndex = Math.max(
      0,
      Math.min(
        dishes.length - 1,
        Math.round(this.data.draggingY / (this.dragStepPx || 95))
      )
    )
    if (fromIndex >= 0 && fromIndex !== targetIndex) {
      const [moved] = dishes.splice(fromIndex, 1)
      dishes.splice(targetIndex, 0, moved)
      const positioned = dishes.map((dish, index) => ({
        ...dish,
        dragY: index * (this.dragStepPx || 95)
      }))
      this.setData({ dishes: positioned, draggingId: '' })
      const result = await menuService.reorderDishes(positioned.map(item => item.id))
      if (!result.ok) {
        wx.showToast({ title: '排序保存失败', icon: 'none' })
        await this.loadDishes()
        return
      }
      app.globalData.dishes = positioned.map(({ dragY, ...dish }) => dish)
      wx.showToast({ title: '菜单顺序已保存', icon: 'none' })
      return
    }
    this.setData({
      [`dishes[${fromIndex}].dragY`]: fromIndex * (this.dragStepPx || 95),
      draggingId: ''
    })
  },

  async saveDish() {
    if (this.data.saving) return
    const name = String(this.data.form.name || '').trim()
    const price = Number(this.data.form.price)
    if (!name) {
      wx.showToast({ title: '请填写菜名', icon: 'none' })
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      wx.showToast({ title: '请填写正确金额', icon: 'none' })
      return
    }

    const ingredients = []
    for (const raw of this.data.form.ingredients) {
      const ingredientName = String(raw.name || '').trim()
      if (!ingredientName) {
        wx.showToast({ title: '请填写食材名称或删除空行', icon: 'none' })
        return
      }
      const unit = INGREDIENT_UNITS.includes(raw.unit) ? raw.unit : 'g'
      const quantity = unit === '适量' ? 0 : Number(raw.quantity)
      if (unit !== '适量' && (!Number.isFinite(quantity) || quantity <= 0)) {
        wx.showToast({ title: `请填写“${ingredientName}”的数量`, icon: 'none' })
        return
      }
      ingredients.push({
        id: raw.id || `ingredient-${Date.now()}-${ingredients.length}`,
        name: ingredientName,
        category: INGREDIENT_CATEGORIES.includes(raw.category) ? raw.category : '其他',
        quantity,
        unit,
        optional: raw.optional === true,
        note: String(raw.note || '').trim()
      })
    }

    const dish = {
      ...this.data.form,
      name,
      price,
      ingredients
    }
    this.setData({ saving: true })
    const result = this.data.editingId
      ? await menuService.updateDish(this.data.editingId, dish)
      : await menuService.createDish(dish)
    this.setData({ saving: false })

    if (!result.ok) {
      const messages = {
        forbidden: '只有大厨可以修改菜单',
        invalid_price: '金额格式不正确',
        name_required: '请填写菜名'
      }
      wx.showToast({
        title: messages[result.reason] || '保存失败，请稍后重试',
        icon: 'none'
      })
      return
    }

    this.setData({ showEditor: false })
    await this.loadDishes()
    wx.showToast({ title: this.data.editingId ? '菜品已更新' : '菜品已添加', icon: 'none' })
  },

  deleteDish(event) {
    const dish = this.data.dishes.find(item => item.id === event.currentTarget.dataset.id)
    if (!dish) return
    wx.showModal({
      title: `删除“${dish.name}”？`,
      content: '食客的菜单中也会立即移除这道菜。',
      confirmText: '删除',
      confirmColor: '#E75B43',
      success: async result => {
        if (!result.confirm) return
        const response = await menuService.deleteDish(dish.id)
        if (!response.ok) {
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' })
          return
        }
        app.globalData.cart = app.globalData.cart.filter(item => item.id !== dish.id)
        app.saveCart()
        await this.loadDishes()
        wx.showToast({ title: '菜品已删除', icon: 'none' })
      }
    })
  }
})
