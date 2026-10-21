const app = getApp()
const release = require('../../config/release')

Page({
  data: {
    safeTop:54,release
  },

  onLoad() {
    this.setData({ safeTop: app.getHeaderTop() })
  },

  goBack() {
    wx.navigateBack({ fail:() => wx.switchTab({ url:'/pages/index/index' }) })
  },
  copyEmail() {
    if (!release.privacyEmail) { wx.showToast({ title:'维护者尚未配置联系邮箱',icon:'none' }); return }
    wx.setClipboardData({ data:release.privacyEmail })
  },
  openOfficialPrivacy() {
    if (!wx.openPrivacyContract) { wx.showToast({ title:'请更新微信后查看平台隐私指引',icon:'none' }); return }
    wx.openPrivacyContract({ fail:() => wx.showToast({ title:'平台隐私指引暂时无法打开，请联系店长',icon:'none' }) })
  },
  copyFilingQuery() {
    if (release.filingNumber) wx.setClipboardData({ data:release.filingNumber + '\n' + release.filingQueryUrl })
  }
})
