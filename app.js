const defaultDishes = require('./data/dishes')
const accountService = require('./services/account')
const menuService = require('./services/menu')
const demo = require('./services/demo')

App({
  globalData: {
    dishes: defaultDishes,
    menuReady: false,
    menuMeta: {
      canManage: false,
      expectedDinnerTime: '19:00'
    },
    cart: [],
    account: {
      me: { nickname: '微信用户' },
      partner: null,
      inviteCode: '',
      inviteExpiresAt: null,
      pairedAt: null,
      cloudReady: false
    }
  },

  onLaunch() {
    this.globalData.cart = wx.getStorageSync('liangkou_cart') || []
    this.globalData.account = demo.enabled() ? demo.account() : accountService.getCachedAccount()
    this.refreshAccount()
  },

  async refreshAccount() {
    if (demo.enabled()) { this.globalData.account = demo.account(); return this.globalData.account }
    if (this.accountRequest) return this.accountRequest
    this.accountRequest = accountService.loadAccount().then(account => {
      this.globalData.account = demo.enabled() ? demo.account() : account
      return this.globalData.account
    }).finally(() => { this.accountRequest = null })
    return this.accountRequest
  },

  async saveNickname(nickname) {
    if (demo.enabled()) { const result = demo.saveNickname(nickname); if (result.account) this.globalData.account = result.account; return result }
    const result = await accountService.saveNickname(nickname)
    if (result.account) this.globalData.account = result.account
    return result
  },

  async saveRole(role) {
    if (demo.enabled()) return { ok:false,reason:'demo_mode' }
    const result = await accountService.saveRole(role)
    if (result.account) this.globalData.account = result.account
    return result
  },

  async savePreferences(preferences) {
    if (demo.enabled()) return { ok:false,reason:'demo_mode' }
    const result = await accountService.savePreferences(preferences)
    if (result.account) this.globalData.account = result.account
    return result
  },

  async refreshDishes() {
    const result = await menuService.loadMenu()
    if (result.ok && Array.isArray(result.dishes)) {
      this.globalData.dishes = result.dishes
      this.globalData.menuReady = true
      this.globalData.menuMeta = {
        canManage: result.canManage === true,
        expectedDinnerTime: result.expectedDinnerTime || '19:00'
      }
      return result
    }
    if (!this.globalData.menuReady) {
      this.globalData.dishes = defaultDishes
    }
    return {
      ok: false,
      reason: result.reason,
      dishes: this.globalData.dishes
    }
  },

  async createInvite() {
    if (demo.enabled()) return { ok:false,reason:'demo_mode' }
    const result = await accountService.createInvite()
    if (result.account) this.globalData.account = result.account
    return result
  },

  async bindPartner(inviteCode) {
    if (demo.enabled()) return { ok:false,reason:'demo_mode' }
    const result = await accountService.bindPartner(inviteCode)
    if (result.account) this.globalData.account = result.account
    return result
  },

  async revokeInvite() {
    if (demo.enabled()) return { ok:false,reason:'demo_mode' }
    const result = await accountService.revokeInvite()
    if (result.account) this.globalData.account = result.account
    return result
  },

  async regenerateInvite() {
    if (demo.enabled()) return { ok:false,reason:'demo_mode' }
    const result = await accountService.regenerateInvite()
    if (result.account) this.globalData.account = result.account
    return result
  },

  async unbindPartner() {
    if (demo.enabled()) return { ok:false,reason:'demo_mode' }
    const result = await accountService.unbindPartner()
    if (result.account) {
      this.globalData.account = result.account
      this.globalData.menuReady = false
      this.globalData.dishes = defaultDishes
      this.globalData.menuMeta = {
        canManage: false,
        expectedDinnerTime: '19:00'
      }
    }
    return result
  },

  async deleteAccount() {
    if (demo.enabled()) return { ok:false,reason:'demo_mode' }
    const result = await accountService.deleteAccount()
    if (result.ok) {
      [
        'liangkou_profile',
        'liangkou_account',
        'liangkou_cart',
        'liangkou_likes',
        'liangkou_notification_enabled',
        'liangkou_order_notes',
        'liangkou_last_order'
      ].forEach(key => wx.removeStorageSync(key))
      this.globalData.cart = []
      this.globalData.account = {
        me: { nickname: '微信用户' },
        partner: null,
        inviteCode: '',
        inviteExpiresAt: null,
        pairedAt: null,
        cloudReady: true
      }
    }
    return result
  },

  enterDemo() {
    this.globalData.account = demo.enter()
    wx.reLaunch({ url:'/pages/index/index' })
  },

  switchDemoRole() {
    if (!demo.enabled()) return
    this.globalData.account = demo.switchRole()
    const pages = getCurrentPages(), page = pages[pages.length - 1]
    wx.reLaunch({ url:'/' + (page && page.route || 'pages/index/index') })
  },

  exitDemo() {
    demo.exit()
    this.globalData.account = accountService.getCachedAccount()
    wx.reLaunch({ url:'/pages/us/us' })
  },

  resetDemo() {
    if (!demo.enabled()) return
    this.globalData.account = demo.reset()
    wx.reLaunch({ url:'/pages/us/us' })
  },

  saveCart() {
    wx.setStorageSync('liangkou_cart', this.globalData.cart)
  },

  addToCart(dishId) {
    const dish = this.globalData.dishes.find(item => item.id === dishId)
    if (!dish || dish.available === false) return false
    const current = this.globalData.cart.find(item => item.id === dishId)
    if (current) {
      current.quantity += 1
    } else {
      this.globalData.cart.push({ id: dishId, quantity: 1 })
    }
    this.saveCart()
    return true
  },

  updateCart(dishId, delta) {
    const current = this.globalData.cart.find(item => item.id === dishId)
    if (!current) return
    current.quantity += delta
    if (current.quantity <= 0) {
      this.globalData.cart = this.globalData.cart.filter(item => item.id !== dishId)
    }
    this.saveCart()
  },

  clearCart() {
    this.globalData.cart = []
    this.saveCart()
  },

  getCartSummary() {
    const { cart, dishes: allDishes } = this.globalData
    return cart.reduce((summary, item) => {
      const dish = allDishes.find(food => food.id === item.id)
      if (!dish) return summary
      summary.count += item.quantity
      summary.total += dish.price * item.quantity
      return summary
    }, { count: 0, total: 0 })
  },

  getSafeTop() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const top = (info.safeArea && info.safeArea.top) || info.statusBarHeight || 24
      return top + 10
    } catch (error) {
      return 54
    }
  },

  getHeaderTop() {
    try {
      const capsule = wx.getMenuButtonBoundingClientRect()
      return capsule.bottom + 10
    } catch (error) {
      return this.getSafeTop() + 18
    }
  }
})
