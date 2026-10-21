const demo = require('../../services/demo')
Component({
  data:{ enabled:false,roleLabel:'店长',nextRoleLabel:'宝宝' },
  lifetimes:{ attached() { this.refresh() } },
  pageLifetimes:{ show() { this.refresh() } },
  methods:{
    refresh() {
      const enabled = demo.enabled(), role = enabled ? demo.account().me.role : 'chef'
      this.setData({ enabled,roleLabel:role === 'chef' ? '店长' : '宝宝',nextRoleLabel:role === 'chef' ? '宝宝' : '店长' })
    },
    switchRole() { getApp().switchDemoRole() },
    exit() { getApp().exitDemo() }
  }
})
